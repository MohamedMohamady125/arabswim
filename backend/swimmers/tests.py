from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Country
from swimmers.models import Swimmer, NationalityChange


class ChangeNationalityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser('boss', password='x')
        cls.viewer = get_user_model().objects.create_user('joe', password='x')
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.qat = Country.objects.create(name='Qatar', code='QAT', region='GCC')
        cls.swimmer = Swimmer.objects.create(
            name='Omar Kamal', nationality=cls.egy, sex='M', birth_year=2005)

    def setUp(self):
        self.client = APIClient()

    def url(self):
        return f'/api/v1/swimmers/{self.swimmer.id}/change-nationality/'

    def test_admin_changes_nationality_and_records_history(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(self.url(), {
            'country': self.qat.id,
            'effective_date': '2026-08-01',
            'notes': 'sports citizenship',
        })
        self.assertEqual(resp.status_code, 200)
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.nationality_id, self.qat.id)
        change = NationalityChange.objects.get(swimmer=self.swimmer)
        self.assertEqual(change.from_country_id, self.egy.id)
        self.assertEqual(change.to_country_id, self.qat.id)
        self.assertEqual(change.effective_date, date(2026, 8, 1))
        self.assertEqual(change.notes, 'sports citizenship')

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(self.viewer)
        resp = self.client.post(self.url(), {'country': self.qat.id})
        self.assertEqual(resp.status_code, 403)
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.nationality_id, self.egy.id)

    def test_same_country_rejected(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(self.url(), {'country': self.egy.id})
        self.assertEqual(resp.status_code, 400)

    def test_bad_date_rejected(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(self.url(), {
            'country': self.qat.id, 'effective_date': 'nope'})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(NationalityChange.objects.count(), 0)

    def test_past_change_always_sets_current_nationality(self):
        # STRICT: the current nationality follows the timeline — a change
        # whose effective date has passed flips the profile even when the
        # old record_only flag is sent (legacy clients).
        self.client.force_authenticate(self.admin)
        resp = self.client.post(self.url(), {
            'country': self.qat.id,
            'effective_date': '2026-04-01',
            'record_only': True,
        })
        self.assertEqual(resp.status_code, 200)
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.nationality_id, self.qat.id)

    def test_future_change_waits_for_its_date(self):
        from datetime import timedelta
        self.client.force_authenticate(self.admin)
        future = (date.today() + timedelta(days=90)).isoformat()
        resp = self.client.post(self.url(), {
            'country': self.qat.id, 'effective_date': future})
        self.assertEqual(resp.status_code, 200)
        self.swimmer.refresh_from_db()
        # Not effective yet — current nationality stays
        self.assertEqual(self.swimmer.nationality_id, self.egy.id)
        self.assertEqual(NationalityChange.objects.count(), 1)

    def test_deleting_only_change_reverts_current(self):
        self.client.force_authenticate(self.admin)
        self.client.post(self.url(), {
            'country': self.qat.id, 'effective_date': '2026-04-01'})
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.nationality_id, self.qat.id)
        ch = NationalityChange.objects.get(swimmer=self.swimmer)
        resp = self.client.delete(
            f'/api/v1/swimmers/{self.swimmer.id}/nationality-changes/{ch.id}/')
        self.assertEqual(resp.status_code, 204)
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.nationality_id, self.egy.id)

    def test_latest_of_several_changes_wins(self):
        self.client.force_authenticate(self.admin)
        self.client.post(self.url(), {
            'country': self.qat.id, 'effective_date': '2026-04-01'})
        ksa = Country.objects.create(name='Saudi Arabia', code='KSA', region='GCC')
        self.client.post(self.url(), {
            'country': ksa.id, 'effective_date': '2026-09-01'})
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.nationality_id, ksa.id)
        # Deleting the latest change falls back to the previous one
        latest = NationalityChange.objects.get(
            swimmer=self.swimmer, to_country=ksa)
        self.client.delete(
            f'/api/v1/swimmers/{self.swimmer.id}/nationality-changes/{latest.id}/')
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.nationality_id, self.qat.id)


class ResultNationalityStampingTests(TestCase):
    """Per-swim nationality: results carry the country represented at the
    meet's date; a nationality change re-stamps only swims from the
    effective date onward."""

    @classmethod
    def setUpTestData(cls):
        from core.models import Event
        from championships.models import Championship
        cls.admin = get_user_model().objects.create_superuser('boss', password='x')
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.qat = Country.objects.create(name='Qatar', code='QAT', region='GCC')
        cls.swimmer = Swimmer.objects.create(
            name='Omar Kamal', nationality=cls.egy, sex='M', birth_year=2005)
        cls.event = Event.objects.create(
            name='100 M Freestyle', distance=100, stroke='Freestyle', is_relay=False)
        cls.old_meet = Championship.objects.create(
            name='Old Meet', date='2024-05-01', pool='LCM', country=cls.egy)
        cls.new_meet = Championship.objects.create(
            name='New Meet', date='2026-09-01', pool='LCM', country=cls.qat)

    def setUp(self):
        from championships.models import Result
        self.client = APIClient()
        self.old_result = Result.objects.create(
            swimmer=self.swimmer, championship=self.old_meet, event=self.event,
            round_type='Finals', time_centiseconds=5000)
        self.new_result = Result.objects.create(
            swimmer=self.swimmer, championship=self.new_meet, event=self.event,
            round_type='Finals', time_centiseconds=4900)

    def _change(self, effective_date='2026-01-01'):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            f'/api/v1/swimmers/{self.swimmer.id}/change-nationality/',
            {'country': self.qat.id, 'effective_date': effective_date})
        self.assertEqual(resp.status_code, 200)

    def test_result_save_stamps_current_nationality(self):
        self.assertEqual(self.old_result.nationality_id, self.egy.id)
        self.assertEqual(self.new_result.nationality_id, self.egy.id)

    def test_change_restamps_only_from_effective_date(self):
        self._change('2026-01-01')
        self.old_result.refresh_from_db()
        self.new_result.refresh_from_db()
        self.assertEqual(self.old_result.nationality_id, self.egy.id)  # keeps old flag
        self.assertEqual(self.new_result.nationality_id, self.qat.id)

    def test_delete_change_restamps_back(self):
        self._change('2026-01-01')
        ch = NationalityChange.objects.get(swimmer=self.swimmer)
        resp = self.client.delete(
            f'/api/v1/swimmers/{self.swimmer.id}/nationality-changes/{ch.id}/')
        self.assertEqual(resp.status_code, 204)
        self.old_result.refresh_from_db()
        self.new_result.refresh_from_db()
        # No timeline left: everything carries the (still Qatari) current flag
        self.swimmer.refresh_from_db()
        self.assertEqual(self.old_result.nationality_id, self.swimmer.nationality_id)
        self.assertEqual(self.new_result.nationality_id, self.swimmer.nationality_id)

    def test_medal_recompute_carries_result_nationality(self):
        from medals.utils import recompute_medals
        from medals.models import Medal
        self._change('2026-01-01')
        recompute_medals(self.old_meet)
        recompute_medals(self.new_meet)
        old_medal = Medal.objects.get(championship=self.old_meet)
        new_medal = Medal.objects.get(championship=self.new_meet)
        self.assertEqual(old_medal.nationality_id, self.egy.id)
        self.assertEqual(new_medal.nationality_id, self.qat.id)

    def test_event_history_marks_old_nationality_swims(self):
        self._change('2026-01-01')
        resp = self.client.get(
            f'/api/v1/swimmers/{self.swimmer.id}/events/{self.event.id}/history/')
        self.assertEqual(resp.status_code, 200)
        by_meet = {row['championship_name']: row for row in resp.json()}
        self.assertEqual(by_meet['Old Meet']['represented']['code'], 'EGY')
        self.assertIsNone(by_meet['New Meet']['represented'])


class SetClubCountryTests(TestCase):
    """Admin fix for guest clubs filed under a meet's host country —
    e.g. a French club at a Tunisian national meet auto-voted TUN."""
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser('boss2', password='x')
        cls.viewer = get_user_model().objects.create_user('joe2', password='x')
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.fra = Country.objects.create(name='France', code='FRA', region='OTHER')
        cls.swimmer = Swimmer.objects.create(
            name='Lea Blanc', nationality=cls.fra, sex='F', birth_year=2006,
            club='CN MARSEILLE')

    def setUp(self):
        self.client = APIClient()

    def url(self):
        return f'/api/v1/swimmers/{self.swimmer.id}/set-club-country/'

    def test_admin_fixes_wrongly_voted_country(self):
        from teams.models import Team
        team = Team.objects.create(name='CN MARSEILLE', country=self.tun)
        self.client.force_authenticate(self.admin)
        resp = self.client.post(self.url(), {
            'club': 'CN Marseille 2', 'country_code': 'FRA'})
        self.assertEqual(resp.status_code, 200)
        team.refresh_from_db()
        self.assertEqual(team.country, self.fra)
        self.assertTrue(team.country_manually_set)
        self.assertFalse(resp.json()['created'])

    def test_creates_team_when_club_has_none(self):
        from teams.models import Team
        self.client.force_authenticate(self.admin)
        resp = self.client.post(self.url(), {
            'club': 'CN MARSEILLE', 'country_code': 'FRA'})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()['created'])
        self.assertEqual(
            Team.objects.get(name='CN MARSEILLE').country, self.fra)

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(self.viewer)
        resp = self.client.post(self.url(), {
            'club': 'CN MARSEILLE', 'country_code': 'FRA'})
        self.assertEqual(resp.status_code, 403)

    def test_unknown_country_rejected(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(self.url(), {
            'club': 'CN MARSEILLE', 'country_code': 'ZZZ'})
        self.assertEqual(resp.status_code, 400)


class RelayLegIdMatchTests(TestCase):
    """Special-upload relay legs carry the matched profile's swimmer_id —
    the profile must surface the relay (with leg order) even when the
    file's leg name is spelled differently from the profile name."""
    @classmethod
    def setUpTestData(cls):
        from core.models import Event
        from championships.models import Championship, Result
        cls.alg = Country.objects.create(name='Algeria', code='ALG', region='ARAB')
        cls.swimmer = Swimmer.objects.create(
            name='Samy BOUTOUIL', nationality=cls.alg, sex='M', birth_year=2000)
        cls.relay_team = Swimmer.objects.create(
            name='Algeria', nationality=cls.alg, sex='M', is_relay_team=True)
        cls.event = Event.objects.create(
            name='4x100 M Freestyle Relay', distance=400,
            stroke='Freestyle', is_relay=True)
        cls.champ = Championship.objects.create(
            name='Arab Champs', date='2026-05-01', pool='LCM', country=cls.alg)
        cls.result = Result.objects.create(
            swimmer=cls.relay_team, championship=cls.champ, event=cls.event,
            round_type='Finals', time_centiseconds=20000, team='Algeria',
            relay_swimmers=[
                {'name': 'BOUTOUIL SAMY', 'split_time': '52.10',
                 'order': 2, 'swimmer_id': None},
            ])
        # Tag the leg with the real profile id (set here so the None above
        # can't accidentally pass an is-None check)
        cls.result.relay_swimmers[0]['swimmer_id'] = cls.swimmer.id
        cls.result.save(update_fields=['relay_swimmers'])

    def setUp(self):
        self.client = APIClient()

    def test_events_list_includes_id_matched_relay(self):
        resp = self.client.get(f'/api/v1/swimmers/{self.swimmer.id}/events/')
        self.assertEqual(resp.status_code, 200)
        relays = [e for e in resp.json() if e.get('is_relay')]
        self.assertEqual(len(relays), 1)
        self.assertEqual(relays[0]['split_time'], '52.10')
        # Leg 2 is a flying start — never a first-leg individual time
        self.assertFalse(relays[0]['is_first_leg'])

    def test_history_includes_leg_order(self):
        resp = self.client.get(
            f'/api/v1/swimmers/{self.swimmer.id}/events/{self.event.id}/history/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['leg_order'], 2)
        self.assertEqual(rows[0]['split_time'], '52.10')


class CareerSummaryTests(TestCase):
    """profile-stats returns the Overall tab's career_summary block."""

    @classmethod
    def setUpTestData(cls):
        from core.models import Event
        from championships.models import Championship, Result
        from medals.models import Medal
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.sw = Swimmer.objects.create(name='Omar Kamal', nationality=cls.egy,
                                        sex='M', birth_year=2005)
        free100 = Event.objects.create(name='100 M Freestyle', distance=100,
                                       stroke='Freestyle', is_relay=False)
        c1 = Championship.objects.create(name='Debut Cup', date=date(2020, 5, 1),
                                         pool='LCM', country=cls.egy)
        c2 = Championship.objects.create(name='Nationals', date=date(2023, 6, 1),
                                         pool='LCM', country=cls.egy)
        r1 = Result.objects.create(swimmer=cls.sw, championship=c1, event=free100,
                                   round_type='Finals', time_centiseconds=6000,
                                   fina_points=500, team='CN CAIRO')
        r2 = Result.objects.create(swimmer=cls.sw, championship=c2, event=free100,
                                   round_type='Finals', time_centiseconds=5500,
                                   fina_points=650, team='AL AHLY')
        Medal.objects.create(swimmer=cls.sw, championship=c2, event=free100,
                             medal_type='GOLD', result=r2, nationality=cls.egy)

    def test_career_summary_block(self):
        resp = APIClient().get(f'/api/v1/swimmers/{self.sw.id}/profile-stats/')
        self.assertEqual(resp.status_code, 200)
        cs = resp.data['career_summary']
        self.assertEqual(cs['debut']['meet'], 'Debut Cup')
        self.assertEqual(cs['debut']['age'], 15)
        self.assertEqual(cs['years_active'], 4)
        self.assertEqual(cs['seasons'], 2)
        self.assertEqual(cs['total_swims'], 2)
        self.assertEqual(cs['distance_km'], 0.2)
        self.assertEqual(cs['specialty_stroke'], 'Freestyle')
        self.assertEqual(cs['specialty_range'], 'Sprint')
        self.assertEqual(cs['podium_pct'], 50)
        self.assertEqual(cs['top_meet']['name'], 'Nationals')
        self.assertEqual(cs['clubs_count'], 2)
        self.assertEqual(cs['host_countries'], 1)
        self.assertEqual(cs['improvement']['seconds'], 5.0)
        self.assertEqual(cs['improvement']['from_year'], 2020)
        self.assertEqual(cs['pb_age'], 18)


class RankingHistoryTests(TestCase):
    """ranking-history returns per-season rank among season bests."""

    @classmethod
    def setUpTestData(cls):
        from core.models import Event
        from championships.models import Championship, Result
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.free = Event.objects.create(name='100 M Freestyle', distance=100,
                                        stroke='Freestyle', is_relay=False)
        cls.sw = Swimmer.objects.create(name='Omar Kamal', nationality=cls.egy,
                                        sex='M', birth_year=2005)
        rival = Swimmer.objects.create(name='Rival Guy', nationality=cls.egy,
                                       sex='M', birth_year=2005)
        c23 = Championship.objects.create(name='M23', date=date(2023, 6, 1),
                                          pool='LCM', country=cls.egy)
        c24 = Championship.objects.create(name='M24', date=date(2024, 6, 1),
                                          pool='LCM', country=cls.egy)
        mk = lambda s, c, t: Result.objects.create(
            swimmer=s, championship=c, event=cls.free, round_type='Finals',
            time_centiseconds=t)
        mk(cls.sw, c23, 6000); mk(rival, c23, 5900)   # 2023: rival faster
        mk(cls.sw, c24, 5500); mk(rival, c24, 5800)   # 2024: swimmer faster

    def test_season_ranks(self):
        resp = APIClient().get(
            f'/api/v1/swimmers/{self.sw.id}/ranking-history/?event={self.free.id}&pool=LCM')
        self.assertEqual(resp.status_code, 200)
        seasons = resp.data['seasons']
        self.assertEqual([s['year'] for s in seasons], [2023, 2024])
        self.assertEqual(seasons[0]['national'], {'rank': 2, 'total': 2})
        self.assertEqual(seasons[1]['national'], {'rank': 1, 'total': 2})
        self.assertEqual(seasons[1]['arab'], {'rank': 1, 'total': 2})
        self.assertEqual(seasons[1]['time'], '55.00')

    def test_default_event_picked(self):
        resp = APIClient().get(f'/api/v1/swimmers/{self.sw.id}/ranking-history/')
        self.assertEqual(resp.data['event_id'], self.free.id)
        self.assertEqual(len(resp.data['seasons']), 2)


class SwimmerListOrderingTests(TestCase):
    """Swimmers with no nationality always appear last in the list."""

    @classmethod
    def setUpTestData(cls):
        egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        Swimmer.objects.create(name='Zein Known', nationality=egy, sex='M')
        Swimmer.objects.create(name='Adam Unknown', nationality=None, sex='M')
        Swimmer.objects.create(name='Aly Known', nationality=egy, sex='M')

    def test_no_nationality_last(self):
        resp = APIClient().get('/api/v1/swimmers/')
        names = [s['name'] for s in resp.data['results']]
        self.assertEqual(names, ['Aly Known', 'Zein Known', 'Adam Unknown'])
