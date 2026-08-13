"""Smoke tests for the cross-meet reports endpoints."""
from django.test import TestCase

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from medals.models import Medal


class ReportsEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.event = Event.objects.create(name='100 M Freestyle', distance=100,
                                         stroke='Freestyle', is_relay=False)
        cls.meet = Championship.objects.create(
            name='Arab Champs', date='2026-05-01', pool='LCM', country=cls.egy)
        cls.s1 = Swimmer.objects.create(name='Ali TAMER', sex='M', nationality=cls.egy)
        cls.s2 = Swimmer.objects.create(name='Rami SFAXI', sex='M', nationality=cls.tun)
        cls.r1 = Result.objects.create(
            swimmer=cls.s1, championship=cls.meet, event=cls.event,
            round_type='Finals', time_centiseconds=5000, fina_points=800,
            team='GEZIRA', age_at_competition=19)
        cls.r2 = Result.objects.create(
            swimmer=cls.s2, championship=cls.meet, event=cls.event,
            round_type='Finals', time_centiseconds=5100, fina_points=750,
            team='CNTUN', age_at_competition=20)
        Medal.objects.create(swimmer=cls.s1, championship=cls.meet,
                             event=cls.event, medal_type='GOLD',
                             result=cls.r1, nationality=cls.egy)
        Medal.objects.create(swimmer=cls.s2, championship=cls.meet,
                             event=cls.event, medal_type='SILVER',
                             result=cls.r2, nationality=cls.tun)

    def test_overview(self):
        res = self.client.get('/api/v1/reports/overview/')
        self.assertEqual(res.status_code, 200)
        d = res.json()
        self.assertEqual(d['results'], 2)
        self.assertEqual(d['swimmers'], 2)
        self.assertEqual(d['meets'], 1)
        self.assertEqual(d['clubs'], 2)
        self.assertEqual(d['medals'], 2)
        self.assertEqual(d['best_fina'], 800)

    def test_overview_country_filter(self):
        res = self.client.get('/api/v1/reports/overview/?country=EGY')
        self.assertEqual(res.json()['results'], 1)

    def test_medal_table_by_country(self):
        res = self.client.get('/api/v1/reports/medal-table/?group=country')
        rows = res.json()
        self.assertEqual(rows[0]['name'], 'Egypt')
        self.assertEqual(rows[0]['gold'], 1)
        self.assertEqual(rows[1]['silver'], 1)

    def test_medal_table_by_club(self):
        res = self.client.get('/api/v1/reports/medal-table/?group=club')
        names = {r['name'] for r in res.json()}
        self.assertEqual(names, {'GEZIRA', 'CNTUN'})

    def test_medal_table_by_swimmer(self):
        res = self.client.get('/api/v1/reports/medal-table/?group=swimmer')
        self.assertEqual(res.json()[0]['name'], 'Ali TAMER')

    def test_top_times_by_event(self):
        res = self.client.get(f'/api/v1/reports/top-times/?event={self.event.id}')
        rows = res.json()
        self.assertEqual(rows[0]['swimmer_name'], 'Ali TAMER')
        self.assertEqual(rows[0]['time_centiseconds'], 5000)

    def test_top_times_no_event_orders_by_fina(self):
        res = self.client.get('/api/v1/reports/top-times/')
        self.assertEqual(res.json()[0]['fina_points'], 800)

    def test_participation_by_club(self):
        res = self.client.get('/api/v1/reports/participation/?group=club')
        rows = {r['name']: r for r in res.json()}
        self.assertEqual(rows['GEZIRA']['swimmers'], 1)

    def test_participation_by_meet(self):
        res = self.client.get('/api/v1/reports/participation/?group=meet')
        self.assertEqual(res.json()[0]['swimmers'], 2)

    def test_date_filter_excludes(self):
        res = self.client.get('/api/v1/reports/overview/?date_from=2026-06-01')
        self.assertEqual(res.json()['results'], 0)
