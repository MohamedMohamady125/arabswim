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

# Explicitly preliminary rounds never decide a podium — the final may live
# in a separate source file not yet imported (Egypt releases heats as
# several PDFs). Timed-final events carry 'Finals' or a blank round.
_PRELIM_ROUNDS = {'Prelims', 'Heats', 'Semifinals'}


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

    def award(r, medal_type, scope='CATEGORY'):
        if (r.swimmer_id, r.event_id) in manual:
            return
        medals.append(Medal(
            swimmer=r.swimmer, championship=championship,
            event_id=r.event_id, medal_type=medal_type, result=r, scope=scope,
            nationality_id=r.nationality_id or r.swimmer.nationality_id,
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
                    scope=scope,
                    nationality_id=r.nationality_id or s.nationality_id,
                ))

    # Double podium (meets with foreign guest swimmers): guests medal from
    # the overall ranking, while host-country swimmers get their own
    # parallel podium — a guest gold does not cost the best host swimmer
    # their national title. Each swimmer medals from exactly one ranking,
    # so nobody is counted twice.
    host_country_id = (championship.country_id
                       if championship.has_double_podium else None)

    def award_podium(rows, scope='CATEGORY', source_rank=True):
        if host_country_id:
            host = [r for r in rows
                    if r.swimmer.nationality_id == host_country_id]
            guests = [r for r in rows
                      if r.swimmer.nationality_id != host_country_id]
            if host and guests:
                _award_ranked(guests, scope, keep_source_rank=source_rank)
                _award_ranked(host, scope)
                return
        _award_ranked(rows, scope, keep_source_rank=source_rank)

    def _award_ranked(rows, scope, keep_source_rank=False):
        if keep_source_rank and any(r.original_rank for r in rows):
            # The source PDF's placement is authoritative: a swimmer who
            # placed 5th keeps rank 5 even after other (e.g. non-Arab)
            # results were deleted, so nobody inherits a podium spot.
            for r in rows:
                medal_type = _MEDAL_BY_RANK.get(r.original_rank)
                if medal_type is not None:
                    award(r, medal_type, scope=scope)
            return

        # Competition ranking recomputed from times (legacy results with
        # no stored source rank, and host-only double podiums where the
        # source rank mixes hosts with guests).
        rows = sorted(rows, key=lambda r: r.time_centiseconds)
        for r in rows:
            rank = next(j for j, x in enumerate(rows)
                        if x.time_centiseconds == r.time_centiseconds) + 1
            medal_type = _MEDAL_BY_RANK.get(rank)
            if medal_type is None:
                break  # rows are time-sorted; no more medals in this group
            award(r, medal_type, scope=scope)

    # Events (per gender) that ran a final somewhere in this meet. A
    # heats-only *category* of such an event is a real podium (small
    # Tunisian categories swim Séries only); a heats-only *event* means
    # the finals file simply hasn't been imported yet (Egypt releases
    # heats as several PDFs) — award nothing until it arrives.
    finals_events = {(r.event_id, r.swimmer.sex) for r in results
                     if r.round_type == 'Finals'}

    for (event_id, sex, _category), group_rows in groups.items():
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
        elif rounds <= _PRELIM_ROUNDS and (event_id, sex) not in finals_events:
            # Heats/semis of an event with no final yet: phantom medals.
            continue
        else:
            award_sets.append(group_rows)

        for rows in award_sets:
            award_podium(rows)

    # TC ("toutes catégories") national meets award one extra open podium
    # per event across all age categories, on top of the per-category
    # podiums — the same swim can earn both a category and an open medal.
    # The open ranking is recomputed from times (original_rank is
    # per-category), pooling Finale A/B so every finalist competes.
    if is_national and championship.has_open_podium:
        open_groups = defaultdict(list)
        for r in results:
            open_groups[(r.event_id, r.swimmer.sex)].append(r)
        for group_rows in open_groups.values():
            rounds = {r.round_type for r in group_rows}
            if 'Finals' in rounds:
                rows = [r for r in group_rows
                        if r.round_type in ('Finals', 'Consolation')]
            elif len(rounds) > 1 or rounds <= _PRELIM_ROUNDS:
                continue
            else:
                rows = group_rows
            # Open podium always re-ranks from times (original_rank is
            # per-category); the double-podium split still applies.
            award_podium(rows, scope='OPEN', source_rank=False)

    Medal.objects.bulk_create(medals)
    return len(medals)
