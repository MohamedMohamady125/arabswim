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

    def setUp(self):
        # The matcher caches the Country table per process — reset it so
        # each test sees the countries created by its own fixture.
        import importer.matcher as matcher
        matcher._country_cache = None
        super().setUp()


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


# ---------------------------------------------------------------------------
# 4. Relay event name canonicalization
# ---------------------------------------------------------------------------

from importer.services import canonical_relay_name
from importer.management.commands.fix_relay_event_names import canonical_name


class RelayNameTests(SimpleTestCase):
    def test_gender_words_are_stripped(self):
        self.assertEqual(canonical_name('4x100 M Freestyle Relay Men'),
                         '4x100 M Freestyle Relay')
        self.assertEqual(canonical_name('4x100 M Medley Relay Women'),
                         '4x100 M Medley Relay')

    def test_mixed_is_kept(self):
        self.assertEqual(canonical_name('4x50 M Medley Relay Mixed'),
                         '4x50 M Medley Relay Mixed')

    def test_unicode_x_and_garbled_stroke(self):
        self.assertEqual(canonical_name('4×100 M Medley Relay'),
                         '4x100 M Medley Relay')
        self.assertEqual(canonical_name('4x100 M 4 na ges Relay Mixed'),
                         '4x100 M Medley Relay Mixed')

    def test_already_canonical_is_unchanged(self):
        for n in ('4x100 M Freestyle Relay', '4x50 M Medley Relay Mixed'):
            self.assertEqual(canonical_name(n), n)

    def test_import_side_canonical_name(self):
        self.assertEqual(
            canonical_relay_name('4x100 M Freestyle Relay Men', 400, 'Freestyle'),
            '4x100 M Freestyle Relay')
        self.assertEqual(
            canonical_relay_name('4x100 M Medley Relay Women', 400,
                                 'Individual Medley'),
            '4x100 M Medley Relay')
        self.assertEqual(
            canonical_relay_name('4x50 M Medley Relay', 200,
                                 'Individual Medley', gender='X'),
            '4x50 M Medley Relay Mixed')
        # No distance/stroke: clean the raw name instead
        self.assertEqual(
            canonical_relay_name('4×100 M Freestyle Relay Dames'),
            '4x100 M Freestyle Relay')

    def test_normalize_stroke_with_injected_spaces(self):
        self.assertEqual(normalize_stroke('4 na ges'), 'Individual Medley')
        self.assertEqual(normalize_stroke('4 Nages'), 'Individual Medley')


class FixRelayEventNamesCommandTests(_MeetFixtureMixin, TestCase):
    def test_merge_gendered_duplicate(self):
        import datetime
        from django.core.management import call_command
        from core.models import Event
        canonical = Event.objects.create(
            name='4x100 M Freestyle Relay', distance=400,
            stroke='Freestyle', is_relay=True)
        gendered = Event.objects.create(
            name='4x100 M Freestyle Relay Men', distance=400,
            stroke='Freestyle', is_relay=True)
        champ = Championship.objects.create(
            name='Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)
        team = Swimmer.objects.create(
            name='Tunisia', nationality=self.country, sex='M')
        Result.objects.create(swimmer=team, championship=champ,
                              event=gendered, time_centiseconds=22000)
        call_command('fix_relay_event_names', verbosity=0)
        self.assertFalse(
            Event.objects.filter(name='4x100 M Freestyle Relay Men').exists())
        self.assertEqual(canonical.results.count(), 1)
        # Idempotent
        call_command('fix_relay_event_names', verbosity=0)
        self.assertEqual(canonical.results.count(), 1)

    def test_rename_when_no_canonical_exists(self):
        from django.core.management import call_command
        from core.models import Event
        Event.objects.create(
            name='4×100 M Medley Relay', distance=400,
            stroke='Individual Medley', is_relay=True)
        call_command('fix_relay_event_names', verbosity=0)
        self.assertTrue(
            Event.objects.filter(name='4x100 M Medley Relay').exists())


class AddResultsEndpointTests(_MeetFixtureMixin, TestCase):
    """Bulk manual-entry endpoint for adding missing events/days."""

    def setUp(self):
        import datetime
        self.champ = Championship.objects.create(
            name='Manual Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)
        self.url = f'/api/v1/championships/{self.champ.id}/add-results/'

    def _post(self, payload):
        return self.client.post(self.url, payload, content_type='application/json')

    def test_add_rows_creates_swimmers_and_results(self):
        resp = self._post({
            'event': self.event.id, 'gender': 'M', 'round_type': 'Finals',
            'category': '',
            'rows': [
                {'name': 'Ahmed HAFNAOUI', 'birth_year': '2002',
                 'country': 'TUN', 'team': 'CNM', 'time': '52.34'},
                {'name': 'Marwan ELKAMASH', 'birth_year': '', 'country': '',
                 'team': '', 'time': '1:02.34'},
            ],
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['created'], 2)
        self.assertEqual(data['created_swimmers'], 2)
        self.assertEqual(data['errors'], [])
        r = Result.objects.get(swimmer__name='Ahmed HAFNAOUI')
        self.assertEqual(r.time_centiseconds, 5234)
        self.assertEqual(r.round_type, 'Finals')
        self.assertEqual(r.team, 'CNM')
        self.assertEqual(r.age_at_competition, 24)
        r2 = Result.objects.get(swimmer__name='Marwan ELKAMASH')
        self.assertEqual(r2.time_centiseconds, 6234)

    def test_matches_existing_swimmer(self):
        existing = Swimmer.objects.create(
            name='Ahmed HAFNAOUI', birth_year=2002,
            nationality=self.country, sex='M')
        resp = self._post({
            'event': self.event.id, 'gender': 'M',
            'rows': [{'name': 'Ahmed HAFNAOUI', 'birth_year': '2002',
                      'time': '52.34'}],
        })
        data = resp.json()
        self.assertEqual(data['matched_swimmers'], 1)
        self.assertEqual(data['created_swimmers'], 0)
        self.assertEqual(existing.results.count(), 1)

    def test_invalid_rows_reported(self):
        resp = self._post({
            'event': self.event.id, 'gender': 'M',
            'rows': [
                {'name': '', 'time': '52.34'},
                {'name': 'X Y', 'time': 'abc'},
                {'name': 'Ok GUY', 'time': '59.99'},
            ],
        })
        data = resp.json()
        self.assertEqual(data['created'], 1)
        self.assertEqual(len(data['errors']), 2)

    def test_duplicate_keeps_better_time(self):
        payload = {
            'event': self.event.id, 'gender': 'M',
            'rows': [{'name': 'Ok GUY', 'time': '59.99'}],
        }
        self._post(payload)
        # Worse time: skipped
        payload['rows'][0]['time'] = '1:01.00'
        data = self._post(payload).json()
        self.assertEqual(data['created'], 0)
        self.assertEqual(len(data['errors']), 1)
        # Better time: updated
        payload['rows'][0]['time'] = '58.50'
        data = self._post(payload).json()
        self.assertEqual(data['updated'], 1)
        self.assertEqual(
            Result.objects.get(swimmer__name='Ok GUY').time_centiseconds, 5850)


# ---------------------------------------------------------------------------
# 5. Non-Arab swimmers: results imported normally, but no visible profile
# ---------------------------------------------------------------------------

class NonArabImportTests(_MeetFixtureMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from core.models import Country
        cls.rsa = Country.objects.create(
            name='South Africa', code='RSA', region='OTHER')

    def test_non_arab_results_are_imported(self):
        from importer.services import confirm_import
        preview = {
            'meet': {'name': 'African Champs', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '100 M Freestyle',
                'distance': 100, 'stroke': 'Freestyle',
                'gender': 'M', 'is_relay': False, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'Pieter COETZE', 'gender': 'M',
                     'category': '', 'time_centiseconds': 5200,
                     'birth_year': 2004, 'nationality_code': 'RSA'},
                    {'swimmer_name': 'Ahmed HAFNAOUI', 'gender': 'M',
                     'category': '', 'time_centiseconds': 5300,
                     'birth_year': 2002, 'nationality_code': 'TUN'},
                ],
            }],
        }
        confirm_import(preview, {})
        pieter = Swimmer.objects.get(name='Pieter COETZE')
        self.assertEqual(pieter.nationality.code, 'RSA')
        self.assertEqual(pieter.results.count(), 1)
        self.assertTrue(Swimmer.objects.filter(name='Ahmed HAFNAOUI').exists())

    def test_non_arab_relay_team_is_imported(self):
        from importer.services import confirm_import
        from core.models import Event
        Event.objects.create(name='4x100 M Freestyle Relay', distance=400,
                             stroke='Freestyle', is_relay=True)
        preview = {
            'meet': {'name': 'African Champs', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '4x100 M Freestyle Relay',
                'distance': 400, 'stroke': 'Freestyle',
                'gender': 'M', 'is_relay': True, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'South Africa', 'gender': 'M',
                     'category': '', 'time_centiseconds': 20000,
                     'birth_year': 0, 'nationality_code': ''},
                    {'swimmer_name': 'Tunisia', 'gender': 'M',
                     'category': '', 'time_centiseconds': 20500,
                     'birth_year': 0, 'nationality_code': 'TUN'},
                ],
            }],
        }
        confirm_import(preview, {})
        self.assertTrue(Swimmer.objects.filter(name='South Africa').exists())
        self.assertTrue(Swimmer.objects.filter(name='Tunisia').exists())
        # Relay placeholders are flagged so they never surface as athletes
        self.assertTrue(Swimmer.objects.get(name='South Africa').is_relay_team)
        self.assertTrue(Swimmer.objects.get(name='Tunisia').is_relay_team)

    def test_add_results_endpoint_accepts_non_arab(self):
        import datetime
        champ = Championship.objects.create(
            name='Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)
        resp = self.client.post(
            f'/api/v1/championships/{champ.id}/add-results/',
            {'event': self.event.id, 'gender': 'M',
             'rows': [{'name': 'Pieter COETZE', 'country': 'RSA', 'time': '52.00'},
                      {'name': 'Ahmed HAFNAOUI', 'country': 'TUN', 'time': '53.00'}]},
            content_type='application/json')
        data = resp.json()
        self.assertEqual(data['created'], 2)
        self.assertEqual(len(data['errors']), 0)

    def test_non_arab_swimmers_hidden_from_swimmers_section(self):
        foreign = Swimmer.objects.create(
            name='Pieter COETZE', nationality=self.rsa, sex='M')
        arab = Swimmer.objects.create(
            name='Ahmed HAFNAOUI', nationality=self.country, sex='M')
        names = [s['name'] for s in self.client.get('/api/v1/swimmers/').json()]
        self.assertIn('Ahmed HAFNAOUI', names)
        self.assertNotIn('Pieter COETZE', names)
        search = [s['name'] for s in self.client.get(
            '/api/v1/swimmers/search/?q=COETZE').json()]
        self.assertEqual(search, [])
        # Detail stays reachable so meet result rows can still link out
        self.assertEqual(
            self.client.get(f'/api/v1/swimmers/{foreign.id}/').status_code, 200)


class RelayTeamPlaceholderTests(_MeetFixtureMixin, TestCase):
    """Relay results are stored on placeholder Swimmer rows (name = team
    name). Those placeholders must never appear as athletes in the app."""

    def _make_relay_placeholder(self, name='CN TUNIS', flagged=True):
        import datetime
        from core.models import Event
        relay_event = Event.objects.create(
            name='4x100 M Freestyle Relay', distance=400,
            stroke='Freestyle', is_relay=True)
        champ = Championship.objects.create(
            name='Relay Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)
        team = Swimmer.objects.create(
            name=name, nationality=self.country, sex='M', club=name,
            is_relay_team=flagged)
        Result.objects.create(swimmer=team, championship=champ,
                              event=relay_event, time_centiseconds=21000)
        return team, champ

    def test_relay_teams_hidden_from_swimmers_list_and_search(self):
        team, _ = self._make_relay_placeholder()
        Swimmer.objects.create(name='Ahmed HAFNAOUI',
                               nationality=self.country, sex='M')
        names = [s['name'] for s in self.client.get('/api/v1/swimmers/').json()]
        self.assertIn('Ahmed HAFNAOUI', names)
        self.assertNotIn('CN TUNIS', names)
        search = self.client.get('/api/v1/swimmers/search/?q=TUNIS').json()
        self.assertEqual(search, [])

    def test_relay_teams_excluded_from_championship_swimmer_counts(self):
        team, champ = self._make_relay_placeholder()
        athlete = Swimmer.objects.create(
            name='Ahmed HAFNAOUI', nationality=self.country, sex='M')
        Result.objects.create(swimmer=athlete, championship=champ,
                              event=self.event, time_centiseconds=5200)
        stats = self.client.get(
            f'/api/v1/championships/{champ.id}/stats/').json()
        self.assertEqual(stats['total_swimmers'], 1)
        self.assertEqual(stats['male_count'], 1)
        self.assertEqual(stats['total_results'], 2)

    def test_mark_relay_teams_backfill(self):
        from django.core.management import call_command
        team, champ = self._make_relay_placeholder(flagged=False)
        athlete = Swimmer.objects.create(
            name='Ahmed HAFNAOUI', nationality=self.country, sex='M')
        Result.objects.create(swimmer=athlete, championship=champ,
                              event=self.event, time_centiseconds=5200)
        call_command('mark_relay_teams', verbosity=0)
        team.refresh_from_db()
        athlete.refresh_from_db()
        self.assertTrue(team.is_relay_team)
        self.assertFalse(athlete.is_relay_team)

    def test_matcher_never_matches_a_relay_placeholder(self):
        from importer.matcher import find_matching_swimmer
        from importer.parsers.base import ParsedResult
        self._make_relay_placeholder(name='EGYPT')
        pr = ParsedResult(swimmer_name='EGYPT', time_text='', birth_year=2008)
        swimmer, _conf, match_type = find_matching_swimmer(pr)
        self.assertIsNone(swimmer)
        self.assertEqual(match_type, 'new')


class UnrankedSwimmerTests(TestCase):
    """N.C ("non classé") / H.C ("hors concours") swimmers have no rank in
    the source file but swam a real time — they must be read and imported."""

    def test_nat2i_nc_and_hc_rows_are_kept(self):
        from importer.parsers import nat2i_parser
        html = '''<html><body>
        <p>100 m NAGE LIBRE Messieurs Classement</p>
        <table>
        <tr><td>Place</td><td>Nom et pr&eacute;nom</td><td>Nation</td><td>Naissance</td><td>Club</td><td>Temps</td><td>Points</td><td>Temps de passage</td></tr>
        <tr><td>1.</td><td>TRABELSI Youssef</td><td>TUN</td><td>2008</td><td>CNT</td><td>1:02.34</td><td>500</td><td></td></tr>
        <tr><td>N.C.</td><td>BEN AHMED Karim</td><td>TUN</td><td>2009</td><td>ASM</td><td>1:03.00</td><td>480</td><td></td></tr>
        <tr><td>H.C.</td><td>DOUMA Sami</td><td>TUN</td><td>2007</td><td>EST</td><td>1:04.00</td><td>460</td><td></td></tr>
        <tr><td>N.C.</td><td>ABSENT Amine</td><td>TUN</td><td>2009</td><td>ASM</td><td>Frf</td><td>0</td><td></td></tr>
        </table></body></html>'''
        meet = nat2i_parser.parse(html)
        self.assertEqual(len(meet.events), 1)
        kept = [r for r in meet.events[0].results
                if r.status == 'OK' and r.time_centiseconds > 0]
        self.assertEqual(
            {r.swimmer_name for r in kept},
            {'Youssef TRABELSI', 'Karim BEN AHMED', 'Sami DOUMA'})
        by_name = {r.swimmer_name: r for r in kept}
        self.assertEqual(by_name['Karim BEN AHMED'].rank, 0)
        self.assertEqual(by_name['Karim BEN AHMED'].time_centiseconds, 6300)
        self.assertEqual(by_name['Sami DOUMA'].rank, 0)
        # The forfeit row must not come back as an OK result
        self.assertNotIn('Amine ABSENT', {r.swimmer_name for r in kept})

    def test_splash_nc_and_hc_lines_are_parsed(self):
        from importer.parsers import splash_parser
        from importer.parsers.base import ParsedEvent
        event = ParsedEvent(event_name='50 M Freestyle', distance=50,
                            stroke='Freestyle', gender='M')
        for prefix in ('n.c.', 'N.C.', 'h.c.', 'H.C', 'nc', 'HC'):
            r = splash_parser._parse_result_line(
                f'{prefix} RAHMOUNI, Mahdi 12 Union Sportf Biskra 28.23 350',
                event, False, 5)
            self.assertIsNotNone(r, f'line with "{prefix}" not parsed')
            self.assertEqual(r.swimmer_name, 'Mahdi RAHMOUNI')
            self.assertEqual(r.rank, 0)  # unranked, not tied with prev rank
            self.assertEqual(r.time_centiseconds, 2823)
            self.assertEqual(r.status, 'OK')

    def test_splash_normal_names_still_parse_as_ties(self):
        from importer.parsers import splash_parser
        from importer.parsers.base import ParsedEvent
        event = ParsedEvent(event_name='50 M Freestyle', distance=50,
                            stroke='Freestyle', gender='M')
        r = splash_parser._parse_result_line(
            'RAHMOUNI, Mahdi 12 Union Sportf Biskra 28.23 350', event, False, 5)
        self.assertIsNotNone(r)
        self.assertEqual(r.rank, 5)  # tie line inherits previous rank


class Nat2iRelaySplitTests(TestCase):
    """Relay passage times must be turned into per-swimmer leg splits."""

    RELAY_HTML = '''<html><body>
    <p>4x50 m NAGE LIBRE Messieurs</p>
    <table>
    <tr><td>Place</td><td>Nom et prenom</td><td>Nation</td><td>Naissance</td><td>Club</td><td>Temps</td><td>Points</td><td>Temps de passage</td></tr>
    <tr><td>1.</td><td>TRABELSI Youssef</td><td>TUN</td><td>2008</td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td>BEN AHMED Karim</td><td>TUN</td><td>2009</td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td>DOUMA Sami</td><td>TUN</td><td>2007</td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td>JLASSI Omar</td><td>TUN</td><td>2006</td><td>CNT</td><td>1:45.00</td><td>600</td><td>25.00 (50 m) - 52.00 (100 m) - 1:19.00 (150 m) - 1:45.00 (200 m)</td></tr>
    </table></body></html>'''

    def test_leg_times_matched_to_each_swimmer(self):
        from importer.parsers import nat2i_parser
        meet = nat2i_parser.parse(self.RELAY_HTML)
        self.assertEqual(len(meet.events), 1)
        results = meet.events[0].results
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].split_times, [
            'Youssef TRABELSI 25.00',
            'Karim BEN AHMED 27.00',
            'Sami DOUMA 27.00',
            'Omar JLASSI 26.00',
        ])

    def test_missing_boundary_leaves_name_without_split(self):
        from importer.parsers import nat2i_parser
        # Passage times only at 50 and 200 — legs 2 and 3 can't be derived
        html = self.RELAY_HTML.replace(
            '25.00 (50 m) - 52.00 (100 m) - 1:19.00 (150 m) - 1:45.00 (200 m)',
            '25.00 (50 m) - 1:45.00 (200 m)')
        meet = nat2i_parser.parse(html)
        self.assertEqual(meet.events[0].results[0].split_times, [
            'Youssef TRABELSI 25.00',
            'Karim BEN AHMED',
            'Sami DOUMA',
            'Omar JLASSI',
        ])

    def test_no_passage_times_keeps_names_and_final_leg(self):
        from importer.parsers import nat2i_parser
        html = self.RELAY_HTML.replace(
            '25.00 (50 m) - 52.00 (100 m) - 1:19.00 (150 m) - 1:45.00 (200 m)', '')
        meet = nat2i_parser.parse(html)
        splits = meet.events[0].results[0].split_times
        self.assertEqual(splits[:3], [
            'Youssef TRABELSI', 'Karim BEN AHMED', 'Sami DOUMA'])

    def test_confirm_import_stores_relay_swimmer_splits(self):
        from importer.parsers import nat2i_parser
        from importer.services import confirm_import
        import importer.matcher as matcher
        from core.models import Country
        matcher._country_cache = None
        Country.objects.get_or_create(name='Tunisia', code='TUN',
                                      defaults={'region': 'ARAB'})
        meet = nat2i_parser.parse(self.RELAY_HTML)
        preview = {
            'meet': {'name': 'Tunisia Relay Meet', 'date': '2026-06-01',
                     'pool': 'LCM'},
            'events': [{
                'event_name': meet.events[0].event_name,
                'distance': meet.events[0].distance,
                'stroke': meet.events[0].stroke,
                'gender': 'M', 'is_relay': True, 'round_type': 'Finals',
                'results': [{
                    'swimmer_name': r.swimmer_name, 'gender': 'M',
                    'time_centiseconds': r.time_centiseconds,
                    'birth_year': 0, 'nationality_code': 'TUN',
                    'is_relay': True, 'split_times': r.split_times,
                } for r in meet.events[0].results],
            }],
        }
        confirm_import(preview, {})
        result = Result.objects.get()
        self.assertEqual(result.relay_swimmers, [
            {'name': 'Youssef TRABELSI', 'split_time': '25.00'},
            {'name': 'Karim BEN AHMED', 'split_time': '27.00'},
            {'name': 'Sami DOUMA', 'split_time': '27.00'},
            {'name': 'Omar JLASSI', 'split_time': '26.00'},
        ])


class JordanHytekSeedTimeTests(TestCase):
    """Jordan HyTek lines carry Seed Time BEFORE Finals Time — the parser
    must read the second time as the swim time, not the seed."""

    HEADER = (
        'Jordan Age Group Championship - HY-TEK\'s MEET MANAGER\n'
        'Results\n'
        'Event 1 Boys 13-14 1500 LC Meter Freestyle\n'
    )

    def _parse(self, body):
        from importer.parsers import hytek_parser
        return hytek_parser.parse(self.HEADER + body)

    def test_reads_finals_time_not_seed(self):
        meet = self._parse(
            'ID# Name Age Team Seed Time Finals Time FINA\n'
            '1 10011446 Sinukrot, Karim 13 HCSC 20:02.27 19:40.26 369\n')
        r = meet.events[0].results[0]
        self.assertEqual(r.time_text, '19:40.26')
        self.assertEqual(r.time_centiseconds, 118026)
        self.assertEqual(r.fina_points, 369)
        self.assertEqual(r.rank, 1)
        self.assertEqual(r.age, 13)
        self.assertEqual(r.club, 'HCSC')
        self.assertEqual(r.swimmer_name, 'Karim SINUKROT')

    def test_nt_seed_falls_back_to_single_time(self):
        meet = self._parse(
            'ID# Name Age Team Seed Time Finals Time FINA\n'
            '2 20011391 Hawwash, Yanal 13 ORTH NT 19:42.81 367\n')
        r = meet.events[0].results[0]
        self.assertEqual(r.time_text, '19:42.81')
        self.assertEqual(r.fina_points, 367)
        self.assertEqual(r.swimmer_name, 'Yanal HAWWASH')

    def test_dq_with_seed_time_is_not_a_timed_result(self):
        meet = self._parse(
            'ID# Name Age Team Seed Time Finals Time FINA\n'
            '1 10011446 Sinukrot, Karim 13 HCSC 20:02.27 19:40.26 369\n'
            '--- 20011367 Masarweh, Assiel 13 ORTH 3:16.31 DQ\n')
        results = meet.events[0].results
        self.assertEqual(len(results), 2)
        dq = results[1]
        self.assertEqual(dq.status, 'DQ')
        self.assertEqual(dq.time_text, '')
        self.assertEqual(dq.swimmer_name, 'Assiel MASARWEH')

    def test_header_without_seed_column_keeps_first_time(self):
        meet = self._parse(
            'Event 2 Girls 11-12 50 LC Meter Freestyle\n'
            'Name Age Team Finals Time\n'
            '1 Josselin, Holly 11 EXCW 29.70\n')
        event = [e for e in meet.events if e.distance == 50][0]
        r = event.results[0]
        self.assertEqual(r.time_text, '29.70')


class ExcelCellAccuracyTests(SimpleTestCase):
    """Excel cells must be understood whatever shape Excel stored them in."""

    def test_time_cells_all_shapes(self):
        import datetime
        from importer.parsers.detector import _cell_time_str
        # text stays text (comma decimals normalized)
        self.assertEqual(_cell_time_str('7:57.54'), '7:57.54')
        self.assertEqual(_cell_time_str('1:02,45'), '1:02.45')
        # "7:57.54" typed into a time-formatted cell arrives as 07:57:54
        self.assertEqual(_cell_time_str(datetime.time(7, 57, 54)), '7:57.54')
        # "25.43" in a time cell arrives as 00:25:43
        self.assertEqual(_cell_time_str(datetime.time(0, 25, 43)), '25.43')
        # true sub-second time cell keeps its centiseconds
        self.assertEqual(_cell_time_str(datetime.time(0, 2, 5, 300000)), '2:05.30')
        # timedelta and numeric seconds
        self.assertEqual(_cell_time_str(datetime.timedelta(minutes=2, seconds=5.3)), '2:05.30')
        self.assertEqual(_cell_time_str(125.3), '2:05.30')
        self.assertEqual(_cell_time_str(57.54), '57.54')

    def test_status_cells_are_not_times(self):
        from importer.parsers.detector import _cell_time_str
        for status in ('DQ', 'dsq', 'DNS', 'NT', 'N.C', 'H.C', '-', '/', 'nan', ''):
            self.assertEqual(_cell_time_str(status), '', status)

    def test_int_cells(self):
        from importer.parsers.detector import _cell_int
        self.assertEqual(_cell_int('1er'), 1)
        self.assertEqual(_cell_int('2nd'), 2)
        self.assertEqual(_cell_int(' 3 '), 3)
        self.assertEqual(_cell_int(2.0), 2)
        self.assertIsNone(_cell_int('DSQ'))
        self.assertIsNone(_cell_int(None))

    def test_gender_cells(self):
        from importer.parsers.detector import _cell_gender
        for v in ('M', 'Male', 'Men', "Men's", 'Homme', 'Boys', 'garcons'):
            self.assertEqual(_cell_gender(v), 'M', v)
        for v in ('F', 'Female', 'Women', "Women's", 'Filles', 'Dames'):
            self.assertEqual(_cell_gender(v), 'F', v)
        self.assertEqual(_cell_gender('Mixed'), 'X')
        self.assertEqual(_cell_gender('??'), '')


class ExcelWorkbookTests(SimpleTestCase):
    """End-to-end: every sheet read, relays and categories separated."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import datetime
        import tempfile
        import pandas as pd
        cls.tmp = tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False)
        individual = pd.DataFrame({
            'Events': ['50 M Freestyle', '50 M Freestyle', '50 M Freestyle',
                       '50 M Freestyle'],
            'Category': ['Junior', 'Junior', 'Senior', 'Senior'],
            'Round': ['Final', 'Final', 'Final', 'Final'],
            'Swimmer Name': ['Omar KAMAL', 'Ali HASSAN', 'Sami NOUR', 'Zed DQED'],
            # a time-formatted cell, a text time, a numeric-seconds cell, a DQ
            'Time': [datetime.time(0, 25, 43), '26.10', 26.55, 'DQ'],
            'Rank': ['1er', 2, 1, 'DSQ'],
            'YoB': [2008, 2008.0, '2001', 2000],
            'Nationality': ['EGY', 'EGY', 'EGY', 'EGY'],
            'Gender': ['Male', 'M', "Men's", 'M'],
            'Pool': ['LCM'] * 4,
            'Championships Name': ['Test Cup'] * 4,
            'Meet City': ['Cairo'] * 4,
            'Date': ['12/05/2026'] * 4,
        })
        # second individual sheet must also be read
        extra = pd.DataFrame({
            'Events': ['100 M Backstroke'],
            'Category': ['Junior'],
            'Round': ['Final'],
            'Swimmer Name': ['Nada FAWZY'],
            'Time': ['1:05.20'],
            'Gender': ['Female'],
        })
        relay = pd.DataFrame({
            'Events': ['4x100 M Freestyle Relay'] * 8,
            'Relay': ["Men's"] * 8,
            'Category': ['Junior'] * 4 + ['Senior'] * 4,
            'Round': ['Final'] * 8,
            'Team Time': ['3:30.00'] * 4 + ['3:25.00'] * 4,
            'Team Name': ['Cairo Club'] * 4 + ['Alex Club'] * 4,
            'Swimmer Name': [f'Swimmer {i} CAIRO' for i in range(1, 5)] +
                            [f'Swimmer {i} ALEX' for i in range(1, 5)],
            'Split Time': [datetime.time(0, 52, 30), '52.50', '52.60', '52.60',
                           '51.10', '51.20', '51.30', '51.40'],
            'Gender': ['Male'] * 8,
        })
        with pd.ExcelWriter(cls.tmp.name) as xl:
            individual.to_excel(xl, sheet_name='Individual', index=False)
            extra.to_excel(xl, sheet_name='More Results', index=False)
            relay.to_excel(xl, sheet_name='Relay', index=False)

        from importer.parsers.detector import detect_and_parse
        cls.meet = detect_and_parse(cls.tmp.name)

    @classmethod
    def tearDownClass(cls):
        import os
        os.unlink(cls.tmp.name)
        super().tearDownClass()

    def test_meta(self):
        self.assertEqual(self.meet.meet_name, 'Test Cup')
        self.assertEqual(self.meet.location, 'Cairo')
        self.assertEqual(self.meet.pool, 'LCM')
        self.assertEqual(self.meet.date_text, '2026-05-12')

    def test_individual_categories_separated(self):
        free = [e for e in self.meet.events if e.event_name == '50 M Freestyle']
        self.assertEqual({e.age_group for e in free}, {'Junior', 'Senior'})

    def test_cells_understood(self):
        junior = next(e for e in self.meet.events
                      if e.event_name == '50 M Freestyle' and e.age_group == 'Junior')
        omar = next(r for r in junior.results if r.swimmer_name == 'Omar KAMAL')
        self.assertEqual(omar.time_text, '25.43')   # time-formatted cell
        self.assertEqual(omar.rank, 1)              # "1er"
        self.assertEqual(omar.birth_year, 2008)
        senior = next(e for e in self.meet.events
                      if e.event_name == '50 M Freestyle' and e.age_group == 'Senior')
        sami = next(r for r in senior.results if r.swimmer_name == 'Sami NOUR')
        self.assertEqual(sami.time_text, '26.55')   # numeric-seconds cell
        self.assertEqual(sami.birth_year, 2001)     # text year

    def test_dq_row_not_a_timed_result(self):
        names = {r.swimmer_name for e in self.meet.events for r in e.results}
        self.assertNotIn('Zed DQED', names)

    def test_all_sheets_read(self):
        names = {r.swimmer_name for e in self.meet.events for r in e.results}
        self.assertIn('Nada FAWZY', names)  # from the second individual sheet

    def test_relay_categories_separated_with_splits(self):
        relays = [e for e in self.meet.events if 'relay' in e.event_name.lower()]
        self.assertEqual({e.age_group for e in relays}, {'Junior', 'Senior'})
        junior = next(e for e in relays if e.age_group == 'Junior')
        self.assertEqual(len(junior.results), 1)
        team = junior.results[0]
        self.assertEqual(team.swimmer_name, 'Cairo Club')
        self.assertEqual(team.time_text, '3:30.00')
        self.assertEqual(team.gender, 'M')
        self.assertEqual(len(team.split_times), 4)
        self.assertEqual(team.split_times[0], 'Swimmer 1 CAIRO 52.30')
