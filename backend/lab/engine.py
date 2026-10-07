"""Shared ranking engine for ArabSwim Lab.

Every Lab feature answers a question about where a swim sits inside the
national/Arab field for one event. They all lean on the same "best time per
swimmer" leaderboard that powers rankings/views.py, so that logic lives here
once and the views stay thin.

Filtering rules mirror RankingView exactly: only ranked swims
(is_hc=False, time > 0), never OTHER-region nationalities, and the represented
nationality on the result wins over the swimmer's current one.
"""
from django.db.models import Min, Q
from championships.models import Result


def base_qs(event_id, scope='arab', gender=None, pool=None, age_group=None,
            country=None, up_to_date=None):
    """Filtered Result queryset for one event, matching RankingView rules."""
    qs = (Result.objects
          .select_related('swimmer', 'swimmer__nationality', 'nationality',
                          'championship', 'championship__country', 'event')
          .filter(event_id=event_id, is_hc=False, time_centiseconds__gt=0)
          .exclude(nationality__region='OTHER'))

    if scope == 'national' and country:
        qs = qs.filter(nationality_id=country)
    elif scope == 'gcc':
        qs = qs.filter(nationality__region='GCC')
    elif scope == 'arab':
        qs = qs.filter(nationality__region__in=['ARAB', 'GCC'])

    if gender:
        qs = qs.filter(swimmer__sex=gender)
    if pool:
        qs = qs.filter(championship__pool=pool)
    if age_group and age_group != 'OPEN':
        try:
            qs = qs.filter(age_at_competition__lte=int(age_group.replace('U', '')))
        except (ValueError, AttributeError):
            pass
    if up_to_date is not None:
        qs = qs.filter(championship__date__lte=up_to_date)
    return qs


def best_rows(event_id, **kw):
    """Best (minimum) time per swimmer for an event, fastest first.

    Returns a list of dicts: {'swimmer_id', 'best_time'} already ranked.
    """
    qs = base_qs(event_id, **kw)
    rows = list(qs.values('swimmer_id')
                .annotate(best_time=Min('time_centiseconds'))
                .order_by('best_time', 'swimmer_id'))
    return rows


def rank_for_time(event_id, time_cs, **kw):
    """Rank a given time would hold in the field, and the field size.

    Rank = 1 + number of DISTINCT swimmers whose best time is strictly
    faster. Ties share the next rank up (standard competition ranking is
    overkill here — a faster field position is what the user cares about).
    """
    rows = best_rows(event_id, **kw)
    faster = sum(1 for r in rows if r['best_time'] < time_cs)
    return faster + 1, len(rows)


def percentile(event_id, time_cs, **kw):
    """Percentile of a time in the field (100 = fastest, 0 = slowest).

    Share of the field this time is faster than or equal to.
    """
    rows = best_rows(event_id, **kw)
    n = len(rows)
    if n == 0:
        return None
    at_or_slower = sum(1 for r in rows if r['best_time'] >= time_cs)
    return round(100.0 * at_or_slower / n, 1)


def fetch_results(event_id, swimmer_best, **kw):
    """Fetch the actual Result row backing each (swimmer_id, best_time).

    `swimmer_best` is an iterable of (swimmer_id, best_time) pairs. Returns
    {swimmer_id: Result} keeping the first row seen per swimmer.
    """
    pairs = list(swimmer_best)
    if not pairs:
        return {}
    row_filter = Q(pk__in=[])
    for sid, bt in pairs:
        row_filter |= Q(swimmer_id=sid, time_centiseconds=bt)
    by_swimmer = {}
    for r in base_qs(event_id, **kw).filter(row_filter):
        by_swimmer.setdefault(r.swimmer_id, r)
    return by_swimmer
