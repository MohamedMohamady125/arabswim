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
import json
import os
import re
import urllib.request
from datetime import date, timedelta

from django.db.models import Avg, Count, F, Max, Q
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.models import Country, Event
from championships.models import Result, Championship
from medals.models import Medal
from records.models import Record


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
        men=Count('swimmer_id', distinct=True, filter=Q(swimmer__sex='M')),
        women=Count('swimmer_id', distinct=True, filter=Q(swimmer__sex='F')),
        avg_age=Avg('age_at_competition'),
    )
    agg['medals'] = _filtered_medals(request).count()
    agg['avg_fina'] = round(agg['avg_fina']) if agg['avg_fina'] else None
    agg['avg_age'] = round(agg['avg_age'], 1) if agg['avg_age'] else None
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


def _time_row(r):
    nat = r.nationality or r.swimmer.nationality
    return {
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
    }


@api_view(['GET'])
def top_times(request):
    """Fastest swims. With ?event= the list is ordered by time; without an
    event, swims aren't comparable so it orders by FINA points instead.
    ?best_per_swimmer=1 keeps only each swimmer's best swim.
    ?per_event=1 returns the top N *of every event* (grouped breakdown)."""
    qs = (_filtered_results(request)
          .filter(swimmer__is_relay_team=False)
          .select_related('swimmer', 'swimmer__nationality', 'event',
                          'championship', 'nationality'))
    limit = _limit(request)
    dedup = request.query_params.get('best_per_swimmer') in ('1', 'true')
    if request.query_params.get('per_event') in ('1', 'true'):
        # Top N per event: a section of rows for every event with data.
        rows = []
        event_ids = list(qs.order_by().values_list('event_id', flat=True)
                         .distinct())
        for ev in Event.objects.filter(id__in=event_ids).order_by(
                'is_relay', 'stroke', 'distance'):
            sub = qs.filter(event_id=ev.id).order_by('time_centiseconds')
            seen, n = set(), 0
            for r in sub.iterator(chunk_size=500):
                if dedup:
                    if r.swimmer_id in seen:
                        continue
                    seen.add(r.swimmer_id)
                rows.append(_time_row(r))
                n += 1
                if n >= limit:
                    break
        return Response(rows)
    has_event = bool(request.query_params.get('event'))
    if has_event:
        qs = qs.order_by('time_centiseconds')
    else:
        qs = qs.exclude(fina_points__isnull=True).order_by('-fina_points')
    rows, seen = [], set()
    for r in qs.iterator(chunk_size=2000):
        if dedup:
            k = (r.swimmer_id, r.event_id) if not has_event else r.swimmer_id
            if k in seen:
                continue
            seen.add(k)
        rows.append(_time_row(r))
        if len(rows) >= limit:
            break
    return Response(rows)


@api_view(['GET'])
def participation(request):
    """Result / swimmer counts grouped by meet, club, country, event or swimmer."""
    group = request.query_params.get('group', 'meet')
    qs = _filtered_results(request).filter(swimmer__is_relay_team=False)
    if group == 'swimmer':
        # Busiest swimmers: swims, meets and events attended.
        rows = (qs.values('swimmer_id',
                          **{'name': F('swimmer__name'),
                             'country_code': F('swimmer__nationality__code')})
                .annotate(results=Count('id'),
                          meets=Count('championship_id', distinct=True),
                          events=Count('event_id', distinct=True),
                          best_fina=Max('fina_points'))
                .order_by('-results'))[:_limit(request)]
        return Response([{'name': r['name'], 'swimmer_id': r['swimmer_id'],
                          'country_code': r['country_code'],
                          'results': r['results'], 'meets': r['meets'],
                          'events': r['events'], 'best_fina': r['best_fina']}
                         for r in rows])
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


@api_view(['GET'])
def records_report(request):
    """Record counts grouped by country, swimmer, event or record type.

    Extra filter: ?record_type=ARAB|NATIONAL|GCC|... — dates apply to the
    record's result_date; country matches the record's country (falling
    back to the swimmer's nationality for supra-national records).
    """
    p = request.query_params
    qs = Record.objects.all()
    if p.get('date_from'):
        qs = qs.filter(result_date__gte=p['date_from'])
    if p.get('date_to'):
        qs = qs.filter(result_date__lte=p['date_to'])
    if p.get('country'):
        c = p['country'].upper()
        qs = qs.filter(Q(country__code=c) |
                       Q(country__isnull=True, swimmer__nationality__code=c))
    if p.get('event'):
        qs = qs.filter(event_id=p['event'])
    if p.get('pool'):
        qs = qs.filter(pool=p['pool'])
    if p.get('gender'):
        qs = qs.filter(swimmer__sex=p['gender'])
    if p.get('record_type'):
        qs = qs.filter(record_type=p['record_type'].upper())

    group = p.get('group', 'swimmer')
    key_map = {
        'country': ('swimmer__nationality_id',
                    {'name': F('swimmer__nationality__name'),
                     'country_code': F('swimmer__nationality__code')}),
        'swimmer': ('swimmer_id',
                    {'name': F('swimmer__name'),
                     'country_code': F('swimmer__nationality__code')}),
        'event': ('event_id', {'name': F('event__name')}),
        'type': ('record_type', {'name': F('record_type')}),
    }
    key, extra = key_map.get(group, key_map['swimmer'])
    if group == 'country':
        qs = qs.filter(swimmer__nationality__isnull=False)
    rows = (qs.values(key, **extra)
            .annotate(records=Count('id'),
                      standing=Count('id', filter=Q(is_new=True)),
                      latest=Max('result_date'))
            .order_by('-records'))[:_limit(request)]
    out = []
    for r in rows:
        row = {'name': r['name'], 'records': r['records'],
               'standing': r['standing'], 'latest': r['latest']}
        if 'country_code' in r:
            row['country_code'] = r['country_code']
        if group == 'swimmer':
            row['swimmer_id'] = r['swimmer_id']
        out.append(row)
    return Response(out)


# ---------------------------------------------------------------------------
# Ask: natural language → query plan. The AI (or the regex fallback) ONLY
# picks filters — the numbers always come from the deterministic report
# queries above, so results stay 100% accurate.
# ---------------------------------------------------------------------------

VALID_TABS = {'overview', 'medals', 'times', 'participation', 'records'}
VALID_GROUPS = {
    'medals': {'country', 'club', 'swimmer'},
    'participation': {'meet', 'club', 'country', 'event', 'swimmer'},
    'records': {'country', 'swimmer', 'event', 'type'},
}
RECORD_TYPES = {'ARAB', 'NATIONAL', 'GCC', 'AFRICAN', 'ASIAN',
                'MEDITERRANEAN', 'ISLAMIC', 'WORLD'}
FILTER_KEYS = {'date_from', 'date_to', 'country', 'host_country', 'team',
               'event', 'pool', 'gender', 'age_min', 'age_max', 'record_type',
               'championship'}


def _validate_plan(raw):
    """Clamp an AI/heuristic plan to the exact filter vocabulary."""
    if not isinstance(raw, dict):
        return None
    plan = {'tab': raw.get('tab') if raw.get('tab') in VALID_TABS else 'times',
            'filters': {}}
    group = raw.get('group')
    if group and group in VALID_GROUPS.get(plan['tab'], set()):
        plan['group'] = group
    f = raw.get('filters') or {}
    for k in FILTER_KEYS & set(f):
        v = f[k]
        if v in (None, ''):
            continue
        if k in ('date_from', 'date_to'):
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(v)):
                plan['filters'][k] = str(v)
        elif k in ('country', 'host_country'):
            code = str(v).upper()
            if Country.objects.filter(code=code).exists():
                plan['filters'][k] = code
        elif k == 'event':
            try:
                if Event.objects.filter(id=int(v)).exists():
                    plan['filters'][k] = int(v)
            except (TypeError, ValueError):
                pass
        elif k == 'championship':
            try:
                meet = Championship.objects.filter(id=int(v)).first()
                if meet:
                    plan['filters'][k] = meet.id
                    plan['championship_name'] = meet.name
            except (TypeError, ValueError):
                pass
        elif k == 'pool':
            if str(v).upper() in ('LCM', 'SCM'):
                plan['filters'][k] = str(v).upper()
        elif k == 'gender':
            if str(v).upper() in ('M', 'F'):
                plan['filters'][k] = str(v).upper()
        elif k in ('age_min', 'age_max'):
            try:
                plan['filters'][k] = max(1, min(int(v), 99))
            except (TypeError, ValueError):
                pass
        elif k == 'record_type':
            if str(v).upper() in RECORD_TYPES:
                plan['filters'][k] = str(v).upper()
        elif k == 'team':
            plan['filters'][k] = str(v)[:80]
    try:
        plan['limit'] = max(1, min(int(raw.get('limit', 50)), 500))
    except (TypeError, ValueError):
        plan['limit'] = 50
    plan['best_per_swimmer'] = bool(raw.get('best_per_swimmer', True))
    plan['per_event'] = bool(raw.get('per_event')) and plan['tab'] == 'times'
    plan['summary'] = str(raw.get('summary', ''))[:300]
    return plan


def _ai_plan(question):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        return None
    events = ', '.join(f"{e['id']}={e['name']}"
                       for e in Event.objects.values('id', 'name'))
    codes = ', '.join(Country.objects.values_list('code', flat=True))
    meets = '; '.join(f"{c['id']}={c['name']} ({c['date']})"
                      for c in Championship.objects.order_by('-date')
                      .values('id', 'name', 'date'))
    system = f"""You translate swimming-analytics questions into a JSON query plan for the Arab Swim reports API. Today is {date.today().isoformat()}.

Respond with ONLY a JSON object, no prose, using this schema:
{{"tab": "overview|medals|times|participation|records",
 "group": "medals: country|club|swimmer; participation: meet|club|country|event|swimmer; records: country|swimmer|event|type; omit otherwise",
 "filters": {{"date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD", "country": "ISO-3 nationality code", "host_country": "ISO-3 code of where the meet was held", "team": "club name substring", "event": <event id integer>, "championship": <meet id integer, when the user names a specific meet>, "pool": "LCM|SCM", "gender": "M|F", "age_min": <int>, "age_max": <int>, "record_type": "ARAB|NATIONAL|GCC|AFRICAN|ASIAN|MEDITERRANEAN|ISLAMIC|WORLD"}},
 "limit": <int 1-500>,
 "best_per_swimmer": <true if each swimmer should appear once in top times, false to list every swim>,
 "per_event": <true ONLY when the user wants times broken down per event ("in each event", "for every event") — limit then means top N per event>,
 "summary": "one short sentence restating the query in plain English"}}

Rules:
- Only include filters the user actually asked for.
- Tabs: "times" = fastest swims, "medals" = medal tallies, "participation" = who swam most (meets/swims counts), "records" = record counts, "overview" = headline totals / "how many" counting questions.
- limit: use the number the user said; if they gave no number use 50 for times/participation and 20 for medals/records. Never invent a big limit.
- "medal table for clubs/by club" → tab medals, group club. "which swimmer won most medals" → tab medals, group swimmer.
- When the user names a specific meet (e.g. "the arab championships 2025"), set filters.championship to the matching meet id from the list below (match loosely on name and year). Don't also set dates or host_country in that case.

Examples:
Q: 10 fastest egyptians in each event
A: {{"tab":"times","filters":{{"country":"EGY"}},"limit":10,"per_event":true,"best_per_swimmer":true,"summary":"Top 10 Egyptian times in every event"}}
Q: medal table for clubs in tunisia meets this year
A: {{"tab":"medals","group":"club","filters":{{"host_country":"TUN","date_from":"{date.today().year}-01-01"}},"limit":20,"summary":"Medal table by club at meets in Tunisia this year"}}
Q: how many women swam in 2025
A: {{"tab":"overview","filters":{{"gender":"F","date_from":"2025-01-01","date_to":"2025-12-31"}},"summary":"Totals for women in 2025"}}
Q: fastest 5 in 50 free long course under 18
A: {{"tab":"times","filters":{{"event":<id of 50 M Freestyle>,"pool":"LCM","age_max":17}},"limit":5,"best_per_swimmer":true,"summary":"Top 5 U18 50m free LCM times"}}

Event ids: {events}
Country codes in the database: {codes}
Meet ids: {meets}"""
    body = json.dumps({
        'model': os.environ.get('OPENAI_MODEL', 'gpt-4o-mini'),
        'max_tokens': 400,
        'response_format': {'type': 'json_object'},
        'messages': [{'role': 'system', 'content': system},
                     {'role': 'user', 'content': question}],
    }).encode()
    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions', data=body,
        headers={'Authorization': f'Bearer {key}',
                 'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            text = json.load(resp)['choices'][0]['message']['content'].strip()
        text = re.sub(r'^```(?:json)?|```$', '', text, flags=re.M).strip()
        return _validate_plan(json.loads(text))
    except Exception:
        return None


# nationality adjectives → country name stems the regex fallback can match
def _match_country(q):
    for c in Country.objects.exclude(code='').values('code', 'name'):
        n = c['name'].lower()
        variants = {n, n + 'n', n + 'an', n + 'ian', n + 'i'}
        if n.endswith('o') or n.endswith('a'):
            variants.add(n[:-1] + 'an')  # morocco→moroccan, libya→libyan
        if ' ' in n:
            variants.add(n.split()[0])  # saudi arabia → saudi
        for v in variants:
            if re.search(r'\b' + re.escape(v) + r's?\b', q):
                return c['code']
    return None


def _heuristic_plan(question):
    """No-API-key fallback: regex parse of the most common question shapes."""
    q = question.lower()
    f = {}
    # top N
    m = re.search(r'(?:top|fastest|best|first)\s+(\d+)', q) or \
        re.search(r'\b(\d+)\s+(?:fastest|best|times|swimmers|swims)', q)
    limit = int(m.group(1)) if m else 50
    # relative dates
    m = re.search(r'last\s+(\d+)\s+(day|week|month|year)', q)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        days = n * {'day': 1, 'week': 7, 'month': 30, 'year': 365}[unit]
        f['date_from'] = (date.today() - timedelta(days=days)).isoformat()
    elif 'this year' in q:
        f['date_from'] = f'{date.today().year}-01-01'
    elif 'last year' in q:
        y = date.today().year - 1
        f['date_from'], f['date_to'] = f'{y}-01-01', f'{y}-12-31'
    else:
        m = re.search(r'\bin\s+(20\d{2})\b', q)
        if m:
            f['date_from'], f['date_to'] = f'{m.group(1)}-01-01', f'{m.group(1)}-12-31'
    # country / gender / pool
    code = _match_country(q)
    if code:
        f['country'] = code
    if re.search(r'\b(women|female|girls|ladies)\b', q):
        f['gender'] = 'F'
    elif re.search(r'\b(men|male|boys)\b', q):
        f['gender'] = 'M'
    if 'scm' in q or 'short course' in q:
        f['pool'] = 'SCM'
    elif 'lcm' in q or 'long course' in q:
        f['pool'] = 'LCM'
    # ages
    m = re.search(r'(?:under|u)\s*(\d{1,2})\b', q)
    if m:
        f['age_max'] = int(m.group(1)) - 1
    m = re.search(r'(?:over|above)\s*(\d{1,2})\b', q)
    if m:
        f['age_min'] = int(m.group(1))
    # event: distance + stroke
    dist = re.search(r'\b(50|100|200|400|800|1500)\s*m?\b', q)
    stroke = None
    for pat, s in [(r'free', 'Freestyle'), (r'back', 'Backstroke'),
                   (r'breast', 'Breaststroke'), (r'butterfly|\bfly\b', 'Butterfly'),
                   (r'medley|\bim\b', 'Individual Medley')]:
        if re.search(pat, q):
            stroke = s
            break
    if dist and stroke:
        ev = Event.objects.filter(distance=int(dist.group(1)), stroke=stroke,
                                  is_relay='relay' in q).first()
        if ev:
            f['event'] = ev.id
    # record type
    for rt in RECORD_TYPES:
        if rt.lower() + ' record' in q:
            f['record_type'] = rt
    # tab + group
    if 'medal' in q:
        tab = 'medals'
    elif 'record' in q:
        tab = 'records'
    elif re.search(r'particip|busiest|most active|most meets|most swims', q):
        tab = 'participation'
    elif re.search(r'overview|summary|totals?\b|how many', q):
        tab = 'overview'
    else:
        tab = 'times'
    per_event = bool(re.search(r'\b(?:in\s+)?(?:each|every|per|all)\s+events?\b', q))
    if per_event and tab == 'times':
        f.pop('event', None)
    plan = {'tab': tab, 'filters': f, 'limit': limit, 'best_per_swimmer': True,
            'per_event': per_event}
    m = re.search(r'(?:by|for)\s+(club|swimmer|country|event|meet|type)s?\b', q)
    if m:
        plan['group'] = m.group(1)
    elif tab == 'medals' and 'club' in q:
        plan['group'] = 'club'
    parts = []
    if tab == 'times':
        parts.append(f'top {limit} times' + (' per event' if per_event else ''))
    else:
        parts.append(tab)
    if f.get('country'):
        parts.append(f"for {f['country']}")
    if f.get('event'):
        parts.append(Event.objects.get(id=f['event']).name)
    if f.get('date_from'):
        parts.append(f"from {f['date_from']}")
    plan['summary'] = ' · '.join(parts)
    return _validate_plan(plan)


@api_view(['POST'])
def ask(request):
    question = str(request.data.get('question') or '').strip()[:500]
    if not question:
        return Response({'error': 'Ask a question first.'}, status=400)
    plan = _ai_plan(question) or _heuristic_plan(question)
    plan['ai'] = bool(os.environ.get('OPENAI_API_KEY'))
    return Response(plan)
