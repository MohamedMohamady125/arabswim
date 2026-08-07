"""Medal prediction engine.

Monte Carlo simulation of every individual event at an upcoming
championship. Each swimmer's race time is sampled from a normal
distribution centred on a blend of season best / recent form /
progression; ranking the samples per simulation yields medal
probabilities instead of deterministic "3rd seed = bronze" calls.
"""
import random
import statistics
from datetime import date, timedelta

from django.conf import settings
from django.db.models import Q

from championships.models import Result
from .models import PredictionAgeGroup, PredictionEntry

N_SIMS = 2000
FIELD_CAP = 16
LOOKBACK_MONTHS = 18       # activity window for the automatic (EARLY) field
HISTORY_MONTHS = 30        # stats window (covers previous season for progression)


def _fmt(cs):
    cs = int(round(cs))
    minutes = cs // 6000
    seconds = (cs % 6000) // 100
    centis = cs % 100
    if minutes:
        return f'{minutes}:{seconds:02d}.{centis:02d}'
    return f'{seconds}.{centis:02d}'


def medal_status(p_medal):
    p = p_medal * 100
    if p >= 80:
        return 'Medal Favorite'
    if p >= 65:
        return 'Strong Medal Chance'
    if p >= 45:
        return 'Medal Contender'
    if p >= 25:
        return 'Podium Challenger'
    if p >= 10:
        return 'Outside Chance'
    return 'Unlikely to Medal'


def gold_status(p_gold):
    p = p_gold * 100
    if p >= 50:
        return 'Gold Favorite'
    if p >= 25:
        return 'Gold Contender'
    return None


def _scope_filter(championship):
    """Which swimmers can appear at this meet."""
    name = championship.classification.name if championship.classification else ''
    if name == 'National' and championship.country_id:
        return Q(swimmer__nationality_id=championship.country_id)
    if name == 'GCC':
        return Q(swimmer__nationality__region='GCC')
    # Arab (default): any Arab-region nation incl. GCC
    return Q(swimmer__nationality__region__in=['ARAB', 'GCC'])


class SwimmerStats:
    """Historical swims for one swimmer in one event, newest first."""

    def __init__(self, rows, today):
        rows.sort(key=lambda r: r['date'], reverse=True)
        self.rows = rows
        year_ago = today - timedelta(days=365)
        two_years = today - timedelta(days=730)
        recent = [r['t'] for r in rows if r['date'] >= year_ago]
        older = [r['t'] for r in rows if two_years <= r['date'] < year_ago]
        self.season_best = min(recent) if recent else None
        self.prev_season_best = min(older) if older else None
        self.pb = min(r['t'] for r in rows)
        last3 = [r['t'] for r in rows[:3]]
        self.recent_avg = sum(last3) / len(last3)
        last5 = [r['t'] for r in rows[:5]]
        if len(last5) >= 3:
            sd = statistics.pstdev(last5)
        else:
            sd = None
        self.last_date = rows[0]['date']

        base = self.season_best or self.recent_avg
        # progression: negative = improving
        if self.season_best and self.prev_season_best:
            prog = self.season_best - self.prev_season_best
        else:
            prog = 0
        # seed mu: season best dominates, recent form + trend adjust it
        self.mu = 0.50 * base + 0.30 * self.recent_avg + 0.20 * (base + prog * 0.5)
        # sigma bounded to plausible race-day variation
        lo, hi = 0.004 * self.mu, 0.025 * self.mu
        self.sigma = min(max(sd if sd is not None else 0.01 * self.mu, lo), hi)


def _gather_event_rows(championship, event, gender, scope_q, today):
    """(swimmer, time, date) history rows for everyone active in this event."""
    cutoff = today - timedelta(days=HISTORY_MONTHS * 30)
    qs = (
        Result.objects
        .filter(event=event, swimmer__sex=gender,
                championship__pool=championship.pool,
                championship__date__gte=cutoff,
                championship__date__lt=today,
                swimmer__is_relay_team=False,
                is_hc=False)
        .filter(scope_q)
        .exclude(round_type__in=['Heats'])  # keep Finals/Prelims quality swims
        .values('swimmer_id', 'swimmer__name', 'swimmer__nationality__code',
                'swimmer__nationality__name', 'swimmer__nationality_id',
                'swimmer__birth_year', 'swimmer__photo', 'age_at_competition',
                'team', 'time_centiseconds', 'championship__date')
    )
    by_swimmer = {}
    for r in qs:
        d = by_swimmer.setdefault(r['swimmer_id'], {
            'name': r['swimmer__name'],
            'country_code': r['swimmer__nationality__code'],
            'country_name': r['swimmer__nationality__name'],
            'country_id': r['swimmer__nationality_id'],
            'club': r['team'] or '',
            'photo': (settings.MEDIA_URL + r['swimmer__photo'])
                     if r['swimmer__photo'] else None,
            'birth_year': r['swimmer__birth_year'],
            'rows': [],
            'latest': None,
        })
        # birth year: profile field first, else infer from age at a past meet
        if d['birth_year'] is None and r['age_at_competition']:
            d['birth_year'] = r['championship__date'].year - r['age_at_competition']
        d['rows'].append({'t': r['time_centiseconds'], 'date': r['championship__date']})
        if d['latest'] is None or r['championship__date'] > d['latest']:
            d['latest'] = r['championship__date']
            if r['team']:
                d['club'] = r['team']
    return by_swimmer


def _simulate_event(field):
    """field: list of dicts with 'mu'/'sigma'. Returns per-swimmer sim results
    plus, for each simulation, the indexes of the three medalists."""
    n = len(field)
    placements = [[] for _ in range(n)]
    medals = [[0, 0, 0] for _ in range(n)]  # gold/silver/bronze counts
    standards = [[], [], []]                # winning/2nd/3rd times per sim
    medalists_per_sim = []
    for _ in range(N_SIMS):
        times = [random.gauss(f['mu'], f['sigma']) for f in field]
        order = sorted(range(n), key=lambda i: times[i])
        for place, idx in enumerate(order):
            placements[idx].append(place + 1)
        podium = order[:3]
        for m, idx in enumerate(podium):
            medals[idx][m] += 1
            standards[m].append(times[idx])
        medalists_per_sim.append(podium)
    return placements, medals, standards, medalists_per_sim


def compute_snapshot(championship):
    """Build the full prediction payload for one championship."""
    today = date.today()
    scope_q = _scope_filter(championship)

    entries = list(
        PredictionEntry.objects
        .filter(championship=championship, withdrawn=False)
        .select_related('swimmer', 'event')
    )
    stage = 'OFFICIAL' if entries else 'EARLY'
    days_out = (championship.date - today).days
    if stage == 'OFFICIAL':
        confidence = 'High'
    elif days_out <= 60:
        confidence = 'Medium'
    else:
        confidence = 'Low'

    # which (event, gender) races to predict
    activity_cutoff = today - timedelta(days=LOOKBACK_MONTHS * 30)
    if stage == 'OFFICIAL':
        races = {}
        for e in entries:
            if e.event.is_relay:
                continue
            races.setdefault((e.event, e.swimmer.sex), set()).add(e.swimmer_id)
    else:
        race_rows = (
            Result.objects
            .filter(championship__pool=championship.pool,
                    championship__date__gte=activity_cutoff,
                    championship__date__lt=today,
                    swimmer__is_relay_team=False,
                    event__is_relay=False,
                    is_hc=False)
            .filter(scope_q)
            .values_list('event_id', 'swimmer__sex')
            .distinct()
        )
        race_keys = set(race_rows)
        from core.models import Event
        events_by_id = {e.id: e for e in Event.objects.filter(id__in={k[0] for k in race_keys})}
        races = {(events_by_id[eid], sex): None for eid, sex in race_keys if eid in events_by_id}

    entry_times = {(e.event_id, e.swimmer_id): e.entry_time_cs for e in entries}

    event_payloads = []
    swimmer_best = {}          # swimmer_id -> best card
    country_probs = {}         # country -> [gold, silver, bronze] expected
    country_sim_counts = {}    # country -> list[N_SIMS] medal totals
    club_probs = {}
    club_sim_counts = {}
    is_national = bool(championship.classification and championship.classification.name == 'National')

    # age-group meets: each event is contested (and predicted) per category.
    # Age = meet year - birth year, the standard age-group convention.
    age_groups = list(PredictionAgeGroup.objects.filter(championship=championship))
    meet_year = championship.date.year

    def eligible(d, grp):
        if grp is None:
            return True
        by = d.get('birth_year')
        if not by:
            return False  # unverifiable age: excluded from age-group fields
        age = meet_year - by
        if grp.min_age is not None and age < grp.min_age:
            return False
        if grp.max_age is not None and age > grp.max_age:
            return False
        return True

    race_list = []
    for (event, gender), allowed_ids in sorted(
            races.items(), key=lambda kv: (kv[0][0].sort_order or 0, kv[0][0].distance or 0, kv[0][1])):
        by_swimmer = _gather_event_rows(championship, event, gender, scope_q, today)
        if allowed_ids is not None:
            by_swimmer = {sid: d for sid, d in by_swimmer.items() if sid in allowed_ids}
        else:
            # EARLY: only swimmers active in the lookback window
            by_swimmer = {sid: d for sid, d in by_swimmer.items()
                          if d['latest'] and d['latest'] >= activity_cutoff}
        for grp in (age_groups or [None]):
            pool = {sid: d for sid, d in by_swimmer.items() if eligible(d, grp)}
            if len(pool) >= 2:
                race_list.append((event, gender, grp, pool))

    for event, gender, grp, by_swimmer in race_list:
        field = []
        for sid, d in by_swimmer.items():
            st = SwimmerStats(d['rows'], today)
            seed = entry_times.get((event.id, sid)) or st.season_best or int(st.recent_avg)
            mu = st.mu
            ent = entry_times.get((event.id, sid))
            if ent:
                mu = 0.6 * ent + 0.4 * st.mu
            field.append({
                'swimmer_id': sid, 'name': d['name'],
                'country_code': d['country_code'], 'country_name': d['country_name'],
                'club': d['club'], 'photo': d['photo'],
                'seed_cs': int(seed), 'mu': mu, 'sigma': st.sigma,
                'season_best_cs': st.season_best, 'pb_cs': st.pb,
            })
        field.sort(key=lambda f: f['seed_cs'])
        field = field[:FIELD_CAP]

        placements, medals, standards, medalists_per_sim = _simulate_event(field)

        std = {
            'gold_cs': sum(standards[0]) / len(standards[0]),
            'silver_cs': sum(standards[1]) / len(standards[1]),
            'bronze_cs': sum(standards[2]) / len(standards[2]),
        }
        rows = []
        for i, f in enumerate(field):
            pl = sorted(placements[i])
            p10 = pl[int(0.10 * len(pl))]
            p90 = pl[int(0.90 * len(pl)) - 1]
            p_gold = medals[i][0] / N_SIMS
            p_silver = medals[i][1] / N_SIMS
            p_bronze = medals[i][2] / N_SIMS
            p_medal = p_gold + p_silver + p_bronze
            row = {
                'swimmer_id': f['swimmer_id'], 'name': f['name'],
                'country_code': f['country_code'], 'country_name': f['country_name'],
                'club': f['club'], 'photo': f['photo'],
                'seed': _fmt(f['seed_cs']), 'seed_cs': f['seed_cs'],
                'place_range': f'{p10}\u2013{p90}' if p10 != p90 else str(p10),
                'p_gold': round(p_gold * 100, 1),
                'p_silver': round(p_silver * 100, 1),
                'p_bronze': round(p_bronze * 100, 1),
                'p_medal': round(p_medal * 100, 1),
                'status': medal_status(p_medal),
                'gold_status': gold_status(p_gold),
                'gap_to_bronze': round((f['seed_cs'] - std['bronze_cs']) / 100, 2),
            }
            rows.append(row)

            # tallies
            key = f['club'] or '—' if is_national else f['country_name']
            probs = club_probs if is_national else country_probs
            agg = probs.setdefault(key, {
                'name': key, 'code': None if is_national else f['country_code'],
                'gold': 0.0, 'silver': 0.0, 'bronze': 0.0})
            agg['gold'] += p_gold
            agg['silver'] += p_silver
            agg['bronze'] += p_bronze

            # best-event card per swimmer
            card = {
                'swimmer_id': f['swimmer_id'], 'name': f['name'],
                'country_code': f['country_code'], 'country_name': f['country_name'],
                'photo': f['photo'],
                'event': event.name, 'gender': gender,
                'event_id': event.id,
                'age_group': grp.label if grp else None,
                'seed': _fmt(f['seed_cs']),
                'p_gold': row['p_gold'], 'p_medal': row['p_medal'],
                'status': row['status'], 'gold_status': row['gold_status'],
            }
            prev = swimmer_best.get(f['swimmer_id'])
            if prev is None or card['p_medal'] > prev['p_medal']:
                swimmer_best[f['swimmer_id']] = card

        # per-simulation joint medal totals (for likely ranges)
        sim_counts = club_sim_counts if is_national else country_sim_counts
        for s, podium in enumerate(medalists_per_sim):
            for idx in podium:
                f = field[idx]
                key = f['club'] or '—' if is_national else f['country_name']
                arr = sim_counts.setdefault(key, [0] * N_SIMS)
                arr[s] += 1

        rows.sort(key=lambda r: -r['p_medal'])
        event_payloads.append({
            'event_id': event.id, 'event': event.name,
            'stroke': event.stroke, 'distance': event.distance,
            'gender': gender,
            'age_group': grp.label if grp else None,
            'field': rows,
            'standards': {
                'gold': _fmt(std['gold_cs']),
                'silver': _fmt(std['silver_cs']),
                'bronze': _fmt(std['bronze_cs']),
            },
        })

    # country / club table with joint likely ranges
    def tally_table(probs, sim_counts):
        out = []
        for key, agg in probs.items():
            arr = sorted(sim_counts.get(key, [0] * N_SIMS))
            total = agg['gold'] + agg['silver'] + agg['bronze']
            out.append({
                'name': agg['name'], 'code': agg['code'],
                'gold': round(agg['gold'], 1), 'silver': round(agg['silver'], 1),
                'bronze': round(agg['bronze'], 1), 'total': round(total, 1),
                'likely_min': arr[int(0.10 * N_SIMS)],
                'likely_max': arr[int(0.90 * N_SIMS) - 1],
                'most_likely': statistics.mode(arr),
            })
        out.sort(key=lambda r: (-r['gold'], -r['silver'], -r['bronze']))
        return out

    cards = list(swimmer_best.values())
    top_gold = sorted([c for c in cards if c['p_gold'] >= 10], key=lambda c: -c['p_gold'])[:8]
    strongest = sorted(cards, key=lambda c: -c['p_medal'])[:8]
    challengers = sorted([c for c in cards if 25 <= c['p_medal'] < 45],
                         key=lambda c: -c['p_medal'])[:8]

    return {
        'championship': {
            'id': championship.id, 'name': championship.name,
            'date': str(championship.date),
            'end_date': str(championship.end_date) if championship.end_date else None,
            'pool': championship.pool,
            'classification': championship.classification.name if championship.classification else None,
            'country': championship.country.name if championship.country else None,
            'location': championship.location or '',
            'meet_photo': (settings.MEDIA_URL + str(championship.meet_photo))
                          if championship.meet_photo else None,
        },
        'stage': stage,
        'confidence': confidence,
        'is_national': is_national,
        'age_groups': [g.label for g in age_groups],
        'events': event_payloads,
        'sections': {
            'top_gold': top_gold,
            'strongest': strongest,
            'challengers': challengers,
            'rising': [],  # filled by caller from previous snapshot
        },
        'table': tally_table(club_probs, club_sim_counts) if is_national
                 else tally_table(country_probs, country_sim_counts),
        'swimmer_count': len(cards),
        'event_count': len(event_payloads),
    }


def fill_rising(data, previous_data):
    """Swimmers whose best medal chance rose ≥5 points since last compute."""
    if not previous_data:
        return
    prev = {}
    for section in previous_data.get('sections', {}).values():
        for c in section or []:
            prev[c['swimmer_id']] = c['p_medal']
    prev_events = {}
    for ev in previous_data.get('events', []):
        for r in ev.get('field', []):
            prev_events[r['swimmer_id']] = max(prev_events.get(r['swimmer_id'], 0), r['p_medal'])
    prev = {**prev_events, **prev}

    rising = []
    seen = set()
    for ev in data['events']:
        for r in ev['field']:
            if r['swimmer_id'] in seen:
                continue
            old = prev.get(r['swimmer_id'])
            if old is not None and r['p_medal'] - old >= 5:
                seen.add(r['swimmer_id'])
                rising.append({
                    'swimmer_id': r['swimmer_id'], 'name': r['name'],
                    'country_code': r['country_code'], 'country_name': r['country_name'],
                    'event': ev['event'], 'gender': ev['gender'], 'event_id': ev['event_id'],
                    'age_group': ev.get('age_group'),
                    'seed': r['seed'],
                    'p_gold': r['p_gold'], 'p_medal': r['p_medal'],
                    'status': r['status'], 'gold_status': r['gold_status'],
                    'delta': round(r['p_medal'] - old, 1),
                })
    rising.sort(key=lambda c: -c['delta'])
    data['sections']['rising'] = rising[:8]
