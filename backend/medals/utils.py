"""Olympic-style medal awarding with proper tie handling.

Ranks use competition ranking: tied times share the same rank and the
following rank(s) are skipped (1, 2, 2, 4). Medals follow the Olympic
swimming rules: a tie for gold produces two golds, no silver, and the
next swimmer gets bronze; a tie for silver produces two silvers and no
bronze; a tie for bronze produces multiple bronzes.

Medals awarded here always carry a ``result`` FK. Manually entered
medals (result is NULL) are never touched.
"""
from collections import defaultdict

from .models import Medal

_MEDAL_BY_RANK = {1: 'GOLD', 2: 'SILVER', 3: 'BRONZE'}


def _match_relay_swimmer(name, nationality_id):
    """Find the real Swimmer record for a relay leg name, preferring the
    relay team's nationality when several swimmers share a name."""
    from swimmers.models import Swimmer
    name = (name or '').strip()
    if not name:
        return None
    qs = Swimmer.objects.filter(is_relay_team=False, name__iexact=name)
    if nationality_id:
        match = qs.filter(nationality_id=nationality_id).first()
        if match:
            return match
    return qs.first()


def recompute_medals(championship):
    """Delete and re-award all result-backed medals for a championship.

    Returns the number of medals awarded.
    """
    Medal.objects.filter(championship=championship, result__isnull=False).delete()

    # Manually entered medals (result is NULL) take precedence: don't
    # auto-award a second medal to the same swimmer for the same event.
    manual = set(
        Medal.objects.filter(championship=championship, result__isnull=True)
        .values_list('swimmer_id', 'event_id')
    )

    results = (championship.results
               .filter(is_hc=False, is_manual=False)
               .select_related('swimmer')
               .order_by('time_centiseconds'))

    # National meets (e.g. Tunisia championships) run Finale A/B/C — each
    # finale has its own podium, so B/C finals also award medals.
    cls_name = championship.classification.name if championship.classification_id else ''
    is_national = cls_name in ('National', 'Other')

    groups = defaultdict(list)
    for r in results:
        groups[(r.event_id, r.swimmer.sex, r.category)].append(r)

    medals = []
    for group_rows in groups.values():
        rounds = {r.round_type for r in group_rows}
        award_sets = []
        if 'Finals' in rounds:
            award_sets.append([r for r in group_rows if r.round_type == 'Finals'])
            if is_national:
                cons = [r for r in group_rows if r.round_type == 'Consolation']
                if cons:
                    award_sets.append(cons)
        elif len(rounds) > 1:
            # Prelims/heats only from a multi-round meet: no final ranking.
            continue
        else:
            award_sets.append(group_rows)

        def award(r, medal_type):
            if (r.swimmer_id, r.event_id) in manual:
                return
            medals.append(Medal(
                swimmer=r.swimmer, championship=championship,
                event_id=r.event_id, medal_type=medal_type, result=r,
            ))
            # Relays: each athlete on the squad also gets an individual
            # medal, so a relay counts once per swimmer in personal and
            # team/country tallies.
            if r.swimmer.is_relay_team:
                seen = set()
                for leg in (r.relay_swimmers or []):
                    s = _match_relay_swimmer(leg.get('name'), r.swimmer.nationality_id)
                    if not s or s.id in seen:
                        continue
                    if (s.id, r.event_id) in manual:
                        continue
                    seen.add(s.id)
                    medals.append(Medal(
                        swimmer=s, championship=championship,
                        event_id=r.event_id, medal_type=medal_type, result=r,
                    ))

        for rows in award_sets:
            if any(r.original_rank for r in rows):
                # The source PDF's placement is authoritative: a swimmer who
                # placed 5th keeps rank 5 even after other (e.g. non-Arab)
                # results were deleted, so nobody inherits a podium spot.
                for r in rows:
                    medal_type = _MEDAL_BY_RANK.get(r.original_rank)
                    if medal_type is not None:
                        award(r, medal_type)
                continue

            # Legacy results without a stored source rank: competition
            # ranking recomputed from times.
            for i, r in enumerate(rows):
                # Competition rank: 1 + number of strictly faster times.
                rank = next(j for j, x in enumerate(rows)
                            if x.time_centiseconds == r.time_centiseconds) + 1
                medal_type = _MEDAL_BY_RANK.get(rank)
                if medal_type is None:
                    break  # rows are time-sorted; no more medals in this group
                award(r, medal_type)

    Medal.objects.bulk_create(medals)
    return len(medals)
