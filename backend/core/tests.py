from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from medals.models import Medal
from records.models import Record
from teams.models import Team


class CountryProfileTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('admin', password='x')
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        other = Country.objects.create(name='Qatar', code='QAT', region='GCC')
        free50 = Event.objects.create(name='50m Freestyle', distance=50,
                                      stroke='Freestyle', sort_order=1)
        relay = Event.objects.create(name='4x100m Freestyle Relay', distance=400,
                                     stroke='Freestyle Relay', is_relay=True,
                                     sort_order=90)
        champ = Championship.objects.create(
            name='Arab Cup', date=date(2026, 5, 1), pool='LCM', country=cls.egy,
            location='Cairo')
        omar = Swimmer.objects.create(name='Omar Kamal', nationality=cls.egy,
                                      sex='M', birth_year=2005)
        nada = Swimmer.objects.create(name='Nada Fawzy', nationality=cls.egy,
                                      sex='F', birth_year=2007)
        foreign = Swimmer.objects.create(name='Ali Qatari', nationality=other,
                                         sex='M', birth_year=2004)
        r1 = Result.objects.create(swimmer=omar, championship=champ, event=free50,
                                   round_type='Finals', time_centiseconds=2350,
                                   fina_points=700)
        Result.objects.create(swimmer=omar, championship=champ, event=free50,
                              round_type='Prelims', time_centiseconds=2400,
                              fina_points=650)
        Result.objects.create(swimmer=nada, championship=champ, event=free50,
                              round_type='Finals', time_centiseconds=2600,
                              fina_points=680)
        Result.objects.create(swimmer=foreign, championship=champ, event=free50,
                              round_type='Finals', time_centiseconds=2300,
                              fina_points=720)
        # relay result should not appear in individual best times
        Result.objects.create(swimmer=omar, championship=champ, event=relay,
                              round_type='Finals', time_centiseconds=21000)
        Medal.objects.create(swimmer=omar, championship=champ, event=free50,
                             medal_type='GOLD', result=r1)
        Medal.objects.create(swimmer=nada, championship=champ, event=free50,
                             medal_type='SILVER')
        Record.objects.create(swimmer=omar, event=free50, record_type='NATIONAL',
                              time_centiseconds=2350, result_date=date(2026, 5, 1),
                              location='Cairo')
        Team.objects.create(name='Egypt National Team', country=cls.egy,
                            is_national_team=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def get_profile(self):
        resp = self.client.get(f'/api/v1/countries/{self.egy.id}/profile/')
        self.assertEqual(resp.status_code, 200)
        return resp.json()

    def test_stats(self):
        d = self.get_profile()
        self.assertEqual(d['country']['code'], 'EGY')
        self.assertEqual(d['stats']['swimmers'], 2)
        self.assertEqual(d['stats']['swimmers_male'], 1)
        self.assertEqual(d['stats']['swimmers_female'], 1)
        self.assertEqual(d['stats']['results'], 4)  # foreign swimmer excluded
        self.assertEqual(d['stats']['championships_hosted'], 1)
        self.assertEqual(d['stats']['teams'], 1)
        self.assertEqual(d['stats']['records'], 1)
        self.assertEqual(d['medals'], {'gold': 1, 'silver': 1, 'bronze': 0,
                                       'total': 2})

    def test_top_swimmers_best_swim_each(self):
        d = self.get_profile()
        self.assertEqual([s['name'] for s in d['top_swimmers']],
                         ['Omar Kamal', 'Nada Fawzy'])
        omar = d['top_swimmers'][0]
        self.assertEqual(omar['best_fina'], 700)
        self.assertEqual(omar['best_time'], '23.50')
        self.assertEqual(omar['best_event'], '50m Freestyle')

    def test_best_times_per_event_sex_pool(self):
        d = self.get_profile()
        self.assertEqual(len(d['best_times']), 2)  # M + F, relay excluded
        by_sex = {b['sex']: b for b in d['best_times']}
        self.assertEqual(by_sex['M']['time'], '23.50')  # finals, not prelims
        self.assertEqual(by_sex['M']['swimmer'], 'Omar Kamal')
        self.assertEqual(by_sex['F']['time'], '26.00')
        self.assertEqual(by_sex['M']['pool'], 'LCM')

    def test_records_and_lists(self):
        d = self.get_profile()
        self.assertEqual(len(d['records']), 1)
        self.assertEqual(d['records'][0]['record_type'], 'NATIONAL')
        self.assertEqual(d['records'][0]['time'], '23.50')
        self.assertEqual(len(d['championships_hosted']), 1)
        self.assertEqual(d['championships_hosted'][0]['name'], 'Arab Cup')
        self.assertEqual(len(d['teams']), 1)
        self.assertTrue(d['teams'][0]['is_national_team'])
        self.assertEqual(d['top_medalists'][0]['name'], 'Omar Kamal')
        self.assertEqual(d['top_medalists'][0]['gold'], 1)
