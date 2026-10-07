"""ArabSwim Lab endpoints.

Each view answers one "where do I sit in the field" question using the shared
engine. All reads are public (no write endpoints here), so the default
IsAdminOrReadOnly permission already allows GET for everyone.
"""
from statistics import mean, pstdev

from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Min

from championships.models import Result
from swimmers.models import Swimmer
from importer.parsers.base import format_centiseconds
from . import engine


# ---- shared helpers -------------------------------------------------------

STROKES = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly',
           'Individual Medley']


def _nat(result):
    return result.nationality or result.swimmer.nationality


def _swimmer_row(result, rank=None):
    """Standard ranking-row dict for a Result (mirrors RankingView)."""
    nat = _nat(result)
    row = {
        'result_id': result.id,
        'swimmer_id': result.swimmer_id,
        'swimmer_name': result.swimmer.name,
        'nationality': nat.name if nat else '',
        'nationality_code': nat.code if nat else '',
        'nationality_flag': nat.flag_url if nat else '',
        'age_at_competition': result.age_at_competition,
        'time': result.formatted_time,
        'time_centiseconds': result.time_centiseconds,
        'championship_id': result.championship_id,
        'championship_name': result.championship.name,
        'date': str(result.championship.date),
        'fina_points': result.fina_points,
    }
    if rank is not None:
        row['rank'] = rank
    return row


def _field_kw(request, swimmer=None):
    """Common field-scoping kwargs pulled from the query string."""
    scope = request.query_params.get('scope', 'arab')
    gender = request.query_params.get('gender')
    pool = request.query_params.get('pool')
    age_group = request.query_params.get('age_group')
    country = request.query_params.get('country')
    try:
        country = int(country) if country else None
    except (TypeError, ValueError):
        country = None
    # Default gender to the swimmer's own so a field is apples-to-apples.
    if gender is None and swimmer is not None:
        gender = swimmer.sex or None
    return dict(scope=scope, gender=gender, pool=pool,
                age_group=age_group, country=country)


def _best_event_id(swimmer):
    """The swimmer's strongest individual event by FINA points, else by most
    recent ranked swim. Returns an event_id or None."""
    ranked = (Result.objects
              .filter(swimmer=swimmer, is_hc=False, time_centiseconds__gt=0,
                      event__is_relay=False)
              .order_by('-fina_points', '-championship__date'))
    r = ranked.first()
    return r.event_id if r else None


def _pick_event(request, swimmer):
    try:
        ev = request.query_params.get('event')
        return int(ev) if ev else _best_event_id(swimmer)
    except (TypeError, ValueError):
        return _best_event_id(swimmer)


# ---- Swimmer DNA ----------------------------------------------------------

@api_view(['GET'])
def swimmer_dna(request, swimmer_id):
    """Stroke-balance radar: the swimmer's best percentile in each stroke,
    measured against the Arab field for every event they've swum."""
    swimmer = get_object_or_404(Swimmer, pk=swimmer_id)
    kw = _field_kw(request, swimmer)

    # Best individual time per event for this swimmer.
    best = (Result.objects
            .filter(swimmer=swimmer, is_hc=False, time_centiseconds__gt=0,
                    event__is_relay=False)
            .values('event_id', 'event__name', 'event__stroke')
            .annotate(best_time=Min('time_centiseconds'),
                      best_fina=Min('fina_points')))

    per_stroke = {s: None for s in STROKES}
    for b in best:
        stroke = b['event__stroke']
        if stroke not in per_stroke:
            continue
        pct = engine.percentile(b['event_id'], b['best_time'], **kw)
        if pct is None:
            continue
        entry = {
            'stroke': stroke,
            'event_id': b['event_id'],
            'event_name': b['event__name'],
            'percentile': pct,
            'time': format_centiseconds(b['best_time']),
            'time_centiseconds': b['best_time'],
            'fina_points': b['best_fina'],
        }
        cur = per_stroke[stroke]
        if cur is None or pct > cur['percentile']:
            per_stroke[stroke] = entry

    axes = []
    for s in STROKES:
        e = per_stroke[s]
        axes.append(e if e else {'stroke': s, 'percentile': 0, 'event_id': None,
                                 'event_name': '', 'time': '',
                                 'time_centiseconds': None, 'fina_points': None})

    scored = [a['percentile'] for a in axes if a['event_id']]
    return Response({
        'swimmer_id': swimmer.id,
        'swimmer_name': swimmer.name,
        'axes': axes,
        'versatility': round(mean(scored), 1) if scored else 0,
        'specialty': max(axes, key=lambda a: a['percentile'])['stroke'] if scored else None,
    })


# ---- The Chase / Beat the Clock ------------------------------------------

@api_view(['GET'])
def swimmer_chase(request, swimmer_id):
    """Next targets ahead, who's chasing from behind, and the milestone ranks
    that open up as the swimmer drops time."""
    swimmer = get_object_or_404(Swimmer, pk=swimmer_id)
    event_id = _pick_event(request, swimmer)
    if not event_id:
        return Response({'detail': 'No ranked individual swims for this swimmer.'},
                        status=404)
    kw = _field_kw(request, swimmer)

    rows = engine.best_rows(event_id, **kw)  # fastest first
    idx = next((i for i, r in enumerate(rows) if r['swimmer_id'] == swimmer.id), None)
    if idx is None:
        return Response({'detail': 'Swimmer not in this field.'}, status=404)

    my_time = rows[idx]['best_time']
    my_rank = idx + 1

    ahead = rows[max(0, idx - 5):idx]          # faster, just above
    behind = rows[idx + 1:idx + 6]             # slower, just below
    res = engine.fetch_results(
        event_id,
        [(r['swimmer_id'], r['best_time']) for r in ahead + behind], **kw)

    def pack(r, gap_sign):
        result = res.get(r['swimmer_id'])
        if not result:
            return None
        gap = abs(r['best_time'] - my_time)
        row = _swimmer_row(result, rank=rows.index(r) + 1)
        row['gap_centiseconds'] = gap
        row['gap'] = format_centiseconds(gap) if gap else '0.00'
        return row

    next_targets = [x for x in (pack(r, -1) for r in reversed(ahead)) if x]
    chasing_you = [x for x in (pack(r, 1) for r in behind) if x]

    # Unlock history: ranks worth chasing, and the time that would reach them.
    milestones = [m for m in (100, 50, 25, 10, 5, 3, 1) if m < my_rank]
    unlock = []
    for m in milestones:
        target = rows[m - 1]['best_time']          # time currently holding rank m
        drop = my_time - target
        unlock.append({
            'rank': m,
            'time_centiseconds': target,
            'time': format_centiseconds(target),
            'drop_centiseconds': drop,
            'drop': format_centiseconds(drop) if drop > 0 else '0.00',
        })

    return Response({
        'swimmer_id': swimmer.id,
        'swimmer_name': swimmer.name,
        'event_id': event_id,
        'my_rank': my_rank,
        'my_time': format_centiseconds(my_time),
        'my_time_centiseconds': my_time,
        'field_size': len(rows),
        'next_targets': next_targets,
        'chasing_you': chasing_you,
        'unlock_history': unlock,
    })


@api_view(['GET'])
def whatif(request):
    """Project the rank + percentile a hypothetical time would achieve.

    Query: event (required), time_centiseconds (required), plus field scope.
    Optional swimmer to report how many places they'd gain.
    """
    try:
        event_id = int(request.query_params.get('event'))
        time_cs = int(request.query_params.get('time_centiseconds'))
    except (TypeError, ValueError):
        return Response({'detail': 'event and time_centiseconds are required.'},
                        status=400)

    swimmer = None
    sid = request.query_params.get('swimmer')
    if sid:
        swimmer = Swimmer.objects.filter(pk=sid).first()
    kw = _field_kw(request, swimmer)

    rows = engine.best_rows(event_id, **kw)
    new_rank, field = engine.rank_for_time(event_id, time_cs, **kw)
    pct = engine.percentile(event_id, time_cs, **kw)

    out = {
        'event_id': event_id,
        'time_centiseconds': time_cs,
        'time': format_centiseconds(time_cs),
        'projected_rank': new_rank,
        'field_size': field,
        'percentile': pct,
    }
    if swimmer:
        idx = next((i for i, r in enumerate(rows)
                    if r['swimmer_id'] == swimmer.id), None)
        if idx is not None:
            out['current_rank'] = idx + 1
            out['current_time'] = format_centiseconds(rows[idx]['best_time'])
            out['places_gained'] = max(0, (idx + 1) - new_rank)
    return Response(out)


# ---- X-RAY (result level) -------------------------------------------------

@api_view(['GET'])
def result_xray(request, result_id):
    """Dissect one swim: its rank the day it was swum, its rank today, its
    percentile, and how it compares to the swimmer's personal best."""
    result = get_object_or_404(
        Result.objects.select_related('swimmer', 'event', 'championship'),
        pk=result_id)
    kw = _field_kw(request, result.swimmer)
    event_id = result.event_id
    t = result.time_centiseconds

    rank_now, field_now = engine.rank_for_time(event_id, t, **kw)
    rank_then, field_then = engine.rank_for_time(
        event_id, t, up_to_date=result.championship.date, **kw)
    pct = engine.percentile(event_id, t, **kw)

    pb = (Result.objects
          .filter(swimmer=result.swimmer, event_id=event_id,
                  is_hc=False, time_centiseconds__gt=0)
          .aggregate(best=Min('time_centiseconds'))['best'])
    pb_diff = t - pb if pb is not None else None

    return Response({
        'result_id': result.id,
        'swimmer_id': result.swimmer_id,
        'swimmer_name': result.swimmer.name,
        'event_id': event_id,
        'event_name': result.event.name,
        'time': result.formatted_time,
        'time_centiseconds': t,
        'date': str(result.championship.date),
        'championship_name': result.championship.name,
        'rank_now': rank_now,
        'field_now': field_now,
        'rank_at_date': rank_then,
        'field_at_date': field_then,
        'percentile': pct,
        'is_personal_best': pb is not None and t <= pb,
        'pb_diff_centiseconds': pb_diff,
        'pb_diff': (format_centiseconds(abs(pb_diff)) if pb_diff else '0.00'),
    })


# ---- Rivals / who-beat-whom ----------------------------------------------

@api_view(['GET'])
def swimmer_rivals(request, swimmer_id):
    """Head-to-head record vs every swimmer met in the same race (same meet,
    event, round and category)."""
    swimmer = get_object_or_404(Swimmer, pk=swimmer_id)
    my = list(Result.objects
              .filter(swimmer=swimmer, is_hc=False, time_centiseconds__gt=0)
              .values('championship_id', 'event_id', 'round_type', 'category',
                      'time_centiseconds'))
    if not my:
        return Response({'swimmer_id': swimmer.id, 'swimmer_name': swimmer.name,
                         'rivals': []})

    tally = {}  # opponent_id -> {wins, losses, meetings}
    for m in my:
        opps = (Result.objects
                .filter(championship_id=m['championship_id'],
                        event_id=m['event_id'], round_type=m['round_type'],
                        category=m['category'],
                        is_hc=False, time_centiseconds__gt=0)
                .exclude(swimmer=swimmer)
                .select_related('swimmer', 'swimmer__nationality'))
        for o in opps:
            t = tally.setdefault(o.swimmer_id, {
                'swimmer_id': o.swimmer_id,
                'swimmer_name': o.swimmer.name,
                'nationality_code': (o.swimmer.nationality.code
                                     if o.swimmer.nationality else ''),
                'nationality_flag': (o.swimmer.nationality.flag_url
                                     if o.swimmer.nationality else ''),
                'wins': 0, 'losses': 0, 'meetings': 0})
            t['meetings'] += 1
            if m['time_centiseconds'] < o.time_centiseconds:
                t['wins'] += 1
            elif m['time_centiseconds'] > o.time_centiseconds:
                t['losses'] += 1

    rivals = sorted(tally.values(),
                    key=lambda x: (-x['meetings'], -x['wins']))[:20]
    return Response({
        'swimmer_id': swimmer.id,
        'swimmer_name': swimmer.name,
        'rivals': rivals,
    })


# ---- Consistency / Championship Effect / Pressure ------------------------

@api_view(['GET'])
def swimmer_consistency(request, swimmer_id):
    """Consistency index (spread of times in the main event), plus the
    finals "pressure" effect: do they step up from prelims to finals?"""
    swimmer = get_object_or_404(Swimmer, pk=swimmer_id)
    event_id = _pick_event(request, swimmer)
    if not event_id:
        return Response({'detail': 'No ranked individual swims.'}, status=404)

    times = list(Result.objects
                 .filter(swimmer=swimmer, event_id=event_id,
                         is_hc=False, time_centiseconds__gt=0)
                 .values_list('time_centiseconds', flat=True))

    consistency_index = None
    cv = None
    if len(times) >= 2:
        m = mean(times)
        cv = (pstdev(times) / m) if m else 0
        # Swim times cluster tightly; 5% CV is already very inconsistent.
        consistency_index = max(0, round(100 * (1 - cv / 0.05)))

    # Pressure / Championship effect: prelim vs final in the same meet+event.
    prelim_rounds = {'Heats', 'Prelims'}
    rows = (Result.objects
            .filter(swimmer=swimmer, event_id=event_id,
                    is_hc=False, time_centiseconds__gt=0)
            .values('championship_id', 'round_type', 'time_centiseconds'))
    by_meet = {}
    for r in rows:
        by_meet.setdefault(r['championship_id'], {})[r['round_type']] = \
            r['time_centiseconds']
    deltas = []
    for meet, rounds in by_meet.items():
        final = rounds.get('Finals')
        prelim = next((rounds[k] for k in prelim_rounds if k in rounds), None)
        if final and prelim:
            deltas.append((prelim - final) / prelim)  # +ve = faster in final
    finals_effect = round(100 * mean(deltas), 2) if deltas else None

    return Response({
        'swimmer_id': swimmer.id,
        'swimmer_name': swimmer.name,
        'event_id': event_id,
        'swim_count': len(times),
        'consistency_index': consistency_index,
        'coefficient_of_variation': round(cv, 4) if cv is not None else None,
        'best_time': format_centiseconds(min(times)) if times else None,
        'average_time': format_centiseconds(round(mean(times))) if times else None,
        'finals_effect_pct': finals_effect,
        'finals_sample': len(deltas),
    })


# ---- 1% Club --------------------------------------------------------------

@api_view(['GET'])
def one_percent_club(request):
    """Swimmers whose event best is within 1% of the all-time leader."""
    try:
        event_id = int(request.query_params.get('event'))
    except (TypeError, ValueError):
        return Response({'detail': 'event is required.'}, status=400)
    kw = _field_kw(request)

    rows = engine.best_rows(event_id, **kw)
    if not rows:
        return Response({'event_id': event_id, 'leader_time': None, 'members': []})

    leader = rows[0]['best_time']
    threshold = leader * 1.01
    members_rows = [r for r in rows if r['best_time'] <= threshold]
    res = engine.fetch_results(
        event_id, [(r['swimmer_id'], r['best_time']) for r in members_rows], **kw)

    members = []
    for i, r in enumerate(members_rows):
        result = res.get(r['swimmer_id'])
        if not result:
            continue
        row = _swimmer_row(result, rank=i + 1)
        row['pct_off_leader'] = round(100 * (r['best_time'] - leader) / leader, 2)
        members.append(row)

    return Response({
        'event_id': event_id,
        'leader_time': format_centiseconds(leader),
        'threshold_time': format_centiseconds(round(threshold)),
        'members': members,
    })


# ---- Depth Ranking --------------------------------------------------------

@api_view(['GET'])
def depth_ranking(request):
    """Rank countries by event depth: how many strong swimmers each has,
    scored on their top-3 average time."""
    try:
        event_id = int(request.query_params.get('event'))
    except (TypeError, ValueError):
        return Response({'detail': 'event is required.'}, status=400)
    # Depth is cross-country, so force the Arab field (ignore national scope).
    kw = _field_kw(request)
    kw['scope'] = 'arab'
    kw['country'] = None

    rows = engine.best_rows(event_id, **kw)
    res = engine.fetch_results(
        event_id, [(r['swimmer_id'], r['best_time']) for r in rows], **kw)

    by_country = {}
    for r in rows:
        result = res.get(r['swimmer_id'])
        if not result:
            continue
        nat = _nat(result)
        if not nat:
            continue
        c = by_country.setdefault(nat.code, {
            'country': nat.name, 'country_code': nat.code,
            'country_flag': nat.flag_url, 'times': []})
        c['times'].append(r['best_time'])

    depth = []
    for c in by_country.values():
        ts = sorted(c['times'])
        top3 = ts[:3]
        depth.append({
            'country': c['country'],
            'country_code': c['country_code'],
            'country_flag': c['country_flag'],
            'swimmers': len(ts),
            'best_time': format_centiseconds(ts[0]),
            'top3_average': format_centiseconds(round(mean(top3))),
            'top3_average_cs': round(mean(top3)),
            'has_top3': len(ts) >= 3,
        })
    # Deepest first: full top-3 fields ahead of thin ones, then fastest top-3.
    depth.sort(key=lambda d: (not d['has_top3'], d['top3_average_cs']))
    for i, d in enumerate(depth):
        d['rank'] = i + 1

    return Response({'event_id': event_id, 'countries': depth})
