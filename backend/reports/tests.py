"""Smoke tests for the cross-meet reports endpoints."""
from django.test import TestCase

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from medals.models import Medal
from records.models import Record


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
        Record.objects.create(swimmer=cls.s1, event=cls.event,
                              record_type='NATIONAL', pool='LCM',
                              time_centiseconds=5000, country=cls.egy,
                              result_date='2026-05-01', result=cls.r1)
        Record.objects.create(swimmer=cls.s1, event=cls.event,
                              record_type='ARAB', pool='LCM',
                              time_centiseconds=5000,
                              result_date='2026-05-01', result=cls.r1)

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

    def test_participation_by_swimmer(self):
        res = self.client.get('/api/v1/reports/participation/?group=swimmer')
        rows = res.json()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['results'], 1)
        self.assertEqual(rows[0]['meets'], 1)

    def test_records_by_swimmer(self):
        res = self.client.get('/api/v1/reports/records/?group=swimmer')
        rows = res.json()
        self.assertEqual(rows[0]['name'], 'Ali TAMER')
        self.assertEqual(rows[0]['records'], 2)

    def test_records_type_filter(self):
        res = self.client.get('/api/v1/reports/records/?group=type&record_type=ARAB')
        rows = res.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['name'], 'ARAB')

    def test_records_country_filter(self):
        res = self.client.get('/api/v1/reports/records/?group=swimmer&country=EGY')
        self.assertEqual(res.json()[0]['records'], 2)

    def test_overview_gender_split(self):
        d = self.client.get('/api/v1/reports/overview/').json()
        self.assertEqual(d['men'], 2)
        self.assertEqual(d['women'], 0)

    def test_date_filter_excludes(self):
        res = self.client.get('/api/v1/reports/overview/?date_from=2026-06-01')
        self.assertEqual(res.json()['results'], 0)

    def test_top_times_per_event(self):
        back = Event.objects.create(name='100 M Backstroke', distance=100,
                                    stroke='Backstroke', is_relay=False)
        Result.objects.create(
            swimmer=self.s1, championship=self.meet, event=back,
            round_type='Finals', time_centiseconds=6000, fina_points=700,
            team='GEZIRA', age_at_competition=19)
        res = self.client.get('/api/v1/reports/top-times/?per_event=1&limit=1')
        rows = res.json()
        # one row (the fastest) per event
        self.assertEqual(len(rows), 2)
        self.assertEqual({r['event_name'] for r in rows},
                         {'100 M Freestyle', '100 M Backstroke'})
        free = next(r for r in rows if r['event_name'] == '100 M Freestyle')
        self.assertEqual(free['time_centiseconds'], 5000)

    def test_ask_requires_auth(self):
        res = self.client.post('/api/v1/reports/ask/', {'question': 'hi'})
        self.assertIn(res.status_code, (401, 403))


class AskHeuristicTests(TestCase):
    """The no-API-key fallback parser must nail the common question shapes."""
    @classmethod
    def setUpTestData(cls):
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.free50 = Event.objects.create(name='50 M Freestyle', distance=50,
                                          stroke='Freestyle', is_relay=False)

    def test_fastest_times_question(self):
        from .views import _heuristic_plan
        plan = _heuristic_plan('give me the fastest 10 times for all tunisian '
                               'swimmers in all meets for the 50 freestyle '
                               'in the last 6 months')
        self.assertEqual(plan['tab'], 'times')
        self.assertEqual(plan['limit'], 10)
        self.assertEqual(plan['filters']['country'], 'TUN')
        self.assertEqual(plan['filters']['event'], self.free50.id)
        self.assertIn('date_from', plan['filters'])

    def test_medals_by_club(self):
        from .views import _heuristic_plan
        plan = _heuristic_plan('medal table by club for egyptian swimmers in 2025')
        self.assertEqual(plan['tab'], 'medals')
        self.assertEqual(plan.get('group'), 'club')
        self.assertEqual(plan['filters']['country'], 'EGY')
        self.assertEqual(plan['filters']['date_from'], '2025-01-01')

    def test_per_event_breakdown(self):
        from .views import _heuristic_plan
        plan = _heuristic_plan('10 fastest egyptians in each event')
        self.assertEqual(plan['tab'], 'times')
        self.assertTrue(plan['per_event'])
        self.assertEqual(plan['limit'], 10)
        self.assertEqual(plan['filters']['country'], 'EGY')
        self.assertNotIn('event', plan['filters'])

    def test_medal_table_for_clubs(self):
        from .views import _heuristic_plan
        plan = _heuristic_plan('medal table for clubs in tunisia meets this year')
        self.assertEqual(plan['tab'], 'medals')
        self.assertEqual(plan.get('group'), 'club')

    def test_validate_plan_championship(self):
        from .views import _validate_plan
        meet = Championship.objects.create(
            name='Arab Champs 2025', date='2025-05-01', pool='LCM',
            country=self.tun)
        plan = _validate_plan({'tab': 'medals',
                               'filters': {'championship': meet.id}})
        self.assertEqual(plan['filters']['championship'], meet.id)
        self.assertEqual(plan['championship_name'], 'Arab Champs 2025')
        # unknown id is dropped
        plan = _validate_plan({'tab': 'medals',
                               'filters': {'championship': 999999}})
        self.assertNotIn('championship', plan['filters'])

    def test_women_under_18(self):
        from .views import _heuristic_plan
        plan = _heuristic_plan('top 20 women under 18 in 50 free long course')
        self.assertEqual(plan['filters']['gender'], 'F')
        self.assertEqual(plan['filters']['age_max'], 17)
        self.assertEqual(plan['filters']['pool'], 'LCM')
        self.assertEqual(plan['limit'], 20)
