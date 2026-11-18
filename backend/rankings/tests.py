from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from records.intermediates import sync_intermediate_times


class SplitRankingTests(TestCase):
    """Lead-in splits count in rankings exactly like they do for records:
    the opening 50 of a 100 can rank in the 50 Free."""

    @classmethod
    def setUpTestData(cls):
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.e50 = Event.objects.create(name='50 M Freestyle', distance=50,
                                       stroke='Freestyle', sort_order=1)
        cls.e100 = Event.objects.create(name='100 M Freestyle', distance=100,
                                        stroke='Freestyle', sort_order=2)
        cls.champ = Championship.objects.create(
            name='Test Meet', date='2026-01-10', pool='LCM', country=cls.tun)
        cls.a = Swimmer.objects.create(name='Real FIFTY', sex='M',
                                       nationality=cls.tun, birth_year=2000)
        cls.b = Swimmer.objects.create(name='Split ONLY', sex='M',
                                       nationality=cls.tun, birth_year=2000)
        # A swims a real 50 in 25.40
        Result.objects.create(championship=cls.champ, event=cls.e50,
                              swimmer=cls.a, nationality=cls.tun,
                              time_centiseconds=2540, round_type='Finals')
        # B swims a 100 in 52.00 opening in 25.30 — no real 50 at all
        r100 = Result.objects.create(
            championship=cls.champ, event=cls.e100, swimmer=cls.b,
            nationality=cls.tun, time_centiseconds=5200, round_type='Finals',
            splits=[{'distance': 50, 'time': '25.30'},
                    {'distance': 100, 'time': '26.70'}])
        sync_intermediate_times(r100)

    def rows(self, **params):
        params.setdefault('event', self.e50.id)
        params.setdefault('scope', 'arab')
        resp = APIClient().get('/api/v1/rankings/', params)
        self.assertEqual(resp.status_code, 200)
        return resp.json()['results']

    def test_split_outranks_slower_real_swim(self):
        rows = self.rows()
        self.assertEqual([r['swimmer_name'] for r in rows],
                         ['Split ONLY', 'Real FIFTY'])
        self.assertEqual(rows[0]['time'], '25.30')
        self.assertTrue(rows[0].get('from_split'))
        self.assertEqual(rows[0]['source_event_name'], '100 M Freestyle')
        self.assertFalse(rows[1].get('from_split', False))

    def test_real_swim_wins_tie_and_faster_real_hides_split(self):
        # B later swims a REAL 50 in 25.30 — the real swim takes the entry
        Result.objects.create(championship=self.champ, event=self.e50,
                              swimmer=self.b, nationality=self.tun,
                              time_centiseconds=2530, round_type='Finals')
        rows = self.rows()
        top = rows[0]
        self.assertEqual(top['swimmer_name'], 'Split ONLY')
        self.assertEqual(top['time'], '25.30')
        self.assertFalse(top.get('from_split', False))

    def test_splits_respect_year_filter(self):
        rows = self.rows(year=2024)
        self.assertEqual(rows, [])


class RankingPagingTests(TestCase):
    """The pager must be able to trust count / page size / rank numbers."""

    @classmethod
    def setUpTestData(cls):
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.e50 = Event.objects.create(name='50 M Freestyle', distance=50,
                                       stroke='Freestyle', sort_order=1)
        cls.champ = Championship.objects.create(
            name='Test Meet', date='2026-01-10', pool='LCM', country=cls.tun)
        for i in range(7):
            s = Swimmer.objects.create(name=f'Swimmer {i}', sex='M',
                                       nationality=cls.tun, birth_year=2000)
            Result.objects.create(championship=cls.champ, event=cls.e50,
                                  swimmer=s, nationality=cls.tun,
                                  time_centiseconds=2500 + i, round_type='Finals')

    def get(self, **params):
        params.update(event=self.e50.id, scope='arab')
        resp = APIClient().get('/api/v1/rankings/', params)
        self.assertEqual(resp.status_code, 200)
        return resp.json()

    def test_page_size_param_is_honoured_like_limit(self):
        for name in ('page_size', 'limit'):
            d = self.get(**{name: 3})
            self.assertEqual(d['count'], 7)
            self.assertEqual(len(d['results']), 3)

    def test_rank_continues_from_the_real_page_size(self):
        d = self.get(page_size=3, page=2)
        self.assertEqual([r['rank'] for r in d['results']], [4, 5, 6])


class HandEnteredRecordRankingTests(TestCase):
    """A record typed in or imported on the New Records page has no meet
    result, but it is a swim: it ranks, once, under the right country."""

    @classmethod
    def setUpTestData(cls):
        from records.models import Record
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.ksa = Country.objects.create(name='Saudi Arabia', code='KSA', region='GCC')
        cls.usa = Country.objects.create(name='United States', code='USA', region='OTHER')
        cls.e50 = Event.objects.create(name='50 M Freestyle', distance=50, stroke='Freestyle', sort_order=1)
        cls.champ = Championship.objects.create(name='Test Meet', date='2026-01-10', pool='LCM', country=cls.tun)
        cls.a = Swimmer.objects.create(name='Meet SWIMMER', sex='M', nationality=cls.tun, birth_year=2000)
        cls.b = Swimmer.objects.create(name='Record ONLY', sex='M', nationality=cls.tun, birth_year=2010)
        cls.c = Swimmer.objects.create(name='World HOLDER', sex='M', nationality=cls.usa, birth_year=1995)
        cls.res = Result.objects.create(championship=cls.champ, event=cls.e50, swimmer=cls.a,
                                        nationality=cls.tun, time_centiseconds=2400, round_type='Finals')

        def rec(swimmer, cs, **kw):
            base = dict(swimmer=swimmer, event=cls.e50, record_type='NATIONAL', pool='LCM',
                        time_centiseconds=cs, country=cls.tun, result_date='2026-03-01',
                        meet_name='Away meet', source='IMPORT')
            base.update(kw)
            return Record.objects.create(**base)
        cls.rec = rec
        # B: imported record only, no meet swim. Entered twice (national + Arab): one swim.
        cls.rb = rec(cls.b, 2350)
        rec(cls.b, 2350, record_type='ARAB', source='MANUAL')
        # A: a hand-entered record equal to the meet swim (same swim typed in) and a slower one
        rec(cls.a, 2400)
        rec(cls.a, 2500, result_date='2025-05-05')
        # a world record by a non-Arab swimmer never ranks
        rec(cls.c, 2000, record_type='WORLD', country=None)
        # an automatic record is the meet swim itself: it must not add a row
        Record.objects.create(swimmer=cls.a, event=cls.e50, record_type='NATIONAL', pool='LCM',
                              time_centiseconds=2400, country=cls.tun, result_date='2026-01-10',
                              result=cls.res, source='AUTO')

    def rows(self, **params):
        params.setdefault('event', self.e50.id)
        params.setdefault('scope', 'arab')
        r = APIClient().get('/api/v1/rankings/', params)
        self.assertEqual(r.status_code, 200)
        d = r.json()
        return d['results'] if isinstance(d, dict) else d

    def test_imported_record_ranks_once_and_meet_swim_wins_a_tie(self):
        rows = self.rows()
        self.assertEqual([(x['swimmer_name'], x['time_centiseconds']) for x in rows],
                         [('Record ONLY', 2350), ('Meet SWIMMER', 2400)])
        top, second = rows
        self.assertTrue(top['from_record'])
        self.assertIsNone(top['result_id'])
        self.assertIsNone(top['championship_id'])
        self.assertEqual(top['record_id'], self.rb.id)
        self.assertEqual(top['championship_name'], 'Away meet')
        self.assertEqual(top['age_at_competition'], 16)
        self.assertEqual(top['nationality_code'], 'TUN')
        # the tie goes to the real swim, which links to its race
        self.assertEqual(second['result_id'], self.res.id)
        self.assertFalse(second.get('from_record'))

    def test_filters_apply_to_record_entries(self):
        names = lambda **p: [x['swimmer_name'] for x in self.rows(**p)]
        self.assertEqual(names(year=2026), ['Record ONLY', 'Meet SWIMMER'])
        self.assertEqual(names(year=2025), ['Meet SWIMMER'])            # only the slower hand entry
        self.assertEqual(names(pool='SCM'), [])
        self.assertEqual(names(gender='F'), [])
        self.assertEqual(names(age_group='U16'), ['Record ONLY'])       # 16 in 2026; the other is 26
        self.assertEqual(names(scope='gcc'), [])
        self.assertEqual(names(scope='national', country=self.tun.id), ['Record ONLY', 'Meet SWIMMER'])
        self.assertEqual(names(scope='national', country=self.ksa.id), [])
        # a meet filter shows that meet only: a record entry has no meet
        self.assertEqual(names(championship=self.champ.id), ['Meet SWIMMER'])

    def test_national_record_counts_for_the_country_it_is_saved_to(self):
        self.rec(self.b, 2300, country=self.ksa)
        rows = self.rows(scope='national', country=self.ksa.id)
        self.assertEqual([(x['swimmer_name'], x['nationality_code']) for x in rows], [('Record ONLY', 'KSA')])

    def test_swimmer_rank_positions_count_record_entries(self):
        api = APIClient()
        a = api.get(f'/api/v1/swimmers/{self.a.id}/rankings/').json()
        row = next(x for x in a if x['event_id'] == self.e50.id and x['pool'] == 'LCM')
        self.assertEqual(row['rankings']['national'], {'rank': 2, 'total': 2})
        b = api.get(f'/api/v1/swimmers/{self.b.id}/rankings/').json()
        row = next(x for x in b if x['event_id'] == self.e50.id and x['pool'] == 'LCM')
        self.assertEqual(row['best_time_centiseconds'], 2350)
        self.assertEqual(row['rankings']['arab']['rank'], 1)
        h = api.get(f'/api/v1/swimmers/{self.a.id}/ranking-history/', {'event': self.e50.id, 'pool': 'LCM'}).json()
        y2026 = next(x for x in h['seasons'] if x['year'] == 2026)
        self.assertEqual(y2026['national'], {'rank': 2, 'total': 2})
