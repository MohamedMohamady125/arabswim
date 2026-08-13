"""Cross-meet analytics for the public Reports page.

Every endpoint shares one filter vocabulary so the Arab Swim analytics
IG pages can slice the whole database any way they need:

    date_from / date_to   championship dates (YYYY-MM-DD)
    championship          single meet id
    classification        classification id
    country               ISO-3 code the swim was represented under
    host_country          ISO-3 code of the meet's host country
    team                  club name (case-insensitive substring)
    event                 event id
    pool                  LCM / SCM
    gender                M / F
    age_min / age_max     swimmer age at competition
    round                 Finals / Prelims / ...
    limit                 rows to return (default 50, max 500)

All read-only aggregations over indexed FKs — no new models.
"""
from django.db.models import Avg, Count, F, Max, Q
from rest_framework.decorators import api_view
from rest_framework.response import Response

from championships.models import Result, Championship
from medals.models import Medal


def _limit(request, default=50, cap=500):
    try:
        return max(1, min(int(request.query_params.get('limit', default)), cap))
    except (TypeError, ValueError):
        return default


def _filtered_results(request):
    p = request.query_params
    qs = Result.objects.filter(time_centiseconds__gt=0, is_hc=False)
    if p.get('date_from'):
        qs = qs.filter(championship__date__gte=p['date_from'])
    if p.get('date_to'):
        qs = qs.filter(championship__date__lte=p['date_to'])
    if p.get('championship'):
        qs = qs.filter(championship_id=p['championship'])
    if p.get('classification'):
        qs = qs.filter(championship__classification_id=p['classification'])
    if p.get('country'):
        qs = qs.filter(nationality__code=p['country'].upper())
    if p.get('host_country'):
        qs = qs.filter(championship__country__code=p['host_country'].upper())
    if p.get('team'):
        qs = qs.filter(team__icontains=p['team'])
    if p.get('event'):
        qs = qs.filter(event_id=p['event'])
    if p.get('pool'):
        qs = qs.filter(championship__pool=p['pool'])
    if p.get('gender'):
        qs = qs.filter(swimmer__sex=p['gender'])
    if p.get('age_min'):
        qs = qs.filter(age_at_competition__gte=p['age_min'])
    if p.get('age_max'):
        qs = qs.filter(age_at_competition__lte=p['age_max'])
    if p.get('round'):
        qs = qs.filter(round_type=p['round'])
    return qs


def _filtered_medals(request):
    p = request.query_params
    qs = Medal.objects.all()
    if p.get('date_from'):
        qs = qs.filter(championship__date__gte=p['date_from'])
    if p.get('date_to'):
        qs = qs.filter(championship__date__lte=p['date_to'])
    if p.get('championship'):
        qs = qs.filter(championship_id=p['championship'])
    if p.get('classification'):
        qs = qs.filter(championship__classification_id=p['classification'])
    if p.get('country'):
        qs = qs.filter(nationality__code=p['country'].upper())
    if p.get('host_country'):
        qs = qs.filter(championship__country__code=p['host_country'].upper())
    if p.get('team'):
        qs = qs.filter(result__team__icontains=p['team'])
    if p.get('event'):
        qs = qs.filter(event_id=p['event'])
    if p.get('pool'):
        qs = qs.filter(championship__pool=p['pool'])
    if p.get('gender'):
        qs = qs.filter(swimmer__sex=p['gender'])
    if p.get('scope'):
        qs = qs.filter(scope=p['scope'].upper())
    return qs


@api_view(['GET'])
def overview(request):
    """Headline totals for the current filter selection."""
    rs = _filtered_results(request)
    individual = rs.filter(swimmer__is_relay_team=False)
    agg = individual.aggregate(
        results=Count('id'),
        swimmers=Count('swimmer_id', distinct=True),
        meets=Count('championship_id', distinct=True),
        clubs=Count('team', distinct=True, filter=~Q(team='')),
        countries=Count('nationality_id', distinct=True,
                        filter=Q(nationality__isnull=False)),
        events=Count('event_id', distinct=True),
        best_fina=Max('fina_points'),
        avg_fina=Avg('fina_points'),
    )
    agg['medals'] = _filtered_medals(request).count()
    agg['avg_fina'] = round(agg['avg_fina']) if agg['avg_fina'] else None
    return Response(agg)


@api_view(['GET'])
def medal_table(request):
    """Medal tally grouped by country, club or swimmer (?group=...)."""
    group = request.query_params.get('group', 'country')
    qs = _filtered_medals(request)
    if group == 'club':
        qs = qs.exclude(result__team='').exclude(result__isnull=True)
        key, name_expr = 'result__team', {'name': F('result__team')}
    elif group == 'swimmer':
        qs = qs.filter(swimmer__is_relay_team=False)
        key = 'swimmer_id'
        name_expr = {'name': F('swimmer__name'),
                     'swimmer_id_': F('swimmer_id'),
                     'country_code': F('swimmer__nationality__code'),
                     'country_name': F('swimmer__nationality__name')}
    else:  # country
        qs = qs.filter(nationality__isnull=False)
        key = 'nationality_id'
        name_expr = {'name': F('nationality__name'),
                     'country_code': F('nationality__code')}
    rows = (qs.values(key, **name_expr)
            .annotate(gold=Count('id', filter=Q(medal_type='GOLD')),
                      silver=Count('id', filter=Q(medal_type='SILVER')),
                      bronze=Count('id', filter=Q(medal_type='BRONZE')),
                      total=Count('id'))
            .order_by('-gold', '-silver', '-bronze'))[:_limit(request)]
    out = []
    for r in rows:
        row = {'name': r['name'], 'gold': r['gold'], 'silver': r['silver'],
               'bronze': r['bronze'], 'total': r['total']}
        if 'country_code' in r:
            row['country_code'] = r['country_code']
        if 'country_name' in r:
            row['country_name'] = r['country_name']
        if 'swimmer_id_' in r:
            row['swimmer_id'] = r['swimmer_id_']
        out.append(row)
    return Response(out)


@api_view(['GET'])
def top_times(request):
    """Fastest swims. With ?event= the list is ordered by time; without an
    event, swims aren't comparable so it orders by FINA points instead.
    ?best_per_swimmer=1 keeps only each swimmer's best swim."""
    qs = (_filtered_results(request)
          .filter(swimmer__is_relay_team=False)
          .select_related('swimmer', 'swimmer__nationality', 'event',
                          'championship', 'nationality'))
    has_event = bool(request.query_params.get('event'))
    if has_event:
        qs = qs.order_by('time_centiseconds')
    else:
        qs = qs.exclude(fina_points__isnull=True).order_by('-fina_points')
    limit = _limit(request)
    dedup = request.query_params.get('best_per_swimmer') in ('1', 'true')
    rows, seen = [], set()
    for r in qs.iterator(chunk_size=2000):
        if dedup:
            k = (r.swimmer_id, r.event_id) if not has_event else r.swimmer_id
            if k in seen:
                continue
            seen.add(k)
        nat = r.nationality or r.swimmer.nationality
        rows.append({
            'swimmer_id': r.swimmer_id,
            'swimmer_name': r.swimmer.name,
            'country_code': nat.code if nat else None,
            'country_name': nat.name if nat else None,
            'event_id': r.event_id,
            'event_name': r.event.name,
            'time_centiseconds': r.time_centiseconds,
            'fina_points': r.fina_points,
            'age': r.age_at_competition,
            'team': r.team,
            'round': r.round_type,
            'championship_id': r.championship_id,
            'championship_name': r.championship.name,
            'date': r.championship.date,
            'pool': r.championship.pool,
        })
        if len(rows) >= limit:
            break
    return Response(rows)


@api_view(['GET'])
def participation(request):
    """Result / swimmer counts grouped by meet, club, country or event."""
    group = request.query_params.get('group', 'meet')
    qs = _filtered_results(request).filter(swimmer__is_relay_team=False)
    key_map = {
        'meet': ('championship_id', {'name': F('championship__name'),
                                     'date': F('championship__date'),
                                     'pool': F('championship__pool')}),
        'club': ('team', {'name': F('team')}),
        'country': ('nationality_id', {'name': F('nationality__name'),
                                       'country_code': F('nationality__code')}),
        'event': ('event_id', {'name': F('event__name')}),
    }
    key, extra = key_map.get(group, key_map['meet'])
    if group == 'club':
        qs = qs.exclude(team='')
    if group == 'country':
        qs = qs.filter(nationality__isnull=False)
    rows = (qs.values(key, **extra)
            .annotate(results=Count('id'),
                      swimmers=Count('swimmer_id', distinct=True),
                      clubs=Count('team', distinct=True, filter=~Q(team='')),
                      best_fina=Max('fina_points'))
            .order_by('-swimmers'))[:_limit(request)]
    out = []
    for r in rows:
        row = {'name': r['name'], 'results': r['results'],
               'swimmers': r['swimmers'], 'clubs': r['clubs'],
               'best_fina': r['best_fina']}
        if group == 'meet':
            row.update(championship_id=r['championship_id'],
                       date=r['date'], pool=r['pool'])
        if 'country_code' in r:
            row['country_code'] = r['country_code']
        out.append(row)
    return Response(out)
