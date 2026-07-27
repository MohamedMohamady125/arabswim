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
               .filter(is_hc=False)
               .select_related('swimmer')
               .order_by('time_centiseconds'))

    groups = defaultdict(list)
    for r in results:
        groups[(r.event_id, r.swimmer.sex, r.category)].append(r)

    medals = []
    for rows in groups.values():
        rounds = {r.round_type for r in rows}
        if 'Finals' in rounds:
            rows = [r for r in rows if r.round_type == 'Finals']
        elif len(rounds) > 1:
            # Prelims/heats only from a multi-round meet: no final ranking.
            continue

        for i, r in enumerate(rows):
            # Competition rank: 1 + number of strictly faster times.
            rank = next(j for j, x in enumerate(rows)
                        if x.time_centiseconds == r.time_centiseconds) + 1
            medal_type = _MEDAL_BY_RANK.get(rank)
            if medal_type is None:
                break  # rows are time-sorted; no more medals in this group
            if (r.swimmer_id, r.event_id) in manual:
                continue
            medals.append(Medal(
                swimmer=r.swimmer, championship=championship,
                event_id=r.event_id, medal_type=medal_type, result=r,
            ))

    Medal.objects.bulk_create(medals)
    return len(medals)
