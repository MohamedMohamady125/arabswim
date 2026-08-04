"""Age-category inference for national meets imported from TC files.

Some source files (e.g. Tunisian "toutes catégories" result files) publish
certain events only as an open ranking with no age category, while every
other event in the meet is categorized. Those blank-category swims break the
meet's per-category podiums: the results table lumps every age group into
"General" and medals only go to the overall top 3.

The meet itself contains everything needed to fix this:
1. A swimmer who swam categorized events in the same meet keeps that
   category in the open events too.
2. Failing that, the meet's own (sex, age) → category mapping — built from
   its categorized results — identifies the category, as long as it is
   unambiguous.

After assigning categories, the merged open ranking stored in
``original_rank`` (1..N across all age groups) is re-ranked per category so
medal recomputation awards each category its own podium.

Runs automatically after every import (see importer.services.confirm_import)
and from the admin recompute-medals action, so re-importing a meet from the
same files can never bring the problem back.
"""
from collections import Counter, defaultdict


def infer_blank_categories(championship):
    """Fill in blank categories on individual results of a National/Other
    meet from the meet's own categorized results, then re-rank affected
    finals per category. Returns the number of results updated."""
    from .models import Result

    cls_name = championship.classification.name if championship.classification_id else ''
    if cls_name not in ('National', 'Other'):
        return 0

    # Relay rows are excluded: their "swimmer" is a club placeholder and an
    # open (TC) relay is genuinely uncategorized.
    results = list(championship.results
                   .filter(swimmer__is_relay_team=False)
                   .select_related('swimmer'))
    categorized = [r for r in results if r.category]
    blanks = [r for r in results if not r.category]
    if not categorized:
        return 0
    if not blanks:
        # Nothing to infer, but a TC meet may still carry merged source
        # ranks on categorized rows (rows created from the TC file first,
        # then categorized by the dedupe when the per-category file merged
        # in) — e.g. a Benjamins girl ranked 32nd overall who is 1st in
        # her category. Re-rank so every category keeps its podium.
        if championship.has_open_podium:
            _rerank_tc_groups(championship)
        return 0

    # Categorized meet + a TC (open) file in the same import is the
    # signature of meets that award an extra open podium per event on top
    # of the per-category podiums (see medals.utils.recompute_medals).
    if not championship.has_open_podium:
        championship.has_open_podium = True
        championship.save(update_fields=['has_open_podium'])

    swimmer_cats = defaultdict(set)
    age_cats = defaultdict(Counter)
    for r in categorized:
        swimmer_cats[r.swimmer_id].add(r.category)
        if r.age_at_competition:
            age_cats[(r.swimmer.sex, r.age_at_competition)][r.category] += 1

    changed = []
    for r in blanks:
        cats = swimmer_cats.get(r.swimmer_id)
        if cats and len(cats) == 1:
            r.category = next(iter(cats))
        else:
            counter = age_cats.get((r.swimmer.sex, r.age_at_competition))
            # Only trust the age map when this meet puts that age in exactly
            # one category — never guess across ambiguous boundaries.
            if counter and len(counter) == 1:
                r.category = next(iter(counter))
            else:
                continue
        changed.append(r)
    if changed:
        Result.objects.bulk_update(changed, ['category'])

    # Source ranks on TC-meet rows come from the merged open ranking
    # (1..N across all categories) — kept as-is they would deny podiums
    # to everyone outside the overall top 3. Re-rank per category.
    _rerank_tc_groups(championship)
    return len(changed)


def _rerank_tc_groups(championship):
    """Re-rank every per-category group of a TC meet by time (competition
    ranking, ties share). Covers finals plus heats-only categories — small
    categories (e.g. Benjamins) often swim Séries only, and their Séries
    classement IS their podium. Heats below a final are left alone."""
    from .models import Result

    rows = [r for r in championship.results.select_related('swimmer')
            if r.category and not r.is_hc]
    groups = defaultdict(list)
    for r in rows:
        groups[(r.event_id, r.swimmer.sex, r.category, r.round_type)].append(r)
    finals_cats = {(e, s, c) for (e, s, c, rt) in groups
                   if rt in ('Finals', 'Consolation')}
    reranked = []
    for (e, s, c, rt), group in groups.items():
        if rt not in ('Finals', 'Consolation') and (e, s, c) in finals_cats:
            continue  # prelims below a final: rank has no podium meaning
        group.sort(key=lambda r: r.time_centiseconds or 0)
        for r in group:
            rank = next(i for i, x in enumerate(group)
                        if x.time_centiseconds == r.time_centiseconds) + 1
            if r.original_rank != rank:
                r.original_rank = rank
                reranked.append(r)
    if reranked:
        Result.objects.bulk_update(reranked, ['original_rank'])
    return len(reranked)
