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

    def test_full_range_ignores_record_dates(self):
        """The 'to' range should win; record dates from other years are ignored."""
        header = (
            '4EME CHAMPIONNATS ARABE - 28/08/2025 to 01/09/2025 '
            'CHAMP ARABE: 25.24 * 25/08/2024 ZYAD JAMAL ACHRI'
        )
        start, end, _ = extract_date_and_location(header)
        self.assertEqual(start, '2025-08-28')
        self.assertEqual(end, '2025-09-01')

    def test_day_range_not_fooled_by_year(self):
        """'2025 - 09/05/2025' must not treat '25' from 2025 as a start day."""
        header = '2nd Open Winter Championship 2025 - 09/05/2025 to 12/05/2025'
        start, end, _ = extract_date_and_location(header)
        self.assertEqual(start, '2025-05-09')
        self.assertEqual(end, '2025-05-12')

    def test_month_name_english(self):
        start, end, _ = extract_date_and_location(
            'Arab Championships - 28-31 August 2025 - Rabat')
        self.assertEqual(start, '2025-08-28')
        self.assertEqual(end, '2025-08-31')

    def test_month_name_french(self):
        start, end, _ = extract_date_and_location(
            'Championnat - 10 mai 2026 - Marrakech')
        self.assertEqual(start, '2026-05-10')

    def test_single_date_no_end(self):
        start, end, _ = extract_date_and_location(
            'COUPE DU TRONE - 10/05/2026 - MARRAKECH')
        self.assertEqual(start, '2026-05-10')
        self.assertEqual(end, '')


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
        # keeps only the age-category copy. Heats are kept alongside finals.
        m = self.meet()
        self.assertEqual(m.total_events, 102)
        self.assertEqual(m.total_results, 1226)

    def test_rounds(self):
        rounds = collections.Counter(
            r.round_type or '(none)' for ev in self.meet().events for r in ev.results)
        self.assertEqual(rounds['Finals'], 241)
        self.assertEqual(rounds['Heats'], 985)
        self.assertEqual(rounds.get('(none)', 0), 0)

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

    def test_rounds_present(self):
        # Both heats and finals are kept when they have different swimmers
        rounds = collections.Counter(
            r.round_type for ev in self.meet().events for r in ev.results)
        self.assertEqual(rounds['Heats'], 120)
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
        self.assertEqual(m.total_results, 1265)

    def test_prelims_vs_finals(self):
        # Both prelims and finals kept when they have different swimmers.
        rounds = collections.Counter(
            r.round_type for ev in self.meet().events for r in ev.results)
        self.assertEqual(rounds['Prelims'], 533)
        self.assertEqual(rounds['Finals'], 732)
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
        # Write endpoints require authentication
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.create_user(
            username='tester', password='test-pass-123', role='ADMIN')
        self.client.force_login(user)
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


class ManualEditSurvivesReimportTests(_MeetFixtureMixin, TestCase):
    """A hand-edited result must never be overwritten by a re-import of the
    same meet — manual admin edits always win over the automatic pipeline."""

    def _preview(self, time_cs=5740):
        return {
            'meet': {'name': 'Edit Meet', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '100 M Freestyle',
                'distance': 100, 'stroke': 'Freestyle',
                'gender': 'M', 'is_relay': False, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'Karim NADER', 'gender': 'M',
                     'category': 'Seniors', 'time_centiseconds': time_cs,
                     'birth_year': 0, 'nationality_code': 'TUN'},
                ],
            }],
        }

    def test_manual_edit_not_overwritten_by_faster_reimport(self):
        from importer.services import confirm_import
        confirm_import(self._preview(time_cs=5740), {})
        champ_id = Championship.objects.get().id
        result = Result.objects.get()
        # Admin corrects the time and it locks the row
        result.time_centiseconds = 5999
        result.manually_edited = True
        result.save(update_fields=['time_centiseconds', 'manually_edited'])
        # Re-import brings a *faster* time — which would normally win — but
        # the manual edit must be preserved.
        confirm_import(self._preview(time_cs=5001), {}, championship_id=champ_id)
        result.refresh_from_db()
        self.assertEqual(result.time_centiseconds, 5999)
        self.assertEqual(Result.objects.count(), 1)


class RelaySquadImportTests(_MeetFixtureMixin, TestCase):
    """A club can enter several squads in one relay event ("MC ALGER 1",
    "MC ALGER 2"). They share one placeholder swimmer, but each squad
    must keep its own result row."""

    def _preview(self):
        return {
            'meet': {'name': 'Relay Meet', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '4x100 M Freestyle Relay',
                'distance': 400, 'stroke': 'Freestyle',
                'gender': 'F', 'is_relay': True, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'MC ALGER 1', 'gender': 'F',
                     'category': '', 'time_centiseconds': 24246,
                     'birth_year': 0, 'nationality_code': 'ALG'},
                    {'swimmer_name': 'MC ALGER 2', 'gender': 'F',
                     'category': '', 'time_centiseconds': 25133,
                     'birth_year': 0, 'nationality_code': 'ALG'},
                ],
            }],
        }

    def test_both_squads_keep_their_results(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        placeholders = Swimmer.objects.filter(name__iexact='MC ALGER')
        self.assertEqual(placeholders.count(), 1)
        results = Result.objects.filter(swimmer=placeholders[0])
        self.assertEqual(results.count(), 2)
        self.assertEqual({r.time_centiseconds for r in results},
                         {24246, 25133})
        self.assertEqual({r.team for r in results},
                         {'MC ALGER 1', 'MC ALGER 2'})

    def test_reimport_is_idempotent(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        champ_id = Championship.objects.get().id
        confirm_import(self._preview(), {}, championship_id=champ_id)
        self.assertEqual(Result.objects.count(), 2)
        self.assertEqual(
            Swimmer.objects.filter(name__iexact='MC ALGER').count(), 1)

    def test_legacy_stripped_row_adopts_squad_name(self):
        """Rows imported before the squad fix stored the stripped club
        name; a re-import must rename them instead of duplicating."""
        import datetime
        from core.models import Event
        from importer.services import confirm_import
        champ = Championship.objects.create(
            name='Relay Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)
        relay_event = Event.objects.create(
            name='4x100 M Freestyle Relay', distance=400,
            stroke='Freestyle', is_relay=True)
        placeholder = Swimmer.objects.create(
            name='MC ALGER', nationality=self.country, sex='F',
            club='MC ALGER', is_relay_team=True)
        Result.objects.create(
            swimmer=placeholder, championship=champ, event=relay_event,
            round_type='Finals', category='', team='MC ALGER',
            time_centiseconds=24246)
        confirm_import(self._preview(), {}, championship_id=champ.id)
        results = Result.objects.filter(swimmer=placeholder)
        self.assertEqual(results.count(), 2)
        self.assertEqual({r.team for r in results},
                         {'MC ALGER 1', 'MC ALGER 2'})

    def test_identically_named_squads_both_import(self):
        """Algerian heats sheets list a club's squads without numbers
        ('MC ALGER' twice) — both rows must import and re-imports must
        stay idempotent."""
        from importer.services import confirm_import
        preview = self._preview()
        for r in preview['events'][0]['results']:
            r['swimmer_name'] = 'MC ALGER'
        confirm_import(preview, {})
        placeholder = Swimmer.objects.get(name__iexact='MC ALGER')
        results = Result.objects.filter(swimmer=placeholder)
        self.assertEqual(results.count(), 2)
        self.assertEqual({r.time_centiseconds for r in results},
                         {24246, 25133})
        champ_id = Championship.objects.get().id
        confirm_import(preview, {}, championship_id=champ_id)
        self.assertEqual(Result.objects.count(), 2)

    def test_legacy_row_with_stale_time_updated_in_place(self):
        """An unnumbered squad whose legacy row holds a different (merged)
        time must update that row, not violate the unique constraint."""
        import datetime
        from core.models import Event
        from importer.services import confirm_import
        champ = Championship.objects.create(
            name='Relay Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)
        relay_event = Event.objects.create(
            name='4x100 M Freestyle Relay', distance=400,
            stroke='Freestyle', is_relay=True)
        placeholder = Swimmer.objects.create(
            name='MC ALGER', nationality=self.country, sex='F',
            club='MC ALGER', is_relay_team=True)
        Result.objects.create(
            swimmer=placeholder, championship=champ, event=relay_event,
            round_type='Finals', category='', team='MC ALGER',
            time_centiseconds=24000)  # matches neither incoming squad
        preview = self._preview()
        preview['events'][0]['results'][0]['swimmer_name'] = 'MC ALGER'
        confirm_import(preview, {}, championship_id=champ.id)
        results = Result.objects.filter(swimmer=placeholder)
        self.assertEqual(results.count(), 2)
        self.assertEqual({r.time_centiseconds for r in results},
                         {24246, 25133})
        self.assertEqual({r.team for r in results},
                         {'MC ALGER', 'MC ALGER 2'})


class SameNameBirthYearTests(_MeetFixtureMixin, TestCase):
    """Two same-named athletes with different explicit birth years must
    stay separate — the matcher's ±1-year tolerance must not merge them
    (Lina MAHI b.2006 vs Lina MAHI b.2007, Algeria 2022)."""

    def _preview(self):
        return {
            'meet': {'name': 'Test Meet', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '100 M Freestyle',
                'distance': 100, 'stroke': 'Freestyle',
                'gender': 'F', 'is_relay': False, 'round_type': 'Heats',
                'results': [
                    {'swimmer_name': 'Lina MAHI', 'gender': 'F',
                     'category': '15-16', 'time_centiseconds': 8163,
                     'birth_year': 2007, 'nationality_code': 'ALG',
                     'club': 'EL AMEL BLIDA'},
                    {'swimmer_name': 'Lina MAHI', 'gender': 'F',
                     'category': '15-16', 'time_centiseconds': 8730,
                     'birth_year': 2006, 'nationality_code': 'ALG',
                     'club': 'SN EL BIER'},
                ],
            }],
        }

    def test_two_birth_years_create_two_swimmers(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        swimmers = Swimmer.objects.filter(name__iexact='Lina MAHI')
        self.assertEqual(swimmers.count(), 2)
        times = set()
        for s in swimmers:
            rs = list(s.results.all())
            self.assertEqual(len(rs), 1)
            times.add(rs[0].time_centiseconds)
        self.assertEqual(times, {8163, 8730})

    def test_reimport_matches_existing_pair(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        champ_id = Championship.objects.get().id
        confirm_import(self._preview(), {}, championship_id=champ_id)
        self.assertEqual(
            Swimmer.objects.filter(name__iexact='Lina MAHI').count(), 2)
        self.assertEqual(Result.objects.count(), 2)


class SameNameSameYearTests(_MeetFixtureMixin, TestCase):
    """Two same-named athletes born the SAME year but in different clubs
    must stay separate (two 'Mohamed Amine DRIDI' b.2010, Tunisie 2025)."""

    def _preview(self):
        return {
            'meet': {'name': 'Test Meet', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '100 M Freestyle',
                'distance': 100, 'stroke': 'Freestyle',
                'gender': 'M', 'is_relay': False, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'Mohamed Amine DRIDI', 'gender': 'M',
                     'category': 'Minimes', 'time_centiseconds': 6595,
                     'birth_year': 2010, 'nationality_code': 'TUN',
                     'club': 'CA'},
                    {'swimmer_name': 'Mohamed Amine DRIDI', 'gender': 'M',
                     'category': 'Minimes', 'time_centiseconds': 7106,
                     'birth_year': 2010, 'nationality_code': 'TUN',
                     'club': 'OLYMPICA'},
                ],
            }],
        }

    def test_different_clubs_create_two_swimmers(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        swimmers = Swimmer.objects.filter(name__iexact='Mohamed Amine DRIDI')
        self.assertEqual(swimmers.count(), 2)
        self.assertEqual({s.club for s in swimmers}, {'CA', 'OLYMPICA'})
        for s in swimmers:
            self.assertEqual(s.results.count(), 1)

    def test_reimport_matches_each_to_own_club_profile(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {})
        champ_id = Championship.objects.get().id
        confirm_import(self._preview(), {}, championship_id=champ_id)
        swimmers = Swimmer.objects.filter(name__iexact='Mohamed Amine DRIDI')
        self.assertEqual(swimmers.count(), 2)
        self.assertEqual(Result.objects.count(), 2)
        for s in swimmers:
            self.assertEqual(s.results.count(), 1)


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


class MergeSwimmersRelayLegRenameTests(_MeetFixtureMixin, TestCase):
    """merge_swimmers must rewrite the duplicate's name inside relay_swimmers
    JSON — relay legs are matched to profiles by exact name, so leaving the
    old spelling behind orphans the legs and shows stale names in the UI."""

    def _relay_fixture(self):
        import datetime
        from core.models import Event
        relay_event = Event.objects.create(
            name='4x100 M Freestyle Relay', distance=400,
            stroke='Freestyle', is_relay=True)
        champ = Championship.objects.create(
            name='Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)
        team = Swimmer.objects.create(
            name='Tunisia', nationality=self.country, sex='M', is_relay_team=True)
        return relay_event, champ, team

    def test_dict_legs_renamed_to_kept_profile(self):
        from importer.matcher import merge_swimmers
        relay_event, champ, team = self._relay_fixture()
        keep = Swimmer.objects.create(
            name='Ahmed BEN SALEM', nationality=self.country, sex='M')
        remove = Swimmer.objects.create(
            name='BEN SALEM Ahmed', nationality=self.country, sex='M')
        r = Result.objects.create(
            swimmer=team, championship=champ, event=relay_event,
            time_centiseconds=20000,
            relay_swimmers=[
                {'name': 'BEN SALEM Ahmed', 'split_time': '52.10'},
                {'name': 'Youssef TRABELSI', 'split_time': '53.00'},
            ])
        merge_swimmers(keep, remove)
        r.refresh_from_db()
        self.assertEqual(r.relay_swimmers[0]['name'], 'Ahmed BEN SALEM')
        # split preserved, other legs untouched
        self.assertEqual(r.relay_swimmers[0]['split_time'], '52.10')
        self.assertEqual(r.relay_swimmers[1]['name'], 'Youssef TRABELSI')

    def test_string_legs_renamed(self):
        from importer.matcher import merge_swimmers
        relay_event, champ, team = self._relay_fixture()
        keep = Swimmer.objects.create(
            name='Ahmed BEN SALEM', nationality=self.country, sex='M')
        remove = Swimmer.objects.create(
            name='BEN SALEM Ahmed', nationality=self.country, sex='M')
        r = Result.objects.create(
            swimmer=team, championship=champ, event=relay_event,
            time_centiseconds=20000,
            relay_swimmers=['BEN SALEM Ahmed', 'Youssef TRABELSI'])
        merge_swimmers(keep, remove)
        r.refresh_from_db()
        self.assertEqual(r.relay_swimmers, ['Ahmed BEN SALEM', 'Youssef TRABELSI'])

    def test_same_name_merge_leaves_json_untouched(self):
        from importer.matcher import merge_swimmers
        relay_event, champ, team = self._relay_fixture()
        keep = Swimmer.objects.create(
            name='Ahmed BEN SALEM', nationality=self.country, sex='M')
        remove = Swimmer.objects.create(
            name='ahmed ben salem', nationality=self.country, sex='M')
        r = Result.objects.create(
            swimmer=team, championship=champ, event=relay_event,
            time_centiseconds=20000,
            relay_swimmers=[{'name': 'Ahmed BEN SALEM', 'split_time': '52.10'}])
        merge_swimmers(keep, remove)
        r.refresh_from_db()
        self.assertEqual(r.relay_swimmers[0]['name'], 'Ahmed BEN SALEM')


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
        super().setUp()  # mixin logs the test client in for write endpoints
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
        # Parser-formatted "First LASTNAME" casing is preserved on creation
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
        names = [s['name'] for s in
                 self.client.get('/api/v1/swimmers/').json()['results']]
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
        names = [s['name'] for s in
                 self.client.get('/api/v1/swimmers/').json()['results']]
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

    def test_country_swimmers_works_for_non_host_countries(self):
        """The dropdown endpoint passes ?country=<nationality>, which must
        NOT be treated as the championships-list host-country filter
        (regression: get_object 404'd for any country != host country)."""
        from core.models import Country
        import datetime
        champ = Championship.objects.create(
            name='Hosted Meet', date=datetime.date(2026, 6, 1),
            pool='LCM', country=self.country)  # hosted in Tunisia
        egypt = Country.objects.create(name='Egypt', code='EGY')
        visitor = Swimmer.objects.create(
            name='Marwan ELKAMASH', nationality=egypt, sex='M')
        Result.objects.create(swimmer=visitor, championship=champ,
                              event=self.event, time_centiseconds=5100)
        resp = self.client.get(
            f'/api/v1/championships/{champ.id}/country-swimmers/'
            f'?country={egypt.id}')
        self.assertEqual(resp.status_code, 200)
        names = [s['name'] for s in resp.json()]
        self.assertEqual(names, ['Marwan ELKAMASH'])

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
                if r.status in ('OK', 'HC') and r.time_centiseconds > 0]
        self.assertEqual(
            {r.swimmer_name for r in kept},
            {'Youssef TRABELSI', 'Karim BEN AHMED', 'Sami DOUMA'})
        by_name = {r.swimmer_name: r for r in kept}
        self.assertEqual(by_name['Karim BEN AHMED'].rank, 0)
        self.assertEqual(by_name['Karim BEN AHMED'].time_centiseconds, 6300)
        self.assertEqual(by_name['Sami DOUMA'].rank, 0)
        self.assertEqual(by_name['Sami DOUMA'].status, 'HC')
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
            is_hc = prefix.lower().replace('.', '').startswith('hc')
            self.assertEqual(r.status, 'HC' if is_hc else 'OK',
                             f'prefix "{prefix}" should be {"HC" if is_hc else "OK"}')

    def test_splash_normal_names_still_parse_as_ties(self):
        from importer.parsers import splash_parser
        from importer.parsers.base import ParsedEvent
        event = ParsedEvent(event_name='50 M Freestyle', distance=50,
                            stroke='Freestyle', gender='M')
        r = splash_parser._parse_result_line(
            'RAHMOUNI, Mahdi 12 Union Sportf Biskra 28.23 350', event, False, 5)
        self.assertIsNotNone(r)
        self.assertEqual(r.rank, 5)  # tie line inherits previous rank


class SplashStandaloneRoundTests(SimpleTestCase):
    """Standalone round markers ('Séries', 'Finale') without a 'Liste résultats'
    prefix must still set the round context for subsequent results."""

    def test_standalone_series_sets_heats(self):
        from importer.parsers import splash_parser
        text = (
            'CHAMPIONNAT TEST 2026\n'
            'ORAN, 28/06/2026\n'
            'Epreuve 1 Messieurs, 50m Nage Libre\n'
            'Séries\n'
            '1. BENBARA, MEHDI NAZIM 98 MC ALGER 22.67 703\n'
            '2. ARDJOUNE, ABDELLAH 01 MC ALGER 23.45 650\n'
            'Finale\n'
            '1. BENBARA, MEHDI NAZIM 98 MC ALGER 22.12 750\n'
        )
        meet = splash_parser.parse(text)
        rounds = {(r.round_type, r.swimmer_name)
                  for ev in meet.events for r in ev.results}
        self.assertIn(('Heats', 'Mehdi Nazim BENBARA'), rounds)
        self.assertIn(('Heats', 'Abdellah ARDJOUNE'), rounds)
        self.assertIn(('Finals', 'Mehdi Nazim BENBARA'), rounds)
        # Heats and Finals must be separate events
        heat_count = sum(1 for ev in meet.events if ev.round_type == 'Heats')
        final_count = sum(1 for ev in meet.events if ev.round_type == 'Finals')
        self.assertGreaterEqual(heat_count, 1)
        self.assertGreaterEqual(final_count, 1)

    def test_country_code_not_swallowed_into_name(self):
        """Regression: _extract_birth_year used to scan all tokens for country
        codes, truncating names whose middle tokens matched (e.g. 'MAR')."""
        from importer.parsers.splash_parser import _extract_birth_year
        # Middle token should NOT be stripped
        name, by, club = _extract_birth_year('BOUGUERRA, Mohamed MAR ALG')
        # Only the LAST token that is a country code should split off
        self.assertEqual(name, 'BOUGUERRA, Mohamed MAR')
        self.assertEqual(club, 'ALG')
        # Single country code at end
        name, by, club = _extract_birth_year('ALZAMIL, ALI KUW')
        self.assertEqual(name, 'ALZAMIL, ALI')
        self.assertEqual(club, 'KUW')


class SplashDomesticClubCodeTests(SimpleTestCase):
    """Regression: Tunisian club 'EST' repeated on every row must NOT flip
    the meet to international (EST = Estonia IOC code). International
    detection needs several DISTINCT country codes."""

    def test_repeated_club_code_stays_domestic(self):
        from importer.parsers import splash_parser
        rows = '\n'.join(
            f'{i}. SWIMMER{i}, Ahmed 0{i} EST 5{i}.4{i} 500' for i in range(1, 9)
        )
        text = (
            'CHAMPIONNAT DE TUNISIE 2026\n'
            'TUNIS, 15/07/2026\n'
            'Epreuve 1 Messieurs, 100m Nage Libre\n'
            + rows + '\n'
        )
        self.assertFalse(splash_parser._detect_international(text))
        meet = splash_parser.parse(text)
        results = [r for ev in meet.events for r in ev.results]
        self.assertTrue(results)
        for r in results:
            self.assertEqual(r.nationality_code, '')
            self.assertEqual(r.club, 'EST')

    def test_many_distinct_codes_still_international(self):
        from importer.parsers import splash_parser
        text = (
            'CHAMPIONNAT ARABE 2026\n'
            'ALGER, 15/07/2026\n'
            'Epreuve 1 Messieurs, 100m Nage Libre\n'
            '1. HAFNAOUI, Ahmed 02 TUN 52.10 800\n'
            '2. SAHNOUNE, Oussama 92 ALG 52.50 780\n'
            '3. ELKAMASH, Marwan 93 EGY 52.90 760\n'
            '4. BENLEKHAL, Ali 01 MAR 53.10 750\n'
            '5. ALZAMIL, Ali 03 KUW 53.40 740\n'
            '6. ALOBAIDLY, Noah 04 QAT 53.80 730\n'
        )
        self.assertTrue(splash_parser._detect_international(text))
        meet = splash_parser.parse(text)
        nats = {r.nationality_code for ev in meet.events for r in ev.results}
        self.assertIn('TUN', nats)
        self.assertIn('ALG', nats)


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


class CountryCodeAliasTests(TestCase):
    """Source files use IOC/legacy codes (LBA=Libya, LIB=Lebanon, KUW=Kuwait…)
    while the DB stores a mix of ISO/IOC codes. Every alias must resolve —
    an unresolved code silently falls back to the meet host country, which
    mis-nationalizes athletes (this happened to Libyan swimmers)."""

    @classmethod
    def setUpTestData(cls):
        from core.models import Country
        codes = {
            'KWT': 'Kuwait', 'BHR': 'Bahrain', 'KSA': 'Saudi Arabia',
            'UAE': 'UAE', 'OMA': 'Oman', 'LBN': 'Lebanon', 'PLE': 'Palestine',
            'LBY': 'Libya', 'ALG': 'Algeria', 'SUD': 'Sudan',
            'MTN': 'Mauritania', 'MAR': 'Morocco', 'EGY': 'Egypt',
        }
        for code, name in codes.items():
            Country.objects.create(name=name, code=code)

    def setUp(self):
        from importer import matcher
        matcher._country_cache = None
        self.addCleanup(lambda: setattr(matcher, '_country_cache', None))

    def test_every_alias_resolves_to_its_target(self):
        from importer.matcher import COUNTRY_CODE_ALIASES, resolve_country
        for alias, target in COUNTRY_CODE_ALIASES.items():
            country = resolve_country(alias)
            self.assertIsNotNone(country, f'alias {alias} did not resolve')
            self.assertEqual(country.code, target, f'alias {alias} resolved to {country.code}')

    def test_ioc_libya_and_lebanon(self):
        from importer.matcher import resolve_country
        self.assertEqual(resolve_country('LBA').name, 'Libya')
        self.assertEqual(resolve_country('lba').name, 'Libya')
        self.assertEqual(resolve_country('LIB').name, 'Lebanon')

    def test_arab_country_codes_cover_all_aliases(self):
        from importer.matcher import COUNTRY_CODE_ALIASES
        from importer.services import ARAB_COUNTRY_CODES
        for alias in COUNTRY_CODE_ALIASES:
            self.assertIn(alias, ARAB_COUNTRY_CODES, f'{alias} missing from ARAB_COUNTRY_CODES')


class FederationTeamNameTests(TestCase):
    """GCC/international meets list national federations in the Team column
    ("Kuwait Swimming", "Bahrain Aquatics", "Saudi Swimming Federation").
    These must resolve to countries or every swimmer silently falls back to
    the meet host country (happened on the GCC championship import)."""

    @classmethod
    def setUpTestData(cls):
        from core.models import Country
        for code, name in [('KUW', 'Kuwait'), ('BHR', 'Bahrain'),
                           ('KSA', 'Saudi Arabia'), ('UAE', 'UAE'),
                           ('OMA', 'Oman'), ('QAT', 'Qatar')]:
            Country.objects.create(name=name, code=code)

    def setUp(self):
        from importer import matcher
        matcher._country_cache = None
        self.addCleanup(lambda: setattr(matcher, '_country_cache', None))

    def test_federation_names_resolve(self):
        from importer.matcher import resolve_country
        cases = {
            'Kuwait Swimming': 'KUW',
            'Bahrain Aquatics': 'BHR',
            'Saudi Swimming Federation': 'KSA',
            'Uae Aquatics Federation': 'UAE',
            'Oman National Team': 'OMA',
            'Qatar National Team': 'QAT',
            'Qatar Swimming Association': 'QAT',
        }
        for team, code in cases.items():
            country = resolve_country(team)
            self.assertIsNotNone(country, f'{team!r} did not resolve')
            self.assertEqual(country.code, code, f'{team!r} resolved to {country.code}')

    def test_real_clubs_do_not_resolve(self):
        from importer.matcher import resolve_country
        # "Club" is not a federation word — Kuwait Club is a real club
        self.assertIsNone(resolve_country('Kuwait Club'))
        self.assertIsNone(resolve_country('Alexandria Swimming'))
        self.assertIsNone(resolve_country('Swimming'))


class MissingAgeLineTests(SimpleTestCase):
    """When a result line has no age/birth-year token, the parsers must not
    swallow the country code or team into the swimmer's name (user-reported:
    'name with country and team all as name')."""

    def _splash_event(self):
        from importer.parsers.base import ParsedEvent
        return ParsedEvent(event_name='50 M Freestyle', distance=50,
                           stroke='Freestyle', gender='M',
                           round_type='Finals', age_group='')

    def test_splash_international_line_without_birth_year(self):
        from importer.parsers.splash_parser import _parse_result_line
        r = _parse_result_line('1. ALZAMIL, ALI KUW 25.71 793',
                               self._splash_event(), True, 0)
        self.assertIsNotNone(r)
        self.assertEqual(r.swimmer_name, 'Ali ALZAMIL')
        self.assertEqual(r.nationality_code, 'KUW')
        self.assertEqual(r.birth_year, 0)
        self.assertEqual(r.time_text, '25.71')

    def test_splash_line_with_birth_year_still_works(self):
        from importer.parsers.splash_parser import _parse_result_line
        r = _parse_result_line('1. ALZAMIL, ALI 02 KUW 25.71 793',
                               self._splash_event(), True, 0)
        self.assertEqual(r.swimmer_name, 'Ali ALZAMIL')
        self.assertEqual(r.nationality_code, 'KUW')
        self.assertEqual(r.birth_year, 2002)

    def test_splash_status_line_without_birth_year(self):
        from importer.parsers.splash_parser import _parse_status_line
        r = _parse_status_line('disq. TAIBI, Abderraouf KSA',
                               self._splash_event())
        self.assertIsNotNone(r)
        self.assertEqual(r.swimmer_name, 'Abderraouf TAIBI')
        self.assertNotIn('KSA', r.swimmer_name)

    def _hytek_event(self):
        from importer.parsers.base import ParsedEvent
        return ParsedEvent(event_name='100 M Backstroke', distance=100,
                           stroke='Backstroke', gender='M',
                           round_type='Finals', age_group='')

    def test_hytek_line_without_age_keeps_team_out_of_name(self):
        from importer.parsers.hytek_parser import _parse_result_line
        r = _parse_result_line('5 Sinukrot, Karim NSSC-LB 1:05.33',
                               self._hytek_event())
        self.assertIsNotNone(r)
        self.assertEqual(r.swimmer_name, 'Karim SINUKROT')
        self.assertEqual(r.club, 'NSSC-LB')

    def test_hytek_line_without_age_allcaps_team_code(self):
        from importer.parsers.hytek_parser import _parse_result_line
        r = _parse_result_line('1 Alabed, Hadi ORTH 4:50.92 525',
                               self._hytek_event())
        self.assertIsNotNone(r)
        self.assertEqual(r.swimmer_name, 'Hadi ALABED')
        self.assertEqual(r.club, 'ORTH')

    def test_hytek_line_with_age_unchanged(self):
        from importer.parsers.hytek_parser import _parse_result_line
        r = _parse_result_line('1 Alabed, Hadi 19 ORTH 5:35.64 4:50.92 525',
                               self._hytek_event())
        self.assertEqual(r.swimmer_name, 'Hadi ALABED')
        self.assertEqual(r.age, 19)
        self.assertEqual(r.club, 'ORTH')


class RepairEventTests(TestCase):
    """Corrupted stroke/distance from PDF extraction must be repaired,
    never stored as junk Event records."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        global Event, Country
        from core.models import Event, Country

    def test_repair_stroke_pdf_ligatures(self):
        from importer.services import repair_stroke
        self.assertEqual(repair_stroke('Butter(cid:976)ly'), 'Butterfly')
        self.assertEqual(repair_stroke('Li bre'), 'Freestyle')

    def test_repair_stroke_french(self):
        from importer.services import repair_stroke
        self.assertEqual(repair_stroke('Papillon'), 'Butterfly')
        self.assertEqual(repair_stroke('Dos'), 'Backstroke')
        self.assertEqual(repair_stroke('Brasse'), 'Breaststroke')
        self.assertEqual(repair_stroke('4 Nages'), 'Individual Medley')

    def test_repair_stroke_valid_passthrough(self):
        from importer.services import repair_stroke
        for s in ['Freestyle', 'Backstroke', 'Butterfly', 'Breaststroke',
                  'Individual Medley', 'Medley Relay', 'Freestyle Relay']:
            self.assertEqual(repair_stroke(s), s)

    def test_repair_stroke_garbage_rejected(self):
        from importer.services import repair_stroke
        self.assertEqual(repair_stroke('xyzzy'), '')
        self.assertEqual(repair_stroke(''), '')

    def test_repair_distance(self):
        from importer.services import repair_distance
        self.assertEqual(repair_distance(100), 100)
        self.assertEqual(repair_distance(1500), 1500)
        self.assertEqual(repair_distance(999), 0)
        # '4 x 100' read as 4100 -> 400 total
        self.assertEqual(repair_distance(4100, is_relay=True), 400)
        self.assertEqual(repair_distance(450, is_relay=True), 200)
        self.assertEqual(repair_distance(400, is_relay=True), 400)

    def test_find_event_repairs_corrupted_stroke(self):
        from importer.services import _find_event
        good = Event.objects.create(name='100 M Butterfly', distance=100,
                                    stroke='Butterfly', is_relay=False)
        cache = {e.name.upper(): e for e in Event.objects.all()}
        found = _find_event({'event_name': '100 M Butter(cid:976)ly',
                             'distance': 100, 'stroke': 'Butter(cid:976)ly'}, cache)
        self.assertEqual(found, good)
        self.assertEqual(Event.objects.count(), 1)

    def test_find_event_never_creates_junk(self):
        from importer.services import _find_event
        found = _find_event({'event_name': '999 M Xyzzy',
                             'distance': 999, 'stroke': 'Xyzzy'}, {})
        self.assertIsNone(found)
        self.assertEqual(Event.objects.count(), 0)


class CleanupJunkEventsMigrationTests(TestCase):
    """The 0002 core migration must fold junk events into canonical ones."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        global Event, Country
        from core.models import Event, Country

    def _run(self):
        from django.apps import apps as real_apps
        from core.migrations import __path__  # noqa: F401
        import importlib
        mod = importlib.import_module('core.migrations.0002_cleanup_junk_events')
        mod.cleanup_junk_events(real_apps, None)

    def test_merges_ligature_event_into_canonical(self):
        from championships.models import Championship, Result
        from swimmers.models import Swimmer
        country = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        good = Event.objects.create(name='100 M Butterfly', distance=100,
                                    stroke='Butterfly', is_relay=False)
        junk = Event.objects.create(name='100 M Butter(cid:976)ly', distance=100,
                                    stroke='Butter(cid:976)ly', is_relay=False)
        champ = Championship.objects.create(name='Champs', date='2026-06-01',
                                            pool='LCM', country=country)
        sw = Swimmer.objects.create(name='Ali', sex='M', nationality=country)
        r = Result.objects.create(swimmer=sw, championship=champ, event=junk,
                                  round_type='Finals', category='',
                                  time_centiseconds=5500)
        self._run()
        r.refresh_from_db()
        self.assertEqual(r.event, good)
        self.assertFalse(Event.objects.filter(name__contains='(cid:').exists())

    def test_renames_when_no_canonical_exists(self):
        Event.objects.create(name='1500 M Li bre', distance=1500,
                             stroke='Li bre', is_relay=False)
        self._run()
        ev = Event.objects.get()
        self.assertEqual(ev.name, '1500 M Freestyle')
        self.assertEqual(ev.stroke, 'Freestyle')

    def test_fixes_glued_relay_distance(self):
        good = Event.objects.create(name='4x100 M Freestyle Relay', distance=400,
                                    stroke='Freestyle Relay', is_relay=True)
        Event.objects.create(name='4x1025 M Freestyle Relay', distance=4100,
                            stroke='Freestyle', is_relay=True)
        self._run()
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(Event.objects.get(), good)

    def test_leaves_valid_events_alone(self):
        Event.objects.create(name='50 M Freestyle', distance=50,
                             stroke='Freestyle', is_relay=False)
        Event.objects.create(name='4x100 M Medley Relay Mixed', distance=400,
                             stroke='Medley Relay', is_relay=True)
        self._run()
        self.assertEqual(Event.objects.count(), 2)


# ---------------------------------------------------------------------------
# FINA points: base-time coverage and event-name normalization
# ---------------------------------------------------------------------------

from importer.points import calculate_points, BASE_TIMES_SCM


class CalculatePointsCoverageTests(SimpleTestCase):
    """Regression: relays and 100 IM must never score 0 points."""

    def test_100_im_lcm_falls_back_to_scm_base(self):
        # LCM has no official 100 IM base time — SCM base is used instead
        pts = calculate_points(6000, '100 M Individual Medley', 'M', 'LCM')
        self.assertGreater(pts, 0)
        self.assertEqual(
            pts, calculate_points(6000, '100 M Individual Medley', 'M', 'SCM'))

    def test_4x50_relays_lcm_fall_back_to_scm_base(self):
        for name in ('4x50 M Freestyle Relay', '4x50 M Medley Relay'):
            for g in ('M', 'F', 'X'):
                self.assertGreater(
                    calculate_points(11000, name, g, 'LCM'), 0,
                    f'{name} {g} scored 0 at LCM')

    def test_mixed_relay_name_uses_x_base(self):
        # Placeholder relay swimmers carry sex M/F, but a 'Mixed' event
        # name must use the mixed base time
        base_x = BASE_TIMES_SCM['4x50 M Freestyle Relay']['X']
        pts = calculate_points(10000, '4x50 M Freestyle Relay Mixed', 'M', 'SCM')
        self.assertEqual(pts, int(1000.0 * (base_x / 100.0) ** 3))

    def test_name_variants_normalize(self):
        expected = calculate_points(20000, '4x100 M Freestyle Relay', 'M', 'LCM')
        self.assertGreater(expected, 0)
        for variant in ('4×100 M Freestyle Relay', '4 x 100 M Freestyle Relay',
                        '4x100m Freestyle Relay', '4x100 M Freestyle Relay Men'):
            self.assertEqual(
                calculate_points(20000, variant, 'M', 'LCM'), expected,
                f'variant {variant!r} did not normalize')

    def test_bare_medley_normalizes_to_individual_medley(self):
        expected = calculate_points(13000, '200 M Individual Medley', 'F', 'LCM')
        self.assertGreater(expected, 0)
        self.assertEqual(
            calculate_points(13000, '200 M Medley', 'F', 'LCM'), expected)
        self.assertEqual(
            calculate_points(13000, '200 M IM', 'F', 'LCM'), expected)

    def test_all_base_table_events_score_in_both_pools(self):
        # Use a time 10% slower than each event's base so the score lands in a
        # realistic range (~750 pts) — a fixed fast time like 30s would exceed
        # the plausibility ceiling on short events and be rejected.
        for name, bases in BASE_TIMES_SCM.items():
            time_cs = int(bases['M'] * 1.1 * 100)
            for pool in ('LCM', 'SCM'):
                self.assertGreater(
                    calculate_points(time_cs, name, 'M', pool), 0,
                    f'{name} scored 0 at {pool}')


class SplashMinimaLineTests(SimpleTestCase):
    """Algerian PDFs list qualifying-time limits as 'MINIMA' lines. They are
    time limits, not results, and must never be parsed as swimmers/teams."""

    def test_minima_lines_are_skipped(self):
        from importer.parsers import splash_parser
        text = (
            'CHAMPIONNAT TEST 2026\n'
            'ORAN, 28/06/2026\n'
            'Epreuve 1 Messieurs, 50m Nage Libre\n'
            'MINIMA 13 - 14: 30.57; 15 - 16: 29.67; 17 - 18: 27.28\n'
            '13 - 14: 30.57; 15 - 16: 29.67\n'
            '1. BENBARA, MEHDI NAZIM 98 MC ALGER 22.67 703\n'
            '2. ARDJOUNE, ABDELLAH 01 MC ALGER 23.45 650\n'
        )
        meet = splash_parser.parse(text)
        names = {r.swimmer_name for ev in meet.events for r in ev.results}
        self.assertEqual(names, {'Mehdi Nazim BENBARA', 'Abdellah ARDJOUNE'})
        for n in names:
            self.assertNotIn('MINIMA', n.upper())
        # No junk events created from minima lines
        self.assertEqual(len(meet.events), 1)


class CanonicalizeParsedClubsTests(TestCase):
    """PDF text-overlap artifacts ('RSTADE', 'OLYMPICs', 'CHA MBÉRY') must
    collapse into the real club instead of creating duplicate teams."""

    @staticmethod
    def _meet(club_counts):
        from importer.parsers.base import ParsedMeet, ParsedEvent, ParsedResult
        ev = ParsedEvent(event_name='100 M Freestyle', distance=100, stroke='Freestyle')
        i = 0
        for club, n in club_counts.items():
            for _ in range(n):
                i += 1
                ev.results.append(ParsedResult(
                    swimmer_name=f'Swimmer {i}', time_text='1:00.00',
                    time_centiseconds=6000, club=club))
        return ParsedMeet(meet_name='Test', events=[ev])

    def _clubs(self, meet):
        return {r.club for ev in meet.events for r in ev.results}

    def test_overlap_artifacts_merge_into_real_club(self):
        from importer.services import canonicalize_parsed_clubs
        meet = self._meet({
            'STADE OLYMPIQUE CHAMBÉRY': 46,
            'STADE OLYMP IQUE CHAMBÉRY': 1,   # inserted space
            'STADE OLYMPIQUE CHAMBlÉRY': 1,   # inserted letter
            'RSTADE OLYMPIQUE CHAMBÉRY': 1,   # record marker prefix
            'OLYMPIC NICE NATATION': 59,
            'OLYMPICs NICE NATATION': 2,
            'OLYMPIC NICE NAuTATION': 2,
        })
        canonicalize_parsed_clubs(meet)
        self.assertEqual(self._clubs(meet),
                         {'STADE OLYMPIQUE CHAMBÉRY', 'OLYMPIC NICE NATATION'})

    def test_genuinely_different_clubs_survive(self):
        from importer.services import canonicalize_parsed_clubs
        meet = self._meet({
            'BIARRITZ OLYMPIQUE': 4,
            'THANN OLYMPIC N': 3,
            'OLYMPIQUE NOUMÉA': 5,
            'OLYMPIC NICE NATATION': 59,
        })
        canonicalize_parsed_clubs(meet)
        self.assertEqual(self._clubs(meet),
                         {'BIARRITZ OLYMPIQUE', 'THANN OLYMPIC N',
                          'OLYMPIQUE NOUMÉA', 'OLYMPIC NICE NATATION'})

    def test_frequent_variants_only_merge_on_exact_key(self):
        from importer.services import canonicalize_parsed_clubs
        # Both spellings frequent and one edit apart: keep both (could be
        # two real clubs), unless identical once spaces are dropped.
        meet = self._meet({'CN ALGER': 20, 'CS ALGER': 15, 'CN  ALGER': 4})
        canonicalize_parsed_clubs(meet)
        self.assertEqual(self._clubs(meet), {'CN ALGER', 'CS ALGER'})


class FFNNameReorderTests(TestCase):
    """FFN lists names 'SURNAME Given'; the site convention is 'Given SURNAME'."""

    def test_simple_surname_first(self):
        from importer.parsers.ffn_parser import _reorder_ffn_name
        self.assertEqual(_reorder_ffn_name('RESSENCOURT Lilou'),
                         'Lilou RESSENCOURT')
        self.assertEqual(_reorder_ffn_name('WATTEL Marie'), 'Marie WATTEL')

    def test_hyphenated_and_multiword_surnames(self):
        from importer.parsers.ffn_parser import _reorder_ffn_name
        self.assertEqual(_reorder_ffn_name('SCIUTO-BRUNEL Miki'),
                         'Miki SCIUTO-BRUNEL')
        self.assertEqual(_reorder_ffn_name('DE LA TORRE Pablo'),
                         'Pablo DE LA TORRE')

    def test_glued_surname_and_given_name(self):
        from importer.parsers.ffn_parser import _reorder_ffn_name
        # PDF extraction sometimes glues them: 'MOLUMary-Ambre'
        self.assertEqual(_reorder_ffn_name('MOLUMary-Ambre'), 'Mary-Ambre MOLU')

    def test_accented_names(self):
        from importer.parsers.ffn_parser import _reorder_ffn_name
        self.assertEqual(_reorder_ffn_name('GASTALDELLO Béryl'),
                         'Béryl GASTALDELLO')

    def test_all_caps_name_flipped(self):
        from importer.parsers.ffn_parser import _reorder_ffn_name
        # FFN is always surname-first; all-caps → move first word to end
        self.assertEqual(_reorder_ffn_name('MELI AMEL'), 'AMEL MELI')
        self.assertEqual(_reorder_ffn_name('MOHAMED ALI'), 'ALI MOHAMED')


class SurnameCapsTests(SimpleTestCase):
    """Names without an all-caps word get their surname uppercased so every
    stored name follows the 'Given SURNAME' convention."""

    def test_plain_title_case(self):
        from importer.services import uppercase_surname
        self.assertEqual(uppercase_surname('Dora Buklu'), 'Dora BUKLU')

    def test_particle_surnames(self):
        from importer.services import uppercase_surname
        self.assertEqual(uppercase_surname('Maha Al Shehhi'), 'Maha AL SHEHHI')
        self.assertEqual(uppercase_surname('Mohamed-Yassine Ben Abbes'),
                         'Mohamed-Yassine BEN ABBES')
        self.assertEqual(uppercase_surname('Pablo De La Torre'),
                         'Pablo DE LA TORRE')

    def test_multiple_middle_initials(self):
        from importer.services import uppercase_surname
        self.assertEqual(uppercase_surname('Saba A A H Sultan'),
                         'Saba A A H SULTAN')

    def test_single_word_unchanged(self):
        from importer.services import uppercase_surname
        self.assertEqual(uppercase_surname('Madonna'), 'Madonna')

    def test_normalize_swimmer_name_no_caps_source(self):
        from importer.services import normalize_swimmer_name
        # Source PDFs without a caps surname ("dora buklu" / "Dora Buklu")
        self.assertEqual(normalize_swimmer_name('dora buklu'), 'Dora BUKLU')
        self.assertEqual(normalize_swimmer_name('Dora Buklu'), 'Dora BUKLU')
        self.assertEqual(normalize_swimmer_name('DORA BUKLU'), 'Dora BUKLU')

    def test_normalize_swimmer_name_correct_names_untouched(self):
        from importer.services import normalize_swimmer_name
        self.assertEqual(normalize_swimmer_name('Malak MEQDAR'), 'Malak MEQDAR')
        self.assertEqual(normalize_swimmer_name('Mohamed-Yassine BEN ABBES'),
                         'Mohamed-Yassine BEN ABBES')


class EgyptianNameFormatTests(SimpleTestCase):
    """Egyptian swimmers: first name as-is, ALL subsequent words UPPERCASE."""

    def test_simple_egyptian_name(self):
        from importer.services import egyptian_name_format
        self.assertEqual(egyptian_name_format('Ahmed Mohamed Hassan'),
                         'Ahmed MOHAMED HASSAN')

    def test_already_correct(self):
        from importer.services import egyptian_name_format
        self.assertEqual(egyptian_name_format('Ahmed MOHAMED HASSAN'),
                         'Ahmed MOHAMED HASSAN')

    def test_multi_part_name(self):
        from importer.services import egyptian_name_format
        self.assertEqual(
            egyptian_name_format('Mohamed Hany Elsayed Ahmed Mohamady'),
            'Mohamed HANY ELSAYED AHMED MOHAMADY')

    def test_with_el_particle(self):
        from importer.services import egyptian_name_format
        self.assertEqual(egyptian_name_format('Aalia Mohamed El Sharkawy'),
                         'Aalia MOHAMED EL SHARKAWY')

    def test_single_word_unchanged(self):
        from importer.services import egyptian_name_format
        self.assertEqual(egyptian_name_format('Mohamed'), 'Mohamed')

    def test_two_words(self):
        from importer.services import egyptian_name_format
        self.assertEqual(egyptian_name_format('Ahmed Hassan'),
                         'Ahmed HASSAN')


class ClubEquivalenceTests(SimpleTestCase):
    """Fuzzy club comparison so a stray extraction character doesn't split
    one athlete into two ('GRENOBLE ALP'38' vs 'GRENOBsLE ALP'38')."""

    def test_extraction_glitch_is_same_club(self):
        from importer.matcher import clubs_equivalent
        self.assertTrue(clubs_equivalent("GRENOBLE ALP'38", "GRENOBsLE ALP'38"))

    def test_case_and_punctuation_variants(self):
        from importer.matcher import clubs_equivalent
        self.assertTrue(clubs_equivalent("Grenoble Alp'38", 'GRENOBLE ALP 38'))
        self.assertTrue(clubs_equivalent('C.N. ALGER', 'CN ALGER'))

    def test_different_clubs(self):
        from importer.matcher import clubs_equivalent
        self.assertFalse(clubs_equivalent('CA', 'OLYMPICA'))
        self.assertFalse(clubs_equivalent('CN ALGER', 'USM ALGER'))

    def test_empty_values(self):
        from importer.matcher import clubs_equivalent
        self.assertFalse(clubs_equivalent('', "GRENOBLE ALP'38"))
        self.assertFalse(clubs_equivalent(None, None))


class HytekTiePointsTests(SimpleTestCase):
    """Tied places (*4) split scoring points fractionally, so the points
    column looks like a third time on the line. With take_last_time on,
    the parser must not read '14.50' points as the swim time."""

    def _event(self, distance=50):
        from importer.parsers.base import ParsedEvent
        return ParsedEvent(event_name=f'{distance} M Freestyle',
                           distance=distance, stroke='Freestyle',
                           gender='F', round_type='Finals', age_group='')

    def test_tied_place_points_tail_not_taken_as_time(self):
        from importer.parsers.hytek_parser import _parse_result_line
        r = _parse_result_line(
            '*4 Abou Antoun, Jane 14 Lebanon 30.20 31.38 14.50',
            self._event(50), take_last_time=True)
        self.assertIsNotNone(r)
        self.assertEqual(r.time_text, '31.38')
        self.assertEqual(r.rank, 4)

    def test_implausibly_fast_tail_rejected(self):
        from importer.parsers.hytek_parser import _parse_result_line
        r = _parse_result_line(
            '3 Doe, Jane 15 Club 1:10.50 1:09.80 12.00',
            self._event(100), take_last_time=True)
        self.assertIsNotNone(r)
        self.assertEqual(r.time_text, '1:09.80')

    def test_normal_two_time_line_still_takes_last(self):
        from importer.parsers.hytek_parser import _parse_result_line
        r = _parse_result_line(
            '1 Alabed, Hadi 19 ORTH 5:35.64 4:50.92 525',
            self._event(400), take_last_time=True)
        self.assertEqual(r.time_text, '4:50.92')
        self.assertEqual(r.fina_points, 525)


class FFNTextFlowExtractionTests(SimpleTestCase):
    """FFN PDFs have overlapping text layers that garble default
    extraction; the detector must extract them in stream order."""

    def test_ffn_branch_uses_text_flow(self):
        from unittest import mock
        from importer.parsers import detector

        fake_pdf = mock.MagicMock()
        fake_page = mock.MagicMock()
        fake_page.extract_text.return_value = 'some ffn-looking text'
        fake_pdf.__enter__.return_value.pages = [fake_page]
        with mock.patch.object(detector.pdfplumber, 'open',
                               return_value=fake_pdf), \
             mock.patch.object(detector.splash_parser, 'detect_format',
                               return_value=False), \
             mock.patch.object(detector.hytek_parser, 'detect_format',
                               return_value=False), \
             mock.patch.object(detector.omega_parser, 'detect_format',
                               return_value=False), \
             mock.patch.object(detector.frmn_parser, 'detect_format',
                               return_value=False), \
             mock.patch.object(detector.ffn_parser, 'detect_format',
                               return_value=True), \
             mock.patch.object(detector, '_extract_text_flow',
                               return_value='x') as flow, \
             mock.patch.object(detector, '_extract_simple',
                               return_value='ffn text') as simple, \
             mock.patch.object(detector.ffn_parser, 'parse') as parse:
            from importer.parsers.base import ParsedMeet
            parse.return_value = ParsedMeet(source_format='ffn')
            detector._parse_pdf('/tmp/fake.pdf', 'fake.pdf')
        flow.assert_called_once()
        parse.assert_called_once_with('x')
        # _extract_simple is only for the initial detect pass, not parsing
        simple.assert_not_called()


class OmegaGamesVariantTests(SimpleTestCase):
    """Hangzhou/Asian-Games results book: bare event header line, round on
    a separate date line, NOC-Country relay lines, DOB inside result rows."""

    GAMES_TEXT = """19th Asian Games Hangzhou
Results Summary
Women's 50m Freestyle
THU 28 SEP 2023 Heats
1 4 5 ZHANG Yufei CHN 3 APR 1998 0.65 24.26 Q
2 4 4 IKEE Rikako JPN 4 JUL 2000 0.68 24.71 Q
Men's 4 x 100m Freestyle Relay
SUN 24 SEP 2023 Finals
1 4 CHN-People's Republic of China 3:37.53 Q
2 5 KOR-Republic of Korea 3:37.96
"""

    def test_detect_format(self):
        from importer.parsers import omega_parser
        self.assertTrue(omega_parser.detect_format(self.GAMES_TEXT))

    def test_parse_games_variant(self):
        from importer.parsers import omega_parser
        meet = omega_parser.parse(self.GAMES_TEXT)
        by_name = {(e.event_name, e.round_type): e for e in meet.events}

        free50 = by_name[('50 M Freestyle', 'Heats')]
        self.assertEqual(free50.gender, 'F')
        self.assertEqual(len(free50.results), 2)
        r1 = free50.results[0]
        self.assertEqual(r1.time_text, '24.26')
        self.assertEqual(r1.nationality_code, 'CHN')
        # DOB "3 APR 1998" must set birth year, not corrupt the time
        self.assertEqual(r1.birth_year, 1998)

        relay = by_name[('4x100 M Freestyle Relay', 'Finals')]
        self.assertEqual(relay.gender, 'M')
        self.assertEqual(len(relay.results), 2)
        self.assertEqual(relay.results[0].time_text, '3:37.53')
        self.assertEqual(relay.results[0].nationality_code, 'CHN')
        self.assertEqual(relay.results[1].rank, 2)

        # Meet dates collected from the round lines
        self.assertEqual(meet.date_text, '2023-09-24')
        self.assertEqual(meet.date_end, '2023-09-28')

    def test_chinese_header_on_detailed_pages(self):
        """Detailed per-event pages print the English header in a display
        font whose glyphs don't extract ('omen s m utter'); the Chinese
        header must open a new event so results don't leak into the
        previous one as garbage split times."""
        from importer.parsers import omega_parser
        text = """19th Asian Games Hangzhou
Results Summary
omen s m utter
女子50米蝶泳
FRI 29 SEP 2023 Heats
1 4 SOMA Ai JPN 0.65 26.28
2 3 QUAH Jing Wen SGP 0.62 26.97 0.69
男子4x100米自由泳接力
SUN 24 SEP 2023 Finals
1 4 CHN-People's Republic of China 3:10.88 Q
混合4x100米混合泳接力
WED 27 SEP 2023 Finals
1 4 CHN-People's Republic of China 3:37.73
"""
        meet = omega_parser.parse(text)
        by_key = {(e.event_name, e.gender): e for e in meet.events}

        fly = by_key[('50 M Butterfly', 'F')]
        self.assertEqual(fly.round_type, 'Heats')
        self.assertEqual(len(fly.results), 2)
        self.assertEqual(fly.results[1].time_text, '26.97')

        free_relay = by_key[('4x100 M Freestyle Relay', 'M')]
        self.assertEqual(free_relay.results[0].time_text, '3:10.88')

        medley_mixed = by_key[('4x100 M Medley Relay', 'X')]
        self.assertEqual(medley_mixed.results[0].time_text, '3:37.73')


class SameMeetMergeTests(TestCase):
    """Federations release one championship as several files (Tunisia:
    categorized + TC versions, stamped with different session dates).
    confirm_import must attach to the existing meet, not duplicate it."""

    @classmethod
    def setUpTestData(cls):
        from datetime import date
        from core.models import Country
        cls.country = Country.objects.create(name='Tunisia', code='TUN')
        cls.champ = Championship.objects.create(
            name="Championnat D'Ete M/C Et J/S Tc",
            date=date(2026, 7, 27), end_date=date(2026, 7, 29),
            pool='LCM', country=cls.country,
        )

    def test_near_date_same_name_reuses_meet(self):
        from datetime import date
        from .services import _find_same_meet
        found = _find_same_meet(
            "CHAMPIONNAT D'ETE M/C ET J/S TC", date(2026, 7, 31), 'LCM', self.country)
        self.assertEqual(found, self.champ)

    def test_different_year_stays_separate(self):
        from datetime import date
        from .services import _find_same_meet
        self.assertIsNone(_find_same_meet(
            "CHAMPIONNAT D'ETE M/C ET J/S TC", date(2025, 7, 31), 'LCM', self.country))

    def test_different_name_stays_separate(self):
        from datetime import date
        from .services import _find_same_meet
        self.assertIsNone(_find_same_meet(
            'CHAMPIONNAT DE TUNISIE BENJAMINS', date(2026, 7, 28), 'LCM', self.country))

    def test_different_pool_stays_separate(self):
        from datetime import date
        from .services import _find_same_meet
        self.assertIsNone(_find_same_meet(
            "CHAMPIONNAT D'ETE M/C ET J/S TC", date(2026, 7, 31), 'SCM', self.country))

    def test_confirm_import_attaches_and_extends_dates(self):
        from datetime import date
        from .services import confirm_import
        preview = {
            'meet': {'name': "CHAMPIONNAT D'ETE M/C ET J/S TC",
                     'date': '2026-07-31', 'pool': 'LCM', 'location': 'Rades'},
            'events': [{
                'event_name': '50 M Freestyle', 'distance': 50, 'stroke': 'Freestyle',
                'gender': 'M', 'round_type': 'Finals', 'age_group': '', 'is_relay': False,
                'results': [{
                    'swimmer_name': 'Firas BRIGUI', 'time_text': '23.30',
                    'time_centiseconds': 2330, 'rank': 1, 'birth_year': 2002,
                    'age': 24, 'nationality_code': 'TUN', 'club': 'OLYMPICA',
                    'fina_points': 722, 'gender': 'M', 'is_relay': False,
                    'category': '', 'status': 'OK',
                }],
            }],
            'swimmers': [],
            'stats': {'total_events': 1, 'total_results': 1, 'total_swimmers': 1},
        }
        res = confirm_import(preview, {})
        self.assertEqual(res['championship_id'], self.champ.id)
        self.champ.refresh_from_db()
        self.assertEqual(self.champ.end_date, date(2026, 7, 31))
        self.assertEqual(self.champ.date, date(2026, 7, 27))

    def _one_swim_preview(self, category):
        return {
            'meet': {'name': "CHAMPIONNAT D'ETE M/C ET J/S TC",
                     'date': '2026-07-28', 'pool': 'LCM', 'location': 'Rades'},
            'events': [{
                'event_name': '50 M Freestyle', 'distance': 50, 'stroke': 'Freestyle',
                'gender': 'M', 'round_type': 'Finals', 'age_group': '', 'is_relay': False,
                'results': [{
                    'swimmer_name': 'Firas BRIGUI', 'time_text': '23.30',
                    'time_centiseconds': 2330, 'rank': 1, 'birth_year': 2002,
                    'age': 24, 'nationality_code': 'TUN', 'club': 'OLYMPICA',
                    'fina_points': 722, 'gender': 'M', 'is_relay': False,
                    'category': category, 'status': 'OK',
                }],
            }],
            'swimmers': [],
            'stats': {'total_events': 1, 'total_results': 1, 'total_swimmers': 1},
        }

    def test_tc_then_categorized_file_does_not_duplicate(self):
        """A TC (blank-category) file plus a per-category file of the same
        meet describe the same swims — the second import must upgrade the
        row, not create a twin (the meet-177 duplication bug)."""
        from championships.models import Result
        from .services import confirm_import
        confirm_import(self._one_swim_preview(''), {})
        confirm_import(self._one_swim_preview('Seniors'), {})
        rows = Result.objects.filter(championship=self.champ)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().category, 'Seniors')

    def test_categorized_then_tc_file_does_not_duplicate(self):
        from championships.models import Result
        from .services import confirm_import
        confirm_import(self._one_swim_preview('Seniors'), {})
        confirm_import(self._one_swim_preview(''), {})
        rows = Result.objects.filter(championship=self.champ)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().category, 'Seniors')

    def _one_relay_preview(self, category):
        return {
            'meet': {'name': "CHAMPIONNAT D'ETE M/C ET J/S TC",
                     'date': '2026-07-28', 'pool': 'LCM', 'location': 'Rades'},
            'events': [{
                'event_name': '4x100 M Freestyle Relay', 'distance': 400,
                'stroke': 'Freestyle', 'gender': 'M', 'round_type': 'Finals',
                'age_group': '', 'is_relay': True,
                'results': [{
                    'swimmer_name': 'ASCNS', 'time_text': '3:37.33',
                    'time_centiseconds': 21733, 'rank': 2, 'birth_year': None,
                    'age': None, 'nationality_code': 'TUN', 'club': 'ASCNS',
                    'fina_points': 0, 'gender': 'M', 'is_relay': True,
                    'category': category, 'status': 'OK',
                    'relay_swimmers': ['Heni MESFAR', 'Hamza CHEBBI'],
                }],
            }],
            'swimmers': [],
            'stats': {'total_events': 1, 'total_results': 1, 'total_swimmers': 1},
        }

    def test_tc_then_categorized_relay_does_not_duplicate(self):
        """Relays appear in both the TC and per-category files with the
        same club/round/time — the second import must upgrade the row, not
        duplicate it (which doubled every relay medal in meet 178)."""
        from championships.models import Result
        from .services import confirm_import
        confirm_import(self._one_relay_preview(''), {})
        confirm_import(self._one_relay_preview('Seniors/Juniors'), {})
        rows = Result.objects.filter(championship=self.champ)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().category, 'Seniors/Juniors')

    def test_categorized_then_tc_relay_does_not_duplicate(self):
        from championships.models import Result
        from .services import confirm_import
        confirm_import(self._one_relay_preview('Seniors/Juniors'), {})
        confirm_import(self._one_relay_preview(''), {})
        rows = Result.objects.filter(championship=self.champ)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().category, 'Seniors/Juniors')

    def _heats_preview(self, event_name, distance, names_times, date_str='2026-07-27',
                       round_type='Prelims'):
        """One event's heats file — Egypt releases heats as several PDFs."""
        return {
            'meet': {'name': "CHAMPIONNAT D'ETE M/C ET J/S TC",
                     'date': date_str, 'pool': 'LCM', 'location': 'Rades'},
            'events': [{
                'event_name': event_name, 'distance': distance,
                'stroke': 'Freestyle', 'gender': 'M', 'round_type': round_type,
                'age_group': '', 'is_relay': False,
                'results': [{
                    'swimmer_name': name, 'time_text': '',
                    'time_centiseconds': cs, 'rank': i + 1, 'birth_year': 2002,
                    'age': 24, 'nationality_code': 'TUN', 'club': 'OLYMPICA',
                    'fina_points': 0, 'gender': 'M', 'is_relay': False,
                    'category': '', 'status': 'OK',
                } for i, (name, cs) in enumerate(names_times)],
            }],
            'swimmers': [],
            'stats': {'total_events': 1, 'total_results': len(names_times),
                      'total_swimmers': len(names_times)},
        }

    def test_multi_pdf_heats_merge_and_finals_decide_medals(self):
        """Heats split over several PDFs (Egypt) all attach to one meet,
        award no medals on their own, and the finals file decides the podium."""
        from championships.models import Result, Championship
        from medals.models import Medal
        from .services import confirm_import

        # Two heats PDFs of the same meet, different events/sessions
        confirm_import(self._heats_preview(
            '50 M Freestyle', 50,
            [('Firas BRIGUI', 2330), ('Hamza CHEBBI', 2410)]), {})
        confirm_import(self._heats_preview(
            '100 M Freestyle', 100,
            [('Firas BRIGUI', 5100), ('Hamza CHEBBI', 5200)],
            date_str='2026-07-28'), {})

        self.assertEqual(Championship.objects.count(), 1)
        self.assertEqual(
            Result.objects.filter(championship=self.champ).count(), 4)
        # Heats alone never award medals
        self.assertEqual(
            Medal.objects.filter(championship=self.champ).count(), 0)

        # Finals PDF for the 50 Free: podium comes from the final only
        confirm_import(self._heats_preview(
            '50 M Freestyle', 50,
            [('Hamza CHEBBI', 2350), ('Firas BRIGUI', 2360)],
            date_str='2026-07-29', round_type='Finals'), {})
        self.assertEqual(Championship.objects.count(), 1)
        medals = {(m.swimmer.name, m.medal_type)
                  for m in Medal.objects.filter(championship=self.champ)}
        self.assertEqual(medals, {('Hamza CHEBBI', 'GOLD'), ('Firas BRIGUI', 'SILVER')})
        # Heats rows are kept alongside the finals rows
        self.assertEqual(
            Result.objects.filter(championship=self.champ,
                                  round_type='Prelims').count(), 4)

    def test_two_squads_same_relay_stay_separate(self):
        """Blank-category matching must not merge two different squads of
        the same club (different times)."""
        from championships.models import Result
        from .services import confirm_import
        confirm_import(self._one_relay_preview('Seniors/Juniors'), {})
        other = self._one_relay_preview('')
        other['events'][0]['results'][0]['time_centiseconds'] = 22000
        other['events'][0]['results'][0]['time_text'] = '3:40.00'
        confirm_import(other, {})
        self.assertEqual(Result.objects.filter(championship=self.champ).count(), 2)

    def test_swimmer_club_updates_to_latest_meet(self):
        """A swimmer's club follows their most recent meet (one current
        club) — but an older meet's import never overwrites a newer club."""
        from datetime import date
        from swimmers.models import Swimmer
        from .services import confirm_import
        confirm_import(self._one_swim_preview(''), {})
        swimmer = Swimmer.objects.get(name__icontains='BRIGUI')
        self.assertEqual(swimmer.club, 'OLYMPICA')
        # Newer meet, new club → club updates
        newer = self._one_swim_preview('')
        newer['meet']['name'] = 'CHAMPIONNAT OPEN 2027'
        newer['meet']['date'] = '2027-06-01'
        newer['events'][0]['results'][0]['club'] = 'EST'
        newer['events'][0]['results'][0]['time_centiseconds'] = 2320
        confirm_import(newer, {})
        swimmer.refresh_from_db()
        self.assertEqual(swimmer.club, 'EST')
        # Re-importing an older meet must NOT revert the club
        confirm_import(self._one_swim_preview(''), {})
        swimmer.refresh_from_db()
        self.assertEqual(swimmer.club, 'EST')


class NationalityFallbackTests(_MeetFixtureMixin, TestCase):
    """No-nationality athletes inherit the meet's host country — except in
    UAE meets, whose expat-heavy fields stay nationality-less."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from core.models import Country
        cls.uae = Country.objects.create(name='UAE', code='UAE')
        cls.egy = Country.objects.create(name='Egypt', code='EGY')

    def _preview(self, nat_code=''):
        return {
            'meet': {'name': 'Some Meet', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '100 M Freestyle',
                'distance': 100, 'stroke': 'Freestyle',
                'gender': 'M', 'is_relay': False, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'Karim MABROUK', 'gender': 'M',
                     'category': '', 'time_centiseconds': 5500,
                     'birth_year': 2008, 'nationality_code': nat_code},
                ],
            }],
        }

    def test_no_host_country_guess_for_new_swimmer(self):
        # STRICT rule: a code-less new swimmer is never stamped with the
        # meet's host country — nationality stays blank unless the file
        # states it clearly or the swimmer already has one in the DB.
        from importer.services import confirm_import
        confirm_import(self._preview(), {}, championship_details={
            'name': 'Tunisia Nationals', 'date': '2026-06-01',
            'pool': 'LCM', 'country': self.country.id})
        swimmer = Swimmer.objects.get(name__icontains='MABROUK')
        self.assertIsNone(swimmer.nationality)

    def test_uae_meet_leaves_nationality_empty(self):
        from importer.services import confirm_import
        confirm_import(self._preview(), {}, championship_details={
            'name': 'Dubai Open', 'date': '2026-06-01',
            'pool': 'LCM', 'country': self.uae.id})
        swimmer = Swimmer.objects.get(name__icontains='MABROUK')
        self.assertIsNone(swimmer.nationality)

    def test_explicit_code_beats_fallback(self):
        from importer.services import confirm_import
        confirm_import(self._preview('EGY'), {}, championship_details={
            'name': 'Tunisia Nationals', 'date': '2026-06-01',
            'pool': 'LCM', 'country': self.country.id})
        swimmer = Swimmer.objects.get(name__icontains='MABROUK')
        self.assertEqual(swimmer.nationality, self.egy)

    def test_explicit_code_honored_in_uae_meet(self):
        from importer.services import confirm_import
        confirm_import(self._preview('EGY'), {}, championship_details={
            'name': 'Dubai Open', 'date': '2026-06-01',
            'pool': 'LCM', 'country': self.uae.id})
        swimmer = Swimmer.objects.get(name__icontains='MABROUK')
        self.assertEqual(swimmer.nationality, self.egy)


class RelayLegNameTests(SimpleTestCase):
    """Relay leg lines mix birth years, signed/unsigned/glued reactions and
    splits — the swimmer name must come out digit-free with the leg time."""

    def _legs(self, line):
        from importer.parsers.splash_parser import _parse_relay_swimmers
        return _parse_relay_swimmers(line)

    def test_year_then_reaction(self):
        self.assertEqual(
            self._legs('DAHAMNA, Mehdi 08 +0,68 26.62 28.81 28.49 28.94 1:52.86'),
            ['Mehdi DAHAMNA 1:52.86'])

    def test_reaction_glued_to_name(self):
        self.assertEqual(
            self._legs('BENFEKIH, Mehdi Charaf Eddine+0,58 24.28 50.95 '
                       'SEMMAR, Mohamed Racim +0,26 25.59 52.95'),
            ['Mehdi Charaf Eddine BENFEKIH 50.95',
             'Mohamed Racim SEMMAR 52.95'])

    def test_unsigned_zero_reaction(self):
        self.assertEqual(
            self._legs('ALLAM, Oussama 0.00 28.94 1:02.30 '
                       'RABIA, Ilias Amine +0,41 24.58 52.26'),
            ['Oussama ALLAM 1:02.30', 'Ilias Amine RABIA 52.26'])

    def test_year_then_zero_reaction(self):
        self.assertEqual(
            self._legs('ILES, Yanel Amir 11 0.00 26.67 11.73 52.12 32.98 2:03.50'),
            ['Yanel Amir ILES 2:03.50'])

    def test_classic_reaction_only(self):
        self.assertEqual(
            self._legs('ARDJOUNE, ABDELLAH +0,57 26.66 55.39 '
                       'SYOUD, JAOUAD +0,29 24.32 52.16'),
            ['Abdellah ARDJOUNE 55.39', 'Jaouad SYOUD 52.16'])

    def test_year_only(self):
        self.assertEqual(
            self._legs('BENBARA, MEHDI NAZIM 98 24.02 50.88'),
            ['Mehdi Nazim BENBARA 50.88'])

    def test_smt_given_name_order(self):
        self.assertEqual(
            self._legs('Yi Cheng Lin +0.61 24.13 50.72'),
            ['Yi Cheng Lin 50.72'])


class HytekRelayCumulativeSplitTests(SimpleTestCase):
    """Hy-Tek 4x100 relays print cumulative 50m marks (8 values); each
    swimmer's leg time is the diff between every 2nd mark. Jordan Clubs
    Summer AG 2026 regression: legs were being paired with the first four
    cumulative values (50/100/150/200 marks)."""

    def _result(self, names, time_text, time_cs):
        from importer.parsers.base import ParsedResult
        r = ParsedResult(swimmer_name='Club A', time_text=time_text,
                         time_centiseconds=time_cs)
        r._relay_names = names
        r.split_times = list(names)
        return r

    NAMES = ['Abdallah TARAWNEH', 'Haya AL MASSARWEH', 'Fuad BULBAISI', 'Joud AL TAWIL']

    def test_cumulative_50m_marks_become_leg_times(self):
        from importer.parsers.hytek_parser import _attach_relay_splits
        r = self._result(self.NAMES, '4:29.03', 26903)
        _attach_relay_splits(r, '30.69 1:03.63 1:35.94 2:13.42 2:44.41 3:18.72 3:52.64 4:29.03')
        self.assertEqual(r.split_times, [
            'Abdallah TARAWNEH 1:03.63',
            'Haya AL MASSARWEH 1:09.79',
            'Fuad BULBAISI 1:05.30',
            'Joud AL TAWIL 1:10.31',
        ])

    def test_missing_mark_keeps_names_without_wrong_times(self):
        from importer.parsers.hytek_parser import _attach_relay_splits
        # 200m mark missing from source (7 values for a 4x100)
        r = self._result(self.NAMES, '4:06.82', 24682)
        _attach_relay_splits(r, '28.01 57.69 1:28.54 2:35.08 3:11.63 3:37.41 4:06.82')
        self.assertEqual(r.split_times, self.NAMES)

    def test_leg_duration_line_still_paired_directly(self):
        from importer.parsers.hytek_parser import _attach_relay_splits
        # 4x50 style: one non-monotonic duration per leg
        r = self._result(self.NAMES, '2:00.88', 12088)
        _attach_relay_splits(r, '29.93 32.67 29.35 28.93')
        self.assertEqual(r.split_times, [
            'Abdallah TARAWNEH 29.93',
            'Haya AL MASSARWEH 32.67',
            'Fuad BULBAISI 29.35',
            'Joud AL TAWIL 28.93',
        ])

    def test_wrapped_split_lines_accumulate(self):
        from importer.parsers.hytek_parser import _attach_relay_splits
        r = self._result(self.NAMES, '4:29.03', 26903)
        _attach_relay_splits(r, '30.69 1:03.63 1:35.94 2:13.42')
        _attach_relay_splits(r, '2:44.41 3:18.72 3:52.64 4:29.03')
        self.assertEqual(r.split_times[0], 'Abdallah TARAWNEH 1:03.63')
        self.assertEqual(r.split_times[3], 'Joud AL TAWIL 1:10.31')

    def test_4x200_cumulative_marks_every_50m(self):
        # Jordan Clubs Summer AG 2026: 4x200 relays print 16 cumulative
        # 50m marks over two wrapped lines; each swimmer touches at every
        # 4th mark.
        from importer.parsers.hytek_parser import _attach_relay_splits
        r = self._result(self.NAMES, '8:59.99', 53999)
        _attach_relay_splits(
            r, '31.00 1:04.50 1:39.20 2:13.70 2:47.40 3:23.10 4:00.60 4:35.92')
        _attach_relay_splits(
            r, '5:08.30 5:44.10 6:20.90 6:51.35 7:22.10 7:55.40 8:28.70 8:59.99')
        self.assertEqual(r.split_times, [
            'Abdallah TARAWNEH 2:13.70',
            'Haya AL MASSARWEH 2:22.22',
            'Fuad BULBAISI 2:15.43',
            'Joud AL TAWIL 2:08.64',
        ])

    def test_dq_relay_partial_marks_keep_names_only(self):
        # DQ teams have no final time; a first wrapped line of 8 marks must
        # not be misread as a complete cumulative set (yielding wrong legs).
        from importer.parsers.hytek_parser import _attach_relay_splits
        r = self._result(self.NAMES, 'DQ', 0)
        _attach_relay_splits(
            r, '34.90 1:11.90 1:51.11 2:28.63 3:02.41 3:40.19 4:20.34 4:59.29')
        self.assertEqual(r.split_times, self.NAMES)


class Nat2iSemifinalRoundTests(SimpleTestCase):
    """2017-era Nat'2i files publish "1/2 finales" (semi-finals) between the
    heats ("Séries") and Finale A/B — they must import as a distinct
    Semifinals round, not be swallowed by the plain "finale" match."""

    HTML = '''<html><body>
    <p><a name="01"></a>50 m NAGE LIBRE Dames Classement</p>
    <p><b><u>Finale A</u></b></p>
    <table>
    <tr><td>Place</td><td>Nom et prenom</td><td>Nation</td><td>Naissance</td><td>Club</td><td>Temps</td><td>Points</td><td>Temps de passage</td></tr>
    <tr><td>1.</td><td>BEN KHELIL Farah</td><td>TUN</td><td>1998</td><td>OLYMPICA</td><td>26.85</td><td>787</td><td></td></tr>
    </table>
    <p><b><u>Finale B</u></b></p>
    <table>
    <tr><td>Place</td><td>Nom et prenom</td><td>Nation</td><td>Naissance</td><td>Club</td><td>Temps</td><td>Points</td><td>Temps de passage</td></tr>
    <tr><td>1.</td><td>BARBOUCH Ines</td><td>TUN</td><td>2001</td><td>EST</td><td>27.84</td><td>711</td><td></td></tr>
    </table>
    <p><b><u>1/2 finales</u></b></p>
    <table>
    <tr><td>Place</td><td>Nom et prenom</td><td>Nation</td><td>Naissance</td><td>Club</td><td>Temps</td><td>Points</td><td>Temps de passage</td></tr>
    <tr><td>1.</td><td>BEN KHELIL Farah</td><td>TUN</td><td>1998</td><td>OLYMPICA</td><td>27.16</td><td>750</td><td></td></tr>
    <tr><td>2.</td><td>BARBOUCH Ines</td><td>TUN</td><td>2001</td><td>EST</td><td>27.90</td><td>700</td><td></td></tr>
    </table>
    <p><b><u>Séries</u></b></p>
    <table>
    <tr><td>Place</td><td>Nom et prenom</td><td>Nation</td><td>Naissance</td><td>Club</td><td>Temps</td><td>Points</td><td>Temps de passage</td></tr>
    <tr><td>1.</td><td>BEN KHELIL Farah</td><td>TUN</td><td>1998</td><td>OLYMPICA</td><td>27.51</td><td>720</td><td></td></tr>
    </table>
    </body></html>'''

    def test_half_finals_become_semifinals_round(self):
        from importer.parsers import nat2i_parser
        meet = nat2i_parser.parse(self.HTML)
        rounds = [(ev.round_type, len(ev.results)) for ev in meet.events]
        self.assertEqual(rounds, [
            ('Finals', 1), ('Consolation', 1), ('Semifinals', 2), ('Heats', 1),
        ])

    def test_demi_finale_variant_also_matches(self):
        from importer.parsers import nat2i_parser
        meet = nat2i_parser.parse(self.HTML.replace('1/2 finales', 'Demi-finales'))
        self.assertIn('Semifinals', [ev.round_type for ev in meet.events])


class EgyptNameHelpersTests(SimpleTestCase):
    """Pure helpers for Egyptian truncated / variant names."""

    def test_15_char_cut_extends_mid_word(self):
        from importer.egypt_names import is_name_extension
        self.assertTrue(is_name_extension('Hager Ahmed Nas', 'Hager Ahmed Nasser'))
        self.assertTrue(is_name_extension(
            'Abdelrhman Marwan Moham', 'Abdelrhman Marwan Mohamed Salem'))

    def test_14_char_cut_needs_new_word(self):
        from importer.egypt_names import is_name_extension
        # 14 stripped chars: the cut landed on a space → next must be a word
        self.assertTrue(is_name_extension('Yassin Hussein', 'Yassin Hussein Mohamed'))
        # Never extend the last word of a 14-char name
        self.assertFalse(is_name_extension('Yassin Hussein', 'Yassin Husseinov'))

    def test_short_names_extend_only_on_word_boundary(self):
        from importer.egypt_names import is_name_extension
        # Whole-word extension mirrors the subset rule…
        self.assertTrue(is_name_extension('Ali Hassan', 'Ali Hassan Mohamed'))
        # …but a short name must never grow mid-word
        self.assertFalse(is_name_extension('Ali Hassan', 'Ali Hassanein'))

    def test_subset_name(self):
        from importer.egypt_names import is_subset_name
        self.assertTrue(is_subset_name(
            'Mohamed Hany Mohamady', 'Mohamed Hany Elsayed Ahmed Mohamady'))
        # Tokens must stay in order
        self.assertFalse(is_subset_name(
            'Mohamed Hany Mohamady Elsayed', 'Mohamed Hany Elsayed Ahmed Mohamady'))
        # First two parts (given + father) must be identical
        self.assertFalse(is_subset_name(
            'Mohamed Ahmed Mohamady', 'Mohamed Hany Elsayed Ahmed Mohamady'))

    def test_names_equivalent(self):
        from importer.egypt_names import names_equivalent
        self.assertTrue(names_equivalent('mohamed hany  mohamady',
                                         'Mohamed Hany Mohamady'))
        self.assertTrue(names_equivalent('Mohamed Hany Els',
                                         'Mohamed Hany Elsayed Ahmed Mohamady'))
        self.assertFalse(names_equivalent('Mohamed Hany', 'Mohamed Hesham'))

    def test_parse_result_line(self):
        from importer.egypt_names import parse_result_line
        self.assertEqual(
            parse_result_line('5 Hager Ahmed Nasser 15 Wadi Degla 2:40.11 _____'),
            ('Hager Ahmed Nasser', 15, 'Wadi Degla'))
        # Garbled cross-field interleave is rejected
        self.assertIsNone(
            parse_result_line('6 Abdelrhman Marwan Moham 1e6d SalBeamnk Ahly Alex 32.87'))
        self.assertIsNone(parse_result_line('Boys 50 Free Finals'))

    def test_parse_flow_column(self):
        from importer.egypt_names import _parse_flow_column
        toks = ('Bank Ahly Alex 32.87 16 Abdelrhman Marwan '
                'Mohamed Salem 6 _____').split()
        self.assertEqual(_parse_flow_column(toks),
                         ('Abdelrhman Marwan Mohamed Salem', 16, 'Bank Ahly Alex'))
        self.assertIsNone(_parse_flow_column('Wadi Degla 32.90 Eyad'.split()))

    def test_repair_index(self):
        from importer.egypt_names import NameRepairIndex
        idx = NameRepairIndex({
            ('Hager Ahmed Nasser', 15, 'Wadi Degla'),
            # chain: PDF columns truncate too — one person, two spellings
            ('Yehia Khaled Ahmed', 17, 'AHLY'),
            ('Yehia Khaled Ahmed Abozead', 17, 'AHLY'),
            # two different people sharing a prefix
            ('Omar Mohamed Hassan', 18, 'AHLY'),
            ('Omar Mohamed Hamed', 16, 'SHOOT'),
        })
        self.assertEqual(idx.repair('Hager Ahmed Nas'),
                         ('Hager Ahmed Nasser', 'repaired'))
        self.assertEqual(idx.repair('Yehia Khaled Ah'),
                         ('Yehia Khaled Ahmed Abozead', 'repaired'))
        # Ambiguous prefix resolved by age, unresolved without it
        self.assertEqual(idx.repair('Omar Mohamed Ha')[1], 'ambiguous')
        self.assertEqual(idx.repair('Omar Mohamed Ha', age=16),
                         ('Omar Mohamed Hamed', 'repaired'))
        self.assertEqual(idx.repair('Omar Mohamed Ha', age=18, team='Ahly'),
                         ('Omar Mohamed Hassan', 'repaired'))
        self.assertEqual(idx.repair('Ziad Tarek Alaa'), (None, 'no_match'))


class EgyptVariantMatcherTests(TestCase):
    """find_matching_swimmer resolves Egyptian name variants via the
    EGY-guarded extension/subset rules and the nickname alias table."""

    @classmethod
    def setUpTestData(cls):
        from core.models import Country
        cls.egy = Country.objects.create(name='Egypt', code='EGY')
        cls.tun = Country.objects.create(name='Tunisia', code='TUN')

    def setUp(self):
        import importer.matcher as matcher
        matcher._country_cache = None
        matcher.invalidate_norm_cache()

    def _pr(self, name, birth_year=0, club='', code='EGY'):
        from importer.parsers.base import ParsedResult
        return ParsedResult(swimmer_name=name, time_text='',
                            birth_year=birth_year, nationality_code=code,
                            club=club)

    def test_subset_variant_matches_with_club(self):
        from importer.matcher import find_matching_swimmer
        s = Swimmer.objects.create(
            name='Mohamed Hany Elsayed Ahmed Mohamady',
            nationality=self.egy, club='Wadi Degla', sex='M')
        m, conf, mtype = find_matching_swimmer(
            self._pr('Mohamed Hany Mohamady', club='Wadi Degla'))
        self.assertEqual(m, s)
        self.assertEqual(mtype, 'variant')
        s.refresh_from_db()
        # Fullest spelling kept, variant remembered as alias
        self.assertEqual(s.name, 'Mohamed HANY ELSAYED AHMED MOHAMADY')
        self.assertIn('Mohamed Hany Mohamady',
                      list(s.nicknames.values_list('nickname', flat=True)))

    def test_truncated_variant_matches_with_birth_year(self):
        from importer.matcher import find_matching_swimmer
        s = Swimmer.objects.create(
            name='Abdelrhman Marwan Mohamed Salem', nationality=self.egy,
            club='Bank Ahly Alex', birth_year=2009, sex='M')
        m, _, mtype = find_matching_swimmer(
            self._pr('Abdelrhman Marwan Moham', birth_year=2009))
        self.assertEqual(m, s)
        self.assertEqual(mtype, 'variant')

    def test_longer_import_name_upgrades_profile(self):
        from importer.matcher import find_matching_swimmer
        s = Swimmer.objects.create(
            name='Mohamed Hany Mohamady', nationality=self.egy,
            club='Wadi Degla', birth_year=2008, sex='M')
        m, _, _ = find_matching_swimmer(self._pr(
            'Mohamed Hany Elsayed Ahmed Mohamady', birth_year=2008))
        self.assertEqual(m, s)
        s.refresh_from_db()
        self.assertEqual(s.name, 'Mohamed HANY ELSAYED AHMED MOHAMADY')
        self.assertIn('Mohamed Hany Mohamady',
                      list(s.nicknames.values_list('nickname', flat=True)))

    def test_alias_resolves_instantly_next_time(self):
        from importer.matcher import find_matching_swimmer
        s = Swimmer.objects.create(
            name='Mohamed Hany Elsayed Ahmed Mohamady',
            nationality=self.egy, club='Wadi Degla', birth_year=2008, sex='M')
        find_matching_swimmer(self._pr('Mohamed Hany Mohamady', birth_year=2008))
        # Second time: alias table, no corroborating club/year needed
        m, conf, mtype = find_matching_swimmer(self._pr('Mohamed Hany Mohamady'))
        self.assertEqual(m, s)
        self.assertEqual(mtype, 'exact')

    def test_no_corroboration_creates_new(self):
        from importer.matcher import find_matching_swimmer
        Swimmer.objects.create(
            name='Mohamed Hany Elsayed Ahmed Mohamady',
            nationality=self.egy, club='Wadi Degla', sex='M')
        m, _, mtype = find_matching_swimmer(self._pr('Mohamed Hany Mohamady'))
        self.assertIsNone(m)
        self.assertEqual(mtype, 'new')

    def test_conflicting_birth_year_never_merges(self):
        from importer.matcher import find_matching_swimmer
        Swimmer.objects.create(
            name='Mohamed Hany Elsayed Ahmed Mohamady', nationality=self.egy,
            club='Wadi Degla', birth_year=2001, sex='M')
        m, _, _ = find_matching_swimmer(
            self._pr('Mohamed Hany Mohamady', birth_year=2010, club='Wadi Degla'))
        self.assertIsNone(m)

    def test_non_egyptian_swimmers_excluded(self):
        from importer.matcher import find_matching_swimmer
        Swimmer.objects.create(
            name='Mohamed Hany Elsayed Ahmed Mohamady', nationality=self.tun,
            club='Wadi Degla', birth_year=2008, sex='M')
        m, _, _ = find_matching_swimmer(
            self._pr('Mohamed Hany Mohamady', birth_year=2008, club='Wadi Degla'))
        self.assertIsNone(m)

    def test_ambiguous_variant_creates_new(self):
        from importer.matcher import find_matching_swimmer
        Swimmer.objects.create(name='Omar Mohamed Hassan Aly',
                               nationality=self.egy, club='AHLY',
                               birth_year=2008, sex='M')
        Swimmer.objects.create(name='Omar Mohamed Hassan Zaki',
                               nationality=self.egy, club='AHLY',
                               birth_year=2008, sex='M')
        m, _, _ = find_matching_swimmer(
            self._pr('Omar Mohamed Hassan', birth_year=2008, club='AHLY'))
        self.assertIsNone(m)


class HytekEgyptExcelTests(SimpleTestCase):
    """Column mapping quirks of Egyptian Hy-Tek Excel exports."""

    def test_exact_header_beats_substring(self):
        from importer.parsers.detector import _find_column
        cols = {'event #': 'Event #', 'event': 'Event',
                'seed time': 'Seed Time', 'finals time': 'Finals Time'}
        self.assertEqual(_find_column(cols, ['event']), 'Event')
        self.assertEqual(
            _find_column(cols, ['time', 'temps', 'tps', 'finals time', 'result']),
            'Finals Time')
        # Substring fallback still works when no exact header exists
        self.assertEqual(_find_column(cols, ['seed']), 'Seed Time')

    def test_exhibition_time_marker_stripped(self):
        from importer.parsers.detector import _cell_time_str
        self.assertEqual(_cell_time_str('X1:05.83'), '1:05.83')
        self.assertEqual(_cell_time_str('x27.10'), '27.10')
        # Status cells stay empty; names starting with X untouched
        self.assertEqual(_cell_time_str('NS'), '')
        self.assertEqual(_cell_time_str('Xavier'), 'Xavier')

    def test_weekday_disambiguates_date(self):
        from importer.parsers.detector import _weekday_date
        # 4/10/2026: April 10 is a Friday, October 4 a Sunday
        self.assertEqual(_weekday_date('Friday 4/10/2026'), '2026-04-10')
        self.assertEqual(_weekday_date('Sunday 4/10/2026'), '2026-10-04')
        self.assertEqual(_weekday_date('Saturday 4/4/2026'), '2026-04-04')
        self.assertEqual(_weekday_date('4/10/2026'), '')
        self.assertEqual(_weekday_date('Blursday 4/10/2026'), '')


class RepairParsedNamesTests(TestCase):
    """PDF-based name repair applied to a ParsedMeet before preview."""

    def _meet(self):
        from importer.parsers.base import ParsedMeet, ParsedEvent, ParsedResult
        ind = ParsedEvent(event_name='100m Freestyle', results=[
            ParsedResult(swimmer_name='Hager Ahmed Nas', time_text='1:05.00',
                         time_centiseconds=6500, age=14, club='Smart Club'),
            ParsedResult(swimmer_name='Omar Ali', time_text='1:06.00',
                         time_centiseconds=6600, age=13, club='Heliopolis'),
        ])
        rel = ParsedEvent(event_name='4x100 M Freestyle Relay', results=[
            ParsedResult(swimmer_name='Smart Club Tea', time_text='4:00.00',
                         time_centiseconds=24000),
        ])
        return ParsedMeet(meet_name='Test Meet', events=[ind, rel])

    def test_truncated_name_repaired_and_stats_recorded(self):
        from importer.egypt_names import NameRepairIndex
        from importer.services import repair_parsed_names
        idx = NameRepairIndex({('Hager Ahmed Nasser Fathy', 14, 'Smart Club')})
        meet = self._meet()
        stats = repair_parsed_names(meet, idx)
        self.assertEqual(meet.events[0].results[0].swimmer_name,
                         'Hager Ahmed Nasser Fathy')
        # Short complete name untouched, relay event skipped entirely
        self.assertEqual(meet.events[0].results[1].swimmer_name, 'Omar Ali')
        self.assertEqual(meet.events[1].results[0].swimmer_name,
                         'Smart Club Tea')
        self.assertEqual(stats, {'checked': 1, 'repaired': 1,
                                 'ambiguous': 0, 'no_match': 0})
        self.assertIs(meet._name_repair, stats)

    def test_no_match_left_untouched(self):
        from importer.egypt_names import NameRepairIndex
        from importer.services import repair_parsed_names
        idx = NameRepairIndex({('Totally Different Person', 14, 'Smart Club')})
        meet = self._meet()
        stats = repair_parsed_names(meet, idx)
        self.assertEqual(meet.events[0].results[0].swimmer_name,
                         'Hager Ahmed Nas')
        self.assertEqual(stats['no_match'], 1)
        self.assertEqual(stats['repaired'], 0)

    def test_preview_includes_repair_stats(self):
        from importer.egypt_names import NameRepairIndex
        from importer.services import repair_parsed_names, _build_preview
        idx = NameRepairIndex({('Hager Ahmed Nasser Fathy', 14, 'Smart Club')})
        meet = self._meet()
        repair_parsed_names(meet, idx)
        preview = _build_preview(meet)
        self.assertEqual(preview['name_repair']['repaired'], 1)
        names = [s['name'] for s in preview['swimmers']]
        self.assertIn('Hager Ahmed Nasser Fathy', names)

    def test_preview_without_repair_has_null_stats(self):
        from importer.services import _build_preview
        preview = _build_preview(self._meet())
        self.assertIsNone(preview['name_repair'])


class EsfScraperTests(SimpleTestCase):
    """Parsing of Hy-Tek HTML results sites (ESF federation)."""

    INDEX = '''
    <h2 align="center"><font>Egypt Swimming Cup 2022-2023  </h2></font>
    <p align="center">3/14/2023 - 3/20/2023<br>
    <a href="230314lastevt.htm" target=main>Latest Completed Event </a><br>
    <h3>Session 1 - 9:00 AM<br>Tuesday 3/14/2023</h3>
    <a href="230314F001.htm" target=main>#1 Girls 15&O 200 Breast </a><br>
    <a href="230314F001O.htm" target=main>#1O Women 15&O 200 Breast </a><br>
    <h3>Session 2 - 4:00 PM<br>Wednesday 3/15/2023</h3>
    <a href="230314F011.htm" target=main>#11 Girls 15 400 Free Relay </a><br>
    <a href="230314F011.htm" target=main>#11 duplicate </a><br>
    '''

    EVENT_PAGE = '''
    <pre>
 <b> Event 1  Girls 15 Year Olds 200 LC Meter Breaststroke</b>
====================================================
    Name            Age Team          Seed     Finals   LEN
====================================================
  1 <span></span>Janat Kareem Mo  15 SHROK      <span></span> 2:43.25    2:42.81   639
  2 <span></span>Lara Amr Mahmou  15 6 OCT      <span></span>      NT    2:53.47   528
 -- <span></span>Farida Nasser M  15 SHOOT      <span></span> 3:02.72   X3:03.96
 -- <span></span>Renad Mohamed R  15 Bank Ahly Alex <span></span> 3:17.54         DQ
 -- <span></span>Youmna Hesham M  15 AHLY       <span></span> 3:13.44         NS
    </pre>
    '''

    RELAY_PAGE = '''
    <pre>
<b> Event 11  Girls 15 Year Olds 400 LC Meter Freestyle Relay</b>
=====================================================
    Team                    Seed     Finals   LEN
=====================================================
  1 <span></span>SMOHA  'A'        <span></span>      NT    4:12.95   602
    </pre>
    '''

    def test_parse_event_index(self):
        from importer.scraper import parse_event_index
        name, dates, links = parse_event_index(self.INDEX)
        self.assertEqual(name, 'Egypt Swimming Cup 2022-2023')
        self.assertEqual(dates, '3/14/2023 - 3/20/2023')
        # lastevt skipped, duplicate href deduped
        self.assertEqual([l[0] for l in links],
                         ['230314F001.htm', '230314F001O.htm', '230314F011.htm'])
        self.assertEqual(links[0][1:], ('Session 1', 'Tuesday 3/14/2023'))
        self.assertEqual(links[2][1:], ('Session 2', 'Wednesday 3/15/2023'))

    def test_parse_individual_event_page(self):
        from importer.scraper import parse_event_page
        rows = parse_event_page(self.EVENT_PAGE, session='Session 1',
                                date='Tuesday 3/14/2023')
        self.assertEqual(len(rows), 5)
        r = rows[0]
        self.assertEqual(r['Name'], 'Janat Kareem Mo')
        self.assertEqual(r['Team'], 'SHROK')
        self.assertEqual((r['Age'], r['Rank']), ('15', '1'))
        self.assertEqual((r['Seed Time'], r['Finals Time']), ('2:43.25', '2:42.81'))
        self.assertEqual((r['Gender'], r['Age Group'], r['Distance'], r['Stroke']),
                         ('Female', '15 Year Olds', 200, 'Breaststroke'))
        self.assertEqual((r['Session'], r['Date']), ('Session 1', 'Tuesday 3/14/2023'))
        # NT seed blanked; multi-word team with digits kept
        self.assertEqual(rows[1]['Seed Time'], '')
        self.assertEqual(rows[1]['Team'], '6 OCT')
        # Exhibition X-time kept (importer strips it), no rank
        self.assertEqual(rows[2]['Finals Time'], 'X3:03.96')
        self.assertEqual(rows[2]['Rank'], '')
        # Status rows: DQ / NS with no time
        self.assertEqual((rows[3]['Status'], rows[3]['Finals Time']), ('DQ', ''))
        self.assertEqual(rows[3]['Team'], 'Bank Ahly Alex')
        self.assertEqual(rows[4]['Status'], 'NS')

    def test_parse_relay_event_page(self):
        from importer.scraper import parse_event_page
        rows = parse_event_page(self.RELAY_PAGE)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        # Converted to the Excel-export relay convention: 4x100 name,
        # leg distance, team in Team column, empty Name
        self.assertIn('4x100 LC Meter Freestyle Relay', r['Event'])
        self.assertEqual(r['Distance'], 100)
        self.assertEqual(r['Stroke'], 'Freestyle Relay')
        self.assertEqual(r['Name'], '')
        self.assertEqual(r['Team'], "SMOHA 'A'")
        self.assertEqual(r['Finals Time'], '4:12.95')


class RepairScrapedRowsTests(SimpleTestCase):
    """Heats-PDF name merge applied to scraped Excel-format rows."""

    def _rows(self):
        return [
            {'Event #': '1', 'Stroke': 'Freestyle', 'Rank': '1',
             'Name': 'Hager Ahmed Nas', 'Age': '14', 'Team': 'Smart Club'},
            {'Event #': '1', 'Stroke': 'Freestyle', 'Rank': '2',
             'Name': 'Omar Ali', 'Age': '13', 'Team': 'Heliopolis'},
            {'Event #': '2', 'Stroke': 'Freestyle Relay', 'Rank': '1',
             'Name': '', 'Age': '', 'Team': "SMOHA 'A'"},
        ]

    def test_truncated_scraped_name_repaired(self):
        from importer.egypt_names import NameRepairIndex
        from importer.views import repair_scraped_rows
        idx = NameRepairIndex({('Hager Ahmed Nasser Fathy', 14, 'Smart Club')})
        rows = self._rows()
        stats = repair_scraped_rows(rows, idx)
        self.assertEqual(rows[0]['Name'], 'Hager Ahmed Nasser Fathy')
        self.assertEqual(rows[1]['Name'], 'Omar Ali')   # complete, untouched
        self.assertEqual(rows[2]['Name'], '')           # relay skipped
        self.assertEqual(stats, {'checked': 1, 'repaired': 1,
                                 'ambiguous': 0, 'no_match': 0})

    def test_no_match_keeps_scraped_name(self):
        from importer.egypt_names import NameRepairIndex
        from importer.views import repair_scraped_rows
        idx = NameRepairIndex({('Totally Different Person', 14, 'Smart Club')})
        rows = self._rows()
        stats = repair_scraped_rows(rows, idx)
        self.assertEqual(rows[0]['Name'], 'Hager Ahmed Nas')
        self.assertEqual(stats['no_match'], 1)
        self.assertEqual(stats['repaired'], 0)


class OpenClassificationDedupTests(SimpleTestCase):
    """Egyptian Hy-Tek files publish each swim twice: age-group event +
    open classification of the same race. The open copies must be dropped
    at parse time, unique open swims kept, DQ (time 0) rows untouched."""

    def _meet(self):
        from importer.parsers.base import ParsedMeet, ParsedEvent, ParsedResult
        aged = ParsedEvent(
            event_name='Event 1 Girls 15 Year Olds 200 LC Meter Breaststroke',
            distance=200, stroke='Breaststroke', gender='F',
            round_type='Finals', age_group='15 Year Olds',
            results=[
                ParsedResult('Janat Kareem Mo', '2:42.81', 16281),
                ParsedResult('Malak Mostafa M', '2:51.45', 17145),
                ParsedResult('DQ Girl', 'DQ', 0, status='DQ'),
            ])
        open_ev = ParsedEvent(
            event_name='Event 1O Women 15 & Over 200 LC Meter Breaststroke',
            distance=200, stroke='Breaststroke', gender='F',
            round_type='Finals', age_group='15 & Over',
            results=[
                ParsedResult('Janat Kareem Mo', '2:42.81', 16281),
                ParsedResult('Malak Mostafa M', '2:51.45', 17145),
                ParsedResult('Senior Only Swi', '2:55.00', 17500),
                ParsedResult('DQ Girl', 'DQ', 0, status='DQ'),
            ])
        return ParsedMeet(meet_name='ESF Test', events=[aged, open_ev])

    def test_open_duplicates_dropped(self):
        from importer.parsers.base import drop_open_classification_duplicates
        m = drop_open_classification_duplicates(self._meet())
        self.assertTrue(getattr(m, '_has_open_results', False))
        self.assertEqual(len(m.events), 2)
        open_names = [r.swimmer_name for r in m.events[1].results]
        # duplicates gone, unique senior + DQ row kept
        self.assertEqual(open_names, ['Senior Only Swi', 'DQ Girl'])
        # age-group event untouched
        self.assertEqual(len(m.events[0].results), 3)

    def test_double_open_listing_deduped(self):
        from importer.parsers.base import (ParsedEvent, ParsedResult,
                                           drop_open_classification_duplicates)
        m = self._meet()
        m.events.append(ParsedEvent(
            event_name='#161A Girls 13&O 200 Breast',
            distance=200, stroke='Breaststroke', gender='F',
            round_type='Finals', age_group='',
            results=[ParsedResult('Senior Only Swi', '2:55.00', 17500)]))
        m = drop_open_classification_duplicates(m)
        # the senior appears once across both open listings
        total = sum(1 for ev in m.events for r in ev.results
                    if r.swimmer_name == 'Senior Only Swi')
        self.assertEqual(total, 1)

    def test_no_open_events_untouched(self):
        from importer.parsers.base import drop_open_classification_duplicates
        m = self._meet()
        m.events = m.events[:1]
        m = drop_open_classification_duplicates(m)
        self.assertFalse(getattr(m, '_has_open_results', False))
        self.assertEqual(len(m.events[0].results), 3)


class HytekFinaPointsNormalizationTests(SimpleTestCase):
    """Egyptian Hy-Tek event headers must normalize to base-time keys so
    FINA points are computed (previously 0 for all Egyptian meets)."""

    CASES = {
        'Event 1 Boys 11 Year Olds 400 LC Meter Freestyle': '400 M Freestyle',
        'Event 8 Girls 11 Year Olds 200 LC Meter IM': '200 M Individual Medley',
        'Event 149O Women 14 & Over 100 LC Meter Freestyle': '100 M Freestyle',
        'Event 40 Women 15 & Over 50 SC Meter Free': '50 M Freestyle',
        '#184A Boys 13&O 50 Free': '50 M Freestyle',
        'Boys 11 100 Meter Free': '100 M Freestyle',
        'Event 9  Boys 11 Year Olds 4x100 LC Meter Freestyle Relay':
            '4x100 M Freestyle Relay',
        'Event 28  Boys 15 Year Olds 400 LC Meter Freestyle Relay':
            '4x100 M Freestyle Relay',
        'Girls 14 800 Meter Free Relay': '4x200 M Freestyle Relay',
        'Event 1  Girls 15 Year Olds 200 LC Meter Breaststroke Age Groups':
            '200 M Breaststroke',
        'Event 7  Boys 13 Year Olds 4x100 LC Meter Freestyle Relay Juniors':
            '4x100 M Freestyle Relay',
        # legacy formats must keep working
        '50 M Freestyle': '50 M Freestyle',
        '4×100 M Medley Relay Mixed': '4x100 M Medley Relay',
        '100m Freestyle': '100 M Freestyle',
    }

    def test_lookup_names(self):
        from importer.points import _normalize_event_for_lookup
        for raw, expected in self.CASES.items():
            self.assertEqual(_normalize_event_for_lookup(raw)[0], expected,
                             f'failed for {raw!r}')

    def test_points_computed_for_hytek_header(self):
        from importer.points import calculate_points
        pts = calculate_points(
            30000, 'Event 1 Boys 11 Year Olds 400 LC Meter Freestyle',
            'M', 'LCM')
        self.assertGreater(pts, 0)


class InferredNationalityChangeTests(SimpleTestCase):
    """The meet-country fallback ('nationality_inferred') must never switch
    a matched swimmer's nationality — a Jordanian guest at the Hungarian
    nationals stays Jordanian."""

    def test_inferred_code_never_changes_nationality(self):
        from unittest import mock
        from importer.services import _maybe_record_nationality_change
        swimmer = mock.Mock(is_relay_team=False, nationality_id=1)
        champ = mock.Mock(date=mock.Mock())
        result_data = {'nationality_code': 'HUN', 'nationality_inferred': True}
        self.assertFalse(
            _maybe_record_nationality_change(swimmer, result_data, champ))
