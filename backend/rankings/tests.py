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
