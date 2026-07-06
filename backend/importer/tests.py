"""
Regression tests for the importer parsers.

Two layers:
  1. Unit tests for the shared helpers in parsers/base.py (fast, no files).
  2. Golden-file tests: parse every sample meet file and assert the exact
     metadata, event/result counts, round distribution, relay coverage and
     data-sanity invariants that were manually verified against the source
     documents. If a parser change alters any of these numbers, a test fails
     and the change must be re-verified against the source PDFs/HTML/Excel.

Sample files are looked up relative to the repo root; tests for missing
files are skipped so the suite still runs on machines without the samples.

Run:  ./venv/bin/python -m pytest importer/tests.py -v
  or  ./manage.py test importer
"""
import os
import unittest
import collections

from django.test import SimpleTestCase

from importer.parsers.base import (
    parse_time_to_centiseconds, normalize_name, normalize_category,
    normalize_event_name, normalize_stroke, to_iso_date,
    extract_date_and_location, clean_text,
)
from importer.parsers.frmn_parser import _fix_frmn_points

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SAMPLES = {
    'algeria2022': '../data/Algeria.2022.SCM.pdf',
    'arab2022': '../data/Arab.Algeria.2022.pdf',
    'tunisia': "../data/CHAMPIONNAT D'\u00c9T\u00c9 DE TUNISIE BENJAMINS - 25_07_2024 \u00a4 27_07_2024 - RADES.html",
    'hamilton': '../data/Hamilton.SCM.2023.PDF',
    'lebanon': '../data/Lebanon.2024.SCM.pdf',
    'trone': '../data/Maroc.Trone.2026.pdf',
    'algeria2026': '../Algeria.AG.SCM.2026.pdf',
    'tangier': '../Maroc.Tangier.2026.pdf',
    'gcc': '../GCC  Final Version.xlsx',
}
SAMPLES = {k: os.path.normpath(os.path.join(BACKEND_DIR, p)) for k, p in SAMPLES.items()}

_PARSE_CACHE = {}


def parse_sample(key):
    """Parse a sample file once per test run (parsing big PDFs is slow)."""
    if key not in _PARSE_CACHE:
        from importer.parsers.detector import detect_and_parse
        _PARSE_CACHE[key] = detect_and_parse(SAMPLES[key])
    return _PARSE_CACHE[key]


def needs_sample(key):
    return unittest.skipUnless(
        os.path.exists(SAMPLES[key]), f'sample file missing: {SAMPLES[key]}')


def is_relay(ev):
    n = ev.event_name.lower()
    return 'relay' in n or '4x' in n or '4\u00d7' in n


# ---------------------------------------------------------------------------
# 1. Unit tests for shared helpers
# ---------------------------------------------------------------------------

class TimeParsingTests(SimpleTestCase):
    def test_minutes_seconds(self):
        self.assertEqual(parse_time_to_centiseconds('2:25.94'), 14594)

    def test_seconds_only(self):
        self.assertEqual(parse_time_to_centiseconds('29.26'), 2926)

    def test_comma_decimal(self):
        self.assertEqual(parse_time_to_centiseconds('2:25,94'), 14594)

    def test_invalid(self):
        self.assertEqual(parse_time_to_centiseconds(''), 0)
        self.assertEqual(parse_time_to_centiseconds('DSQ'), 0)


class NameNormalizationTests(SimpleTestCase):
    def test_last_first_comma(self):
        # Splash / international: "LAST, First"
        self.assertEqual(normalize_name('ALZAMIL, Ali', comma_order='last_first'),
                         'Ali ALZAMIL')

    def test_first_last_comma(self):
        # Lebanon HyTek: "First, Last"
        self.assertEqual(normalize_name('Jude, Aoun', comma_order='first_last'),
                         'Jude AOUN')

    def test_whitespace_and_nbsp(self):
        self.assertEqual(clean_text('Grand\xa0bassin'), 'Grand bassin')


class CategoryTests(SimpleTestCase):
    def test_french_categories_kept_in_french(self):
        self.assertEqual(normalize_category('BENJAMINS'), 'Benjamins')
        self.assertEqual(normalize_category('MINIMES'), 'Minimes')
        self.assertEqual(normalize_category('CADETS'), 'Cadets')
        self.assertEqual(normalize_category('SENIORS'), 'Seniors')

    def test_combined_labels_ordered_oldest_first(self):
        self.assertEqual(normalize_category('SENIORS/JUNIORS'), 'Seniors/Juniors')
        self.assertEqual(normalize_category('JUNIORS SENIORS'), 'Seniors/Juniors')
        self.assertEqual(normalize_category('JUNIORS/SENIORS'), 'Seniors/Juniors')


class EventNameTests(SimpleTestCase):
    def test_individual(self):
        self.assertEqual(normalize_event_name(100, 'Freestyle'), '100 M Freestyle')

    def test_relay_uses_leg_distance(self):
        name = normalize_event_name(400, 'Freestyle', is_relay=True)
        self.assertIn('4x100', name.replace(' ', '').lower())
        self.assertIn('relay', name.lower())

    def test_stroke_french(self):
        self.assertEqual(normalize_stroke('NAGE LIBRE'), 'Freestyle')
        self.assertEqual(normalize_stroke('4 NAGES'), 'Individual Medley')
        self.assertEqual(normalize_stroke('Brasse'), 'Breaststroke')
        self.assertEqual(normalize_stroke('Dos'), 'Backstroke')
        self.assertEqual(normalize_stroke('Papillon'), 'Butterfly')


class DateTests(SimpleTestCase):
    def test_to_iso(self):
        self.assertEqual(to_iso_date('28/06/2026'), '2026-06-28')
        self.assertEqual(to_iso_date('2026-06-28'), '2026-06-28')
        self.assertEqual(to_iso_date(''), '')

    def test_range_with_shared_month(self):
        start, end, loc = extract_date_and_location('EL BEZ SETIF, 19 - 22/1/2022')
        self.assertEqual(start, '2022-01-19')
        self.assertEqual(end, '2022-01-22')

    def test_two_full_dates(self):
        start, end, _ = extract_date_and_location(
            'Hamilton Aquatics Short Course - 21/10/2023 to 22/10/2023')
        self.assertEqual((start, end), ('2023-10-21', '2023-10-22'))


class FrmnPointsTests(SimpleTestCase):
    def test_doubled_digits(self):
        self.assertEqual(_fix_frmn_points('664455'), 645)
        self.assertEqual(_fix_frmn_points('553333'), 533)

    def test_normal(self):
        self.assertEqual(_fix_frmn_points('839'), 839)

    def test_invalid(self):
        self.assertEqual(_fix_frmn_points(''), 0)
        self.assertEqual(_fix_frmn_points('9999'), 0)  # >1200 and not de-doublable


# ---------------------------------------------------------------------------
# 2. Shared invariants applied to every sample file
# ---------------------------------------------------------------------------

def _min_plausible(distance):
    table = {50: 1500, 100: 3500, 200: 9000, 400: 20000, 800: 42000, 1500: 80000}
    best = 0
    for d, t in table.items():
        if distance >= d:
            best = t
    return best


def _max_plausible(distance):
    return max(distance, 50) // 50 * 18000


class SanityMixin:
    """Invariants every parsed meet must satisfy (mirrors verify_harness)."""
    KEY = None
    # (name.upper(), event, gender, round, cat, birth_year) keys that legitimately
    # repeat in the source document (e.g. one club fielding two same-label relay teams)
    ALLOWED_DUPLICATE_KEYS = 0

    @classmethod
    def meet(cls):
        return parse_sample(cls.KEY)

    def test_every_event_has_gender_and_results(self):
        for ev in self.meet().events:
            self.assertTrue(ev.gender, f'event missing gender: {ev.event_name}')
            self.assertTrue(ev.results, f'event has zero results: {ev.event_name}')

    def test_ranks_start_at_one(self):
        for ev in self.meet().events:
            ranks = sorted(r.rank for r in ev.results
                           if r.status in ('OK', 'TLD') and r.rank > 0)
            if ranks:
                self.assertEqual(ranks[0], 1,
                                 f'{ev.event_name} [{ev.round_type}/{ev.age_group}]: '
                                 f'first rank is {ranks[0]}')

    def test_times_plausible(self):
        for ev in self.meet().events:
            # relays are skipped: some parsers store the leg distance, others
            # the total, so no single bound applies (mirrors verify_harness)
            if not ev.distance or is_relay(ev):
                continue
            lo, hi = _min_plausible(ev.distance), _max_plausible(ev.distance)
            for r in ev.results:
                if r.status not in ('OK', 'TLD') or not r.time_centiseconds:
                    continue
                self.assertGreaterEqual(
                    r.time_centiseconds, lo,
                    f'implausibly fast: {r.swimmer_name} {r.time_text} in {ev.event_name}')
                self.assertLessEqual(
                    r.time_centiseconds, hi,
                    f'implausibly slow: {r.swimmer_name} {r.time_text} in {ev.event_name}')

    def test_birth_years_ages_points_sane(self):
        for ev in self.meet().events:
            for r in ev.results:
                if r.status not in ('OK', 'TLD'):
                    continue
                if r.birth_year:
                    self.assertTrue(1930 <= r.birth_year <= 2025,
                                    f'bad birth year {r.birth_year}: {r.swimmer_name}')
                if r.age:
                    self.assertTrue(4 <= r.age <= 90,
                                    f'bad age {r.age}: {r.swimmer_name}')
                if r.fina_points:
                    self.assertLessEqual(r.fina_points, 1200,
                                         f'bad points {r.fina_points}: {r.swimmer_name}')

    def test_no_duplicate_results(self):
        seen = collections.Counter()
        for ev in self.meet().events:
            for r in ev.results:
                if r.status not in ('OK', 'TLD'):
                    continue
                key = (r.swimmer_name.upper(), ev.event_name, ev.gender,
                       r.round_type or ev.round_type, ev.age_group, r.birth_year)
                seen[key] += 1
        dupes = {k: c for k, c in seen.items() if c > 1}
        self.assertLessEqual(
            len(dupes), self.ALLOWED_DUPLICATE_KEYS,
            f'unexpected duplicate results: {list(dupes.items())[:10]}')


# ---------------------------------------------------------------------------
# 3. Golden-file tests, one class per sample
# ---------------------------------------------------------------------------

@needs_sample('algeria2022')
class Algeria2022Tests(SanityMixin, SimpleTestCase):
    KEY = 'algeria2022'
    # Verified against source: same club fields multiple relay teams printed with
    # identical labels, plus two distinct swimmers sharing name+birth year.
    ALLOWED_DUPLICATE_KEYS = 12

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'splash')
        self.assertEqual(m.pool, 'SCM')
        self.assertEqual(m.meet_name, 'CHAMPIONNAT NATIONAL M-J-OPEN 2022')
        self.assertEqual(m.date_text, '2022-01-19')
        self.assertEqual(m.date_end, '2022-01-22')
        self.assertEqual(m.location, 'EL BEZ SETIF')

    def test_counts(self):
        # This meet prints every heat swim twice: overall ("Cat. générale")
        # ranking + per-age-category ranking. drop_general_duplicate_results
        # keeps only the age-category copy (was 126 events / 2182 results
        # before dedupe).
        m = self.meet()
        self.assertEqual(m.total_events, 102)
        self.assertEqual(m.total_results, 1226)

    def test_rounds(self):
        rounds = collections.Counter(
            r.round_type or '(none)' for ev in self.meet().events for r in ev.results)
        # 199 true finals + 42 single-round results promoted to Finals
        self.assertEqual(rounds['Finals'], 241)
        self.assertEqual(rounds['Heats'], 985)
        self.assertEqual(rounds['(none)'], 0)

    def test_no_general_duplicates_in_heats(self):
        # A swim must not appear both with and without an age category
        # within the same event + round (swimmer profile duplication bug).
        by_group = {}
        for ev in self.meet().events:
            by_group.setdefault((ev.event_name, ev.gender, ev.round_type), []).append(ev)
        for evs in by_group.values():
            aged = {(r.swimmer_name.upper(), r.time_centiseconds)
                    for ev in evs if ev.age_group for r in ev.results}
            general = {(r.swimmer_name.upper(), r.time_centiseconds)
                       for ev in evs if not ev.age_group for r in ev.results}
            self.assertEqual(aged & general, set())

    def test_relays_have_swimmers(self):
        missing = sum(
            1 for ev in self.meet().events if is_relay(ev)
            for r in ev.results if r.status in ('OK', 'TLD') and not r.split_times)
        self.assertLessEqual(missing, 6)

    def test_relay_leg_distance(self):
        # regression: "4 x 200m Libre" was mislabeled "4x50 M Freestyle Relay"
        # because the parser passed the leg distance where the total belongs
        names = {ev.event_name for ev in self.meet().events}
        self.assertIn('4x200 M Freestyle Relay Men', names)
        self.assertIn('4x200 M Freestyle Relay Women', names)
        for ev in self.meet().events:
            if is_relay(ev):
                self.assertGreaterEqual(ev.distance, 200,
                                        f'relay distance must be the total: {ev.event_name}')


@needs_sample('arab2022')
class Arab2022Tests(SanityMixin, SimpleTestCase):
    KEY = 'arab2022'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'splash')
        self.assertEqual(m.pool, 'LCM')
        self.assertEqual(m.meet_name, 'ARAB CHAMPIONSHIP OPEN 2022 -ORAN-')
        self.assertEqual(m.date_text, '2022-07-20')
        self.assertEqual(m.date_end, '2022-07-23')

    def test_counts(self):
        m = self.meet()
        self.assertEqual(m.total_events, 51)
        self.assertEqual(m.total_results, 365)

    def test_prelims_and_finals_detected(self):
        rounds = collections.Counter(
            r.round_type for ev in self.meet().events for r in ev.results)
        self.assertEqual(rounds['Heats'], 120)
        # 224 true finals + 21 single-round results promoted to Finals
        self.assertEqual(rounds['Finals'], 245)

    def test_all_relays_have_swimmers(self):
        for ev in self.meet().events:
            if not is_relay(ev):
                continue
            for r in ev.results:
                if r.status in ('OK', 'TLD'):
                    self.assertTrue(r.split_times,
                                    f'relay without swimmers: {r.swimmer_name} in {ev.event_name}')


@needs_sample('tunisia')
class TunisiaNat2iTests(SanityMixin, SimpleTestCase):
    KEY = 'tunisia'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'nat2i')
        self.assertEqual(m.pool, 'LCM')
        # regression: raw HTML contains \xa0 in the title
        self.assertEqual(m.meet_name, "CHAMPIONNAT D'\u00c9T\u00c9 DE TUNISIE BENJAMINS")
        self.assertNotIn('\xa0', m.meet_name)
        self.assertNotIn('\xa0', m.location)
        self.assertEqual(m.date_text, '2024-07-25')
        self.assertEqual(m.date_end, '2024-07-27')
        self.assertEqual(m.location, 'RADES')

    def test_counts(self):
        m = self.meet()
        self.assertEqual(m.total_events, 36)
        self.assertEqual(m.total_results, 1575)

    def test_single_round_meet_is_finals(self):
        # regression: source labels every event "Séries" but there is no
        # separate finals session — a lone round IS the final ranking
        rounds = {r.round_type for ev in self.meet().events for r in ev.results}
        self.assertEqual(rounds, {'Finals'})


@needs_sample('hamilton')
class HamiltonHytekTests(SanityMixin, SimpleTestCase):
    KEY = 'hamilton'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'hytek')
        self.assertEqual(m.pool, 'SCM')
        self.assertEqual(m.meet_name, 'Hamilton Aquatics Short Course')
        self.assertEqual(m.date_text, '2023-10-21')
        self.assertEqual(m.date_end, '2023-10-22')

    def test_counts(self):
        m = self.meet()
        self.assertEqual(m.total_events, 176)
        self.assertEqual(m.total_results, 2534)

    def test_all_individual_results_have_age(self):
        ok = [r for ev in self.meet().events if not is_relay(ev)
              for r in ev.results if r.status in ('OK', 'TLD')]
        with_age = [r for r in ok if r.age]
        self.assertEqual(len(ok), len(with_age))

    def test_no_garbled_names(self):
        # regression: column cropping used to leak stray single letters into names
        for ev in self.meet().events:
            for r in ev.results:
                self.assertNotRegex(r.swimmer_name, r'^[A-Za-z]\s',
                                    f'garbled name: {r.swimmer_name!r}')

    def test_800_free_is_its_own_event(self):
        # regression: "Women 800 SC Meter Freestyle" (no age group) used to be
        # swallowed by the previous 400 IM event
        names = {(ev.event_name, ev.gender) for ev in self.meet().events}
        self.assertIn(('800 M Freestyle', 'F'), names)


@needs_sample('lebanon')
class LebanonHytekTests(SanityMixin, SimpleTestCase):
    KEY = 'lebanon'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'hytek')
        self.assertEqual(m.pool, 'SCM')
        self.assertEqual(m.meet_name, 'Championnat du Liban 25 M')
        self.assertEqual(m.date_text, '2024-04-20')
        self.assertEqual(m.date_end, '2024-04-21')

    def test_counts(self):
        m = self.meet()
        self.assertEqual(m.total_events, 193)
        self.assertEqual(m.total_results, 1264)

    def test_prelims_vs_finals(self):
        # This file is THE prelims/finals regression case: markers appear after
        # the event header and column headers say "Prelim Time"/"Finals Time".
        rounds = collections.Counter(
            r.round_type for ev in self.meet().events for r in ev.results)
        self.assertEqual(rounds.get('Prelims', 0), 533)
        self.assertEqual(rounds.get('Finals', 0), 731)
        self.assertEqual(rounds.get(None, 0) + rounds.get('', 0), 0,
                         'no result may be missing its round')

    def test_lebanese_comma_order(self):
        # "Jude, Aoun" means First=Jude Last=Aoun in this federation's HyTek output
        names = {r.swimmer_name for ev in self.meet().events for r in ev.results}
        self.assertIn('Jude AOUN', names)

    def test_relay_legs_mapped_to_swimmers(self):
        relay_ok = [r for ev in self.meet().events if is_relay(ev)
                    for r in ev.results if r.status in ('OK', 'TLD')]
        self.assertTrue(relay_ok)
        missing = [r for r in relay_ok if not r.split_times]
        self.assertLessEqual(len(missing), 1)  # one team listed without legs in source
        # legs must be "Name time" pairs
        sample = next(r for r in relay_ok if len(r.split_times) == 4)
        for leg in sample.split_times:
            self.assertRegex(leg, r'.+\s\d', f'bad relay leg: {leg!r}')


@needs_sample('trone')
class MarocTroneFrmnTests(SanityMixin, SimpleTestCase):
    KEY = 'trone'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'frmn')
        self.assertEqual(m.pool, 'SCM')
        self.assertEqual(m.meet_name, 'COUPE DU TRONE DE NATATION')
        self.assertEqual(m.date_text, '2026-05-10')
        self.assertEqual(m.location, 'MARRAKECH')

    def test_counts(self):
        m = self.meet()
        self.assertEqual(m.total_events, 20)
        self.assertEqual(m.total_results, 321)

    def test_birth_year_coverage(self):
        ok = [r for ev in self.meet().events for r in ev.results
              if r.status in ('OK', 'TLD')]
        self.assertTrue(all(r.birth_year for r in ok))


@needs_sample('algeria2026')
class Algeria2026SplashTests(SanityMixin, SimpleTestCase):
    KEY = 'algeria2026'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'splash')
        self.assertEqual(m.pool, 'SCM')
        self.assertEqual(m.meet_name, 'ALGERIAN WINTER CHAMPIONSHIPS AGE GROUPS')
        self.assertEqual(m.date_text, '2026-01-27')
        self.assertEqual(m.date_end, '2026-01-31')
        self.assertEqual(m.location, 'Oran')

    def test_counts(self):
        m = self.meet()
        # 114: Cadets, Juniors and Minimes each keep their own classement.
        # (Was 74 when CADETS and JUNIORS both translated to 'Junior' and
        # their events were wrongly merged.)
        self.assertEqual(m.total_events, 114)
        self.assertEqual(m.total_results, 3884)

    def test_categories_stay_french(self):
        cats = {ev.age_group for ev in self.meet().events}
        self.assertEqual(cats, {'Cadets', 'Juniors', 'Minimes'})

    def test_long_race_splits_attached(self):
        # regression: cumulative "800m: 9:12.34" split lines must attach to the
        # preceding swimmer, not be dropped
        long_events = [ev for ev in self.meet().events
                       if ev.distance in (800, 1500) and not is_relay(ev)]
        self.assertTrue(long_events)
        with_splits = [r for ev in long_events for r in ev.results if r.split_times]
        self.assertTrue(with_splits, 'no long-race result has splits')


@needs_sample('tangier')
class MarocTangierFrmnTests(SanityMixin, SimpleTestCase):
    KEY = 'tangier'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'frmn')
        self.assertEqual(m.pool, 'LCM')
        # regression: English title line has no French keyword
        self.assertEqual(m.meet_name, 'TANGIER INTERNATIONAL SWIMMING MEETING')
        self.assertEqual(m.date_text, '2026-06-28')
        self.assertEqual(m.location, 'TANGER')

    def test_counts(self):
        m = self.meet()
        self.assertEqual(m.total_events, 83)
        self.assertEqual(m.total_results, 838)


@needs_sample('gcc')
class GccExcelTests(SanityMixin, SimpleTestCase):
    KEY = 'gcc'

    def test_metadata(self):
        m = self.meet()
        self.assertEqual(m.source_format, 'excel')
        self.assertEqual(m.pool, 'LCM')
        self.assertEqual(m.meet_name, '4th GCC Games')
        self.assertEqual(m.date_text, '2026-05-12')
        self.assertEqual(m.date_end, '2026-05-15')
        self.assertEqual(m.location, 'Doha')

    def test_counts(self):
        m = self.meet()
        self.assertEqual(m.total_events, 20)
        self.assertEqual(m.total_results, 139)

# ---------------------------------------------------------------------------
# 3. Same-name athlete separation (age-band matching)
# ---------------------------------------------------------------------------

from importer.matcher import category_band, bands_conflict
from swimmers.models import Swimmer
from championships.models import Championship, Result


class BandTests(SimpleTestCase):
    """Unit tests for age-band classification and conflict detection."""

    def test_broad_categories_have_no_band(self):
        for c in ('', 'Open', 'TC', 'Toutes Catégories', 'Cat. générale',
                  'CATEGORIE GENERALE', 'All Ages'):
            self.assertEqual(category_band(c), '', c)

    def test_exclusive_categories_keep_their_band(self):
        self.assertEqual(category_band('Cadets'), 'Cadets')
        self.assertEqual(category_band('13-14'), '13-14')

    def test_disjoint_french_bands_conflict(self):
        self.assertTrue(bands_conflict('Cadets', 'Minimes'))
        self.assertTrue(bands_conflict('Juniors', 'Benjamins'))

    def test_shared_token_bands_do_not_conflict(self):
        self.assertFalse(bands_conflict('Juniors', 'Seniors/Juniors'))
        self.assertFalse(bands_conflict('Cadets', 'Cadets'))

    def test_numeric_ranges(self):
        self.assertTrue(bands_conflict('13-14', '15-16'))
        self.assertFalse(bands_conflict('13-14', '14-15'))  # overlap
        self.assertTrue(bands_conflict('12-13', '19+'))
        self.assertFalse(bands_conflict('17-18', '18+'))

    def test_broad_or_unknown_never_conflicts(self):
        self.assertFalse(bands_conflict('Cadets', ''))
        self.assertFalse(bands_conflict('Cadets', 'Open'))
        self.assertFalse(bands_conflict('Cadets', 'Elite'))  # unknown label
        self.assertFalse(bands_conflict('Weird A', 'Weird B'))


from django.test import TestCase


class _MeetFixtureMixin:
    @classmethod
    def setUpTestData(cls):
        from core.models import Country, Event
        cls.country = Country.objects.create(name='Tunisia', code='TUN')
        cls.event = Event.objects.create(
            name='100 M Freestyle', distance=100, stroke='Freestyle')


class SameNameImportTests(_MeetFixtureMixin, TestCase):
    """confirm_import must keep two same-named athletes in conflicting
    age bands as two separate Swimmer records."""

    def _preview(self):
        return {
            'meet': {'name': 'Test Meet', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '100 M Freestyle',
                'distance': 100, 'stroke': 'Freestyle',
                'gender': 'M', 'is_relay': False, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'Youssef TRABELSI', 'gender': 'M',
                     'category': 'Cadets', 'time_centiseconds': 5740,
                     'birth_year': 0, 'nationality_code': 'TUN'},
                    {'swimmer_name': 'Youssef TRABELSI', 'gender': 'M',
                     'category': 'Minimes', 'time_centiseconds': 6496,
                     'birth_year': 0, 'nationality_code': 'TUN'},
                ],
            }],
        }

    def test_conflicting_bands_create_two_swimmers(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        swimmers = Swimmer.objects.filter(name__iexact='Youssef TRABELSI')
        self.assertEqual(swimmers.count(), 2)
        times = set()
        for s in swimmers:
            rs = list(s.results.all())
            self.assertEqual(len(rs), 1)
            times.add(rs[0].time_centiseconds)
        self.assertEqual(times, {5740, 6496})

    def test_reimport_matches_existing_pair(self):
        """Importing the same meet again must not create a third profile."""
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        champ_id = Championship.objects.get().id
        confirm_import(self._preview(), {}, championship_id=champ_id)
        self.assertEqual(
            Swimmer.objects.filter(name__iexact='Youssef TRABELSI').count(), 2)

    def test_compatible_categories_stay_one_swimmer(self):
        from importer.services import confirm_import
        preview = self._preview()
        # Same band + a broad classification: one athlete, two rows
        preview['events'][0]['results'][1]['category'] = 'Cat. générale'
        preview['events'][0]['results'][1]['time_centiseconds'] = 5740
        preview['events'][0]['results'][1]['round_type'] = 'Heats'
        confirm_import(preview, {})
        self.assertEqual(
            Swimmer.objects.filter(name__iexact='Youssef TRABELSI').count(), 1)


class SplitMergedSwimmersTests(_MeetFixtureMixin, TestCase):
    """The split_merged_swimmers command must separate a merged profile."""

    def _merged_swimmer(self):
        import datetime
        champ = Championship.objects.create(
            name='Été M/C', date=datetime.date(2025, 7, 1),
            pool='LCM', country=self.country)
        swimmer = Swimmer.objects.create(
            name='Youssef TRABELSI', nationality=self.country, sex='M')
        Result.objects.create(
            swimmer=swimmer, championship=champ, event=self.event,
            round_type='Finals', category='Cadets', time_centiseconds=5740)
        Result.objects.create(
            swimmer=swimmer, championship=champ, event=self.event,
            round_type='Finals', category='Minimes', time_centiseconds=6496)
        return swimmer

    def test_split(self):
        from django.core.management import call_command
        swimmer = self._merged_swimmer()
        call_command('split_merged_swimmers', verbosity=0)
        self.assertEqual(
            Swimmer.objects.filter(name__iexact='Youssef TRABELSI').count(), 2)
        # Original keeps one result, the new profile has the other
        for s in Swimmer.objects.filter(name__iexact='Youssef TRABELSI'):
            self.assertEqual(s.results.count(), 1)
        # Idempotent: a second run changes nothing
        call_command('split_merged_swimmers', verbosity=0)
        self.assertEqual(
            Swimmer.objects.filter(name__iexact='Youssef TRABELSI').count(), 2)

    def test_dry_run_changes_nothing(self):
        from django.core.management import call_command
        self._merged_swimmer()
        call_command('split_merged_swimmers', '--dry-run', verbosity=0)
        self.assertEqual(
            Swimmer.objects.filter(name__iexact='Youssef TRABELSI').count(), 1)

    def test_clean_swimmer_untouched(self):
        import datetime
        from django.core.management import call_command
        c1 = Championship.objects.create(
            name='Meet A', date=datetime.date(2024, 7, 1),
            pool='LCM', country=self.country)
        c2 = Championship.objects.create(
            name='Meet B', date=datetime.date(2026, 7, 1),
            pool='LCM', country=self.country)
        s = Swimmer.objects.create(
            name='Sara HAMDI', nationality=self.country, sex='F')
        # Category changed across seasons — legitimate ageing, no conflict
        Result.objects.create(swimmer=s, championship=c1, event=self.event,
                              category='Minimes', time_centiseconds=6300)
        Result.objects.create(swimmer=s, championship=c2, event=self.event,
                              category='Cadets', time_centiseconds=6100)
        call_command('split_merged_swimmers', verbosity=0)
        self.assertEqual(Swimmer.objects.filter(name='Sara HAMDI').count(), 1)
