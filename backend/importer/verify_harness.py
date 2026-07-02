"""
Verification harness for the importer.

Parses every sample file and reports, per file:
  - meet metadata (name, dates, location, pool, format)
  - per-event: name, gender, round, age group, result count
  - anomaly checks: missing genders, missing ages/birth years, rank gaps,
    duplicate (swimmer, event, round) collisions, implausible times,
    relays without swimmers/splits, split coverage.

Run:  python importer/verify_harness.py [file ...]
"""
import os
import sys
import collections

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'arabswim.settings')

from importer.parsers.detector import detect_and_parse  # noqa: E402


SAMPLE_FILES = [
    '../../data/Algeria.2022.SCM.pdf',
    '../../data/Arab.Algeria.2022.pdf',
    "../../data/CHAMPIONNAT D'\u00c9T\u00c9 DE TUNISIE BENJAMINS - 25_07_2024 \u00a4 27_07_2024 - RADES.html",
    '../../data/Hamilton.SCM.2023.PDF',
    '../../data/Lebanon.2024.SCM.pdf',
    '../../data/Maroc.Trone.2026.pdf',
    '../../Algeria.AG.SCM.2026.pdf',
    '../../Maroc.Tangier.2026.pdf',
    '../../GCC  Final Version.xlsx',
]


def is_relay(ev):
    n = ev.event_name.lower()
    return 'relay' in n or '4x' in n or '4\u00d7' in n


def min_plausible(distance):
    table = {50: 1500, 100: 3500, 200: 9000, 400: 20000, 800: 42000, 1500: 80000}
    best = 0
    for d, t in table.items():
        if distance >= d:
            best = t
    return best


def max_plausible(distance):
    # very generous slow bound: 3 min per 50m
    return max(distance, 50) // 50 * 18000


def check_file(path):
    print('=' * 90)
    print(f'FILE: {os.path.basename(path)}')
    print('=' * 90)
    try:
        meet = detect_and_parse(path)
    except Exception as e:
        print(f'  !! PARSE FAILED: {type(e).__name__}: {e}')
        return

    print(f'  format={meet.source_format}  pool={meet.pool}')
    print(f'  name={meet.meet_name!r}')
    print(f'  date={meet.date_text!r}  end={getattr(meet, "date_end", "")!r}  location={meet.location!r}')
    print(f'  events={meet.total_events}  results={meet.total_results}  swimmers={meet.total_swimmers}')

    anomalies = []
    seen = collections.Counter()
    rounds = collections.Counter()
    n_results = 0
    n_with_age = n_with_by = n_with_gender = n_with_splits = n_with_club = 0
    relay_events = 0
    relay_no_swimmers = 0

    print('\n  EVENTS:')
    for ev in meet.events:
        ok = [r for r in ev.results if r.status in ('OK', 'TLD')]
        tag = 'RELAY' if is_relay(ev) else '     '
        print(f'    [{tag}] {ev.event_name:<38} g={ev.gender or "?"} round={ev.round_type or "-":<8} '
              f'cat={ev.age_group or "-":<18} results={len(ev.results)}')
        if not ev.results:
            anomalies.append(f'event has ZERO results: {ev.event_name} ({ev.gender}/{ev.round_type}/{ev.age_group})')
        if not ev.gender:
            anomalies.append(f'event missing gender: {ev.event_name}')

        if is_relay(ev):
            relay_events += 1
            for r in ok:
                if not r.split_times:
                    relay_no_swimmers += 1

        ranks = sorted(r.rank for r in ok if r.rank > 0)
        # rank sanity: should be roughly 1..N without weird jumps
        if ranks and ranks[0] != 1:
            anomalies.append(f'{ev.event_name} [{ev.round_type}/{ev.age_group}]: first rank is {ranks[0]}, not 1')

        for r in ev.results:
            rounds[r.round_type or '(none)'] += 1
            if r.status not in ('OK', 'TLD'):
                continue
            n_results += 1
            if r.age:
                n_with_age += 1
            if r.birth_year:
                n_with_by += 1
            if r.gender:
                n_with_gender += 1
            if r.split_times:
                n_with_splits += 1
            if r.club:
                n_with_club += 1
            key = (r.swimmer_name.upper(), ev.event_name, ev.gender, r.round_type or ev.round_type, ev.age_group, r.birth_year)
            seen[key] += 1
            if r.time_centiseconds:
                if ev.distance and not is_relay(ev):
                    if r.time_centiseconds < min_plausible(ev.distance):
                        anomalies.append(f'IMPLAUSIBLY FAST: {r.swimmer_name} {r.time_text} in {ev.event_name}')
                    if r.time_centiseconds > max_plausible(ev.distance):
                        anomalies.append(f'IMPLAUSIBLY SLOW: {r.swimmer_name} {r.time_text} in {ev.event_name}')
            if r.birth_year and not (1930 <= r.birth_year <= 2025):
                anomalies.append(f'BAD BIRTH YEAR {r.birth_year}: {r.swimmer_name}')
            if r.age and not (4 <= r.age <= 90):
                anomalies.append(f'BAD AGE {r.age}: {r.swimmer_name}')
            if r.fina_points and r.fina_points > 1200:
                anomalies.append(f'BAD POINTS {r.fina_points}: {r.swimmer_name} {ev.event_name}')

    dupes = {k: c for k, c in seen.items() if c > 1}
    for k, c in list(dupes.items())[:15]:
        anomalies.append(f'DUPLICATE result x{c}: {k[0]} | {k[1]} | g={k[2]} round={k[3]} cat={k[4]}')
    if len(dupes) > 15:
        anomalies.append(f'... and {len(dupes) - 15} more duplicate keys')

    def pct(x):
        return f'{100 * x / n_results:.0f}%' if n_results else 'n/a'

    print('\n  FIELD COVERAGE (valid results only):')
    print(f'    total={n_results}  age={pct(n_with_age)}  birth_year={pct(n_with_by)}  '
          f'gender={pct(n_with_gender)}  club={pct(n_with_club)}  splits={pct(n_with_splits)}')
    print(f'    round distribution: {dict(rounds)}')
    if relay_events:
        print(f'    relay events={relay_events}, relay results missing swimmers/splits={relay_no_swimmers}')

    print(f'\n  ANOMALIES ({len(anomalies)}):')
    for a in anomalies[:40]:
        print(f'    - {a}')
    if len(anomalies) > 40:
        print(f'    ... and {len(anomalies) - 40} more')
    print()


if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    files = sys.argv[1:] or [os.path.normpath(os.path.join(base, p)) for p in SAMPLE_FILES]
    for f in files:
        if not os.path.exists(f):
            print(f'SKIP (not found): {f}')
            continue
        check_file(f)
