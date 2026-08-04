"""Tests for squad-number stripping on Algerian team names."""
from django.core.management import call_command
from django.test import TestCase

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from teams.models import Team
from teams.utils import strip_squad_number, normalize_team_key, national_team_country


class NormalizeTeamKeyTests(TestCase):
    def test_punctuation_and_case_variants_match(self):
        self.assertEqual(normalize_team_key('Al-Ahly'), normalize_team_key('AL AHLY'))
        self.assertEqual(normalize_team_key('- Al Ahly'), normalize_team_key('al ahly'))
        self.assertEqual(normalize_team_key("Mouloudia Club D'Alger"),
                         normalize_team_key('Mouloudia Club D Alger'))

    def test_squad_suffixes_collapse(self):
        self.assertEqual(normalize_team_key('MC ALGER 2'), normalize_team_key('MC ALGER'))
        self.assertEqual(normalize_team_key('BAHIA NAUTIQUE B'), normalize_team_key('Bahia Nautique'))

    def test_national_team_suffixes_collapse(self):
        self.assertEqual(normalize_team_key('Bahrain Team A'), 'bahrain')
        self.assertEqual(normalize_team_key('Bahrain National Team'), 'bahrain')

    def test_distinct_clubs_stay_distinct(self):
        self.assertNotEqual(normalize_team_key('CS KOLEA'), normalize_team_key('CR BELOUIZDAD'))
        # Long numbers are part of the name, not squad numbers
        self.assertNotEqual(normalize_team_key('Club 2000'), normalize_team_key('Club'))


class NationalTeamCountryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.bah = Country.objects.create(name='Bahrain', code='BRN', region='GCC')

    def test_detects_variants(self):
        for name in ['Bahrain', 'Bahrain Team A', 'BRN', 'BRN Bahrain', 'Bahrain National Team']:
            self.assertEqual(national_team_country(name), self.bah, name)

    def test_ignores_clubs(self):
        self.assertIsNone(national_team_country('Al Ahly'))


class AutoDedupeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.country = Country.objects.create(name='Bahrain', code='BRN', region='GCC')
        cls.event = Event.objects.create(name='100 M Freestyle', distance=100,
                                         stroke='Freestyle', is_relay=False)
        cls.champ = Championship.objects.create(
            name='Gulf Champs', date='2026-06-01', pool='LCM', country=cls.country)

    def setUp(self):
        self.client.force_login(self._admin())

    def _admin(self):
        from django.contrib.auth import get_user_model
        return get_user_model().objects.create_user('admin', password='x', is_staff=True, role='ADMIN')

    def _result(self, team_name):
        sw = Swimmer.objects.create(name=f'Swimmer {team_name}', sex='M',
                                    nationality=self.country, club=team_name)
        Result.objects.create(swimmer=sw, championship=self.champ, event=self.event,
                              round_type='Finals', category='', team=team_name,
                              time_centiseconds=5500)

    def test_dry_run_changes_nothing(self):
        Team.objects.create(name='Al Ahly', country=self.country)
        Team.objects.create(name='AL-AHLY', country=self.country)
        res = self.client.post('/api/v1/teams/auto-dedupe/', {'dry_run': True},
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['groups']), 1)
        self.assertEqual(Team.objects.count(), 2)

    def test_merges_punctuation_variants(self):
        keep = Team.objects.create(name='Al Ahly', country=self.country)
        Team.objects.create(name='AL-AHLY', country=self.country)
        self._result('Al Ahly')
        self._result('Al Ahly')
        self._result('AL-AHLY')
        res = self.client.post('/api/v1/teams/auto-dedupe/', {'dry_run': False},
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Team.objects.count(), 1)
        self.assertEqual(Team.objects.get().name, 'Al Ahly')
        # All results/swimmers now point at the kept name
        self.assertEqual(Result.objects.filter(team='Al Ahly').count(), 3)
        self.assertEqual(Swimmer.objects.filter(club='Al Ahly').count(), 3)

    def test_consolidates_national_team_variants(self):
        Team.objects.create(name='Bahrain', country=self.country)
        Team.objects.create(name='Bahrain Team A', country=self.country)
        Team.objects.create(name='BRN Bahrain', country=self.country)
        self._result('Bahrain Team A')
        res = self.client.post('/api/v1/teams/auto-dedupe/', {'dry_run': False},
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Team.objects.count(), 1)
        team = Team.objects.get()
        self.assertEqual(team.name, 'Bahrain')
        self.assertTrue(team.is_national_team)
        self.assertEqual(Result.objects.filter(team='Bahrain').count(), 1)

    def test_lone_national_variant_renamed(self):
        Team.objects.create(name='Bahrain Team A', country=self.country)
        self.client.post('/api/v1/teams/auto-dedupe/', {'dry_run': False},
                         content_type='application/json')
        team = Team.objects.get()
        self.assertEqual(team.name, 'Bahrain')
        self.assertTrue(team.is_national_team)

    def test_idempotent(self):
        Team.objects.create(name='Al Ahly', country=self.country)
        Team.objects.create(name='AL-AHLY', country=self.country)
        self.client.post('/api/v1/teams/auto-dedupe/', {'dry_run': False},
                         content_type='application/json')
        res = self.client.post('/api/v1/teams/auto-dedupe/', {'dry_run': False},
                               content_type='application/json')
        self.assertEqual(res.json()['groups'], [])
        self.assertEqual(Team.objects.count(), 1)


class StripSquadNumberTests(TestCase):
    def test_strips_trailing_number(self):
        self.assertEqual(strip_squad_number('BAHIA NAUTIQUE 2'), 'BAHIA NAUTIQUE')
        self.assertEqual(strip_squad_number("Mouloudia Club D'Alger 12"),
                         "Mouloudia Club D'Alger")

    def test_keeps_names_without_squad_number(self):
        self.assertEqual(strip_squad_number('MC ALGER'), 'MC ALGER')
        # Digits inside the name stay ("18 Fev" is part of the club name)
        self.assertEqual(
            strip_squad_number('Piscine 18 Fev Ouargla'), 'Piscine 18 Fev Ouargla')
        # A long number is not a squad number (e.g. founding year)
        self.assertEqual(strip_squad_number('Club 2000'), 'Club 2000')
        self.assertEqual(strip_squad_number(''), '')
        self.assertEqual(strip_squad_number(None), '')


class RelayImportSquadNumberTests(TestCase):
    """confirm_import must store relay teams without squad numbers."""

    @classmethod
    def setUpTestData(cls):
        Country.objects.create(name='Algeria', code='ALG', region='ARAB')

    def setUp(self):
        import importer.matcher as matcher
        matcher._country_cache = None

    def test_relay_squads_stored_under_club_name(self):
        from importer.services import confirm_import
        preview = {
            'meet': {'name': 'Algerian Champs', 'date': '2026-06-01', 'pool': 'LCM'},
            'events': [{
                'event_name': '4 x 100 M Freestyle Relay',
                'distance': 100, 'stroke': 'Freestyle',
                'gender': 'M', 'is_relay': True, 'round_type': 'Finals',
                'results': [
                    {'swimmer_name': 'MC ALGER 1', 'gender': 'M',
                     'time_centiseconds': 21000, 'birth_year': 0,
                     'nationality_code': 'ALG', 'is_relay': True},
                    {'swimmer_name': 'MC ALGER 2', 'gender': 'M',
                     'time_centiseconds': 22000, 'birth_year': 0,
                     'nationality_code': 'ALG', 'is_relay': True},
                ],
            }],
        }
        confirm_import(preview, {})
        teams = Swimmer.objects.filter(name__istartswith='MC ALGER')
        self.assertEqual(teams.count(), 1)
        team = teams.get()
        self.assertEqual(team.name, 'MC ALGER')
        # One placeholder swimmer, but each squad keeps its own result
        results = Result.objects.filter(swimmer=team).order_by('time_centiseconds')
        self.assertEqual(results.count(), 2)
        self.assertEqual([r.time_centiseconds for r in results], [21000, 22000])
        self.assertEqual([r.team for r in results], ['MC ALGER 1', 'MC ALGER 2'])


class StripTeamNumbersCommandTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.country = Country.objects.create(name='Algeria', code='ALG', region='ARAB')
        cls.event = Event.objects.create(name='4x100 M Freestyle Relay', distance=100,
                                         stroke='Freestyle', is_relay=True)
        cls.champ = Championship.objects.create(
            name='Algerian Champs', date='2026-06-01', pool='LCM', country=cls.country)

    def _squad(self, name, time_cs):
        sw = Swimmer.objects.create(name=name, sex='M', nationality=self.country,
                                    club=name)
        Result.objects.create(swimmer=sw, championship=self.champ, event=self.event,
                              round_type='Finals', category='', team=name,
                              time_centiseconds=time_cs)
        return sw

    def test_merges_numbered_squads_keeping_both_results(self):
        self._squad('BAHIA NAUTIQUE 1', 21000)
        self._squad('BAHIA NAUTIQUE 2', 22000)
        call_command('strip_team_numbers')
        swimmers = Swimmer.objects.filter(name__istartswith='BAHIA')
        self.assertEqual(swimmers.count(), 1)
        sw = swimmers.get()
        self.assertEqual(sw.name, 'BAHIA NAUTIQUE')
        self.assertEqual(sw.club, 'BAHIA NAUTIQUE')
        results = Result.objects.filter(swimmer=sw).order_by('time_centiseconds')
        self.assertEqual([r.time_centiseconds for r in results], [21000, 22000])
        self.assertEqual([r.team for r in results],
                         ['BAHIA NAUTIQUE 1', 'BAHIA NAUTIQUE 2'])

    def test_merges_into_existing_base_swimmer(self):
        base = self._squad('MC ALGER', 20000)
        self._squad('MC ALGER 2', 21000)
        call_command('strip_team_numbers')
        self.assertEqual(Swimmer.objects.filter(name__istartswith='MC ALGER').count(), 1)
        self.assertEqual(Result.objects.filter(swimmer=base).count(), 2)

    def test_strips_individual_club_and_result_team(self):
        sw = Swimmer.objects.create(name='Ali Benali', sex='M',
                                    nationality=self.country, club='CR BELOUIZDAD 1')
        ev = Event.objects.create(name='100 M Freestyle', distance=100,
                                  stroke='Freestyle', is_relay=False)
        r = Result.objects.create(swimmer=sw, championship=self.champ, event=ev,
                                  round_type='Finals', category='',
                                  team='CR BELOUIZDAD 1', time_centiseconds=5500)
        call_command('strip_team_numbers')
        sw.refresh_from_db(); r.refresh_from_db()
        self.assertEqual(sw.name, 'Ali Benali')
        self.assertEqual(sw.club, 'CR BELOUIZDAD')
        self.assertEqual(r.team, 'CR BELOUIZDAD')

    def test_team_records_renamed_or_merged(self):
        Team.objects.create(name='Olimpique Mila 1', country=self.country)
        Team.objects.create(name='Olimpique Mila 2', country=self.country)
        Team.objects.create(name='CS KOLEA', country=self.country)
        Team.objects.create(name='CS KOLEA 1', country=self.country)
        call_command('strip_team_numbers')
        names = set(Team.objects.values_list('name', flat=True))
        self.assertEqual(names, {'Olimpique Mila', 'CS KOLEA'})

    def test_dry_run_changes_nothing(self):
        self._squad('BAHIA NAUTIQUE 1', 21000)
        call_command('strip_team_numbers', '--dry-run')
        self.assertTrue(Swimmer.objects.filter(name='BAHIA NAUTIQUE 1').exists())

    def test_idempotent(self):
        self._squad('BAHIA NAUTIQUE 1', 21000)
        call_command('strip_team_numbers')
        call_command('strip_team_numbers')
        self.assertEqual(Swimmer.objects.count(), 1)
        self.assertEqual(Result.objects.count(), 1)


class ApplySubclassificationCountryTests(TestCase):
    """National/Other meets force club countries to the sub-classification."""

    @classmethod
    def setUpTestData(cls):
        from championships.models import Classification, SubClassification
        cls.france = Country.objects.create(name='France', code='FRA', region='EUR')
        cls.belgium = Country.objects.create(name='Belgium', code='BEL', region='EUR')
        cls.event = Event.objects.create(name='100 M Freestyle', distance=100,
                                         stroke='Freestyle', is_relay=False)
        other = Classification.objects.create(name='Other')
        cls.sub_france = SubClassification.objects.create(
            classification=other, name='France')
        cls.champ = Championship.objects.create(
            name='French Nationals', date='2026-06-01', pool='LCM',
            country=cls.france, classification=other,
            sub_classification=cls.sub_france)

    def _result(self, club, swimmer_club=''):
        s = Swimmer.objects.create(name=f'S {club}', sex='M',
                                   nationality=self.france, club=swimmer_club)
        return Result.objects.create(
            swimmer=s, championship=self.champ, event=self.event,
            round_type='Finals', time_centiseconds=5000, team=club)

    def test_wrong_country_club_is_fixed(self):
        from teams.utils import apply_subclassification_country
        team = Team.objects.create(name='CN Marseille', country=self.belgium)
        self._result('CN Marseille')
        self.assertEqual(apply_subclassification_country(self.champ), 1)
        team.refresh_from_db()
        self.assertEqual(team.country, self.france)

    def test_swimmer_club_names_also_matched(self):
        from teams.utils import apply_subclassification_country
        team = Team.objects.create(name='Dauphins de Paris', country=self.belgium)
        self._result('', swimmer_club='Dauphins de Paris')
        apply_subclassification_country(self.champ)
        team.refresh_from_db()
        self.assertEqual(team.country, self.france)

    def test_national_teams_untouched(self):
        from teams.utils import apply_subclassification_country
        team = Team.objects.create(name='Belgium', country=self.belgium,
                                   is_national_team=True)
        self._result('Belgium')
        apply_subclassification_country(self.champ)
        team.refresh_from_db()
        self.assertEqual(team.country, self.belgium)

    def test_non_national_classification_ignored(self):
        from championships.models import Classification, SubClassification
        from teams.utils import apply_subclassification_country
        arab = Classification.objects.create(name='Arab')
        sub = SubClassification.objects.create(classification=arab, name='Arab Games')
        champ = Championship.objects.create(
            name='Arab Games', date='2026-07-01', pool='LCM',
            country=self.france, classification=arab, sub_classification=sub)
        team = Team.objects.create(name='CN Lyon', country=self.belgium)
        s = Swimmer.objects.create(name='X', sex='M', nationality=self.france)
        Result.objects.create(swimmer=s, championship=champ, event=self.event,
                              round_type='Finals', time_centiseconds=5000,
                              team='CN Lyon')
        self.assertEqual(apply_subclassification_country(champ), 0)
        team.refresh_from_db()
        self.assertEqual(team.country, self.belgium)


class CleanupOrphanTeamsTests(TestCase):
    """Teams whose club has no remaining swimmers or results are removed —
    e.g. after non-Arab swimmers are deleted from an imported meet."""

    @classmethod
    def setUpTestData(cls):
        cls.country = Country.objects.create(name='France', code='FRA', region='OTHER')
        cls.arab = Country.objects.create(name='Algeria', code='ALG', region='ARAB')

    def test_orphan_team_deleted(self):
        from teams.utils import cleanup_orphan_teams
        Team.objects.create(name='STADE OLYMPIQUE CHAMBÉRY', country=self.country)
        self.assertEqual(cleanup_orphan_teams(), 1)
        self.assertFalse(Team.objects.filter(name='STADE OLYMPIQUE CHAMBÉRY').exists())

    def test_team_with_swimmer_kept(self):
        from teams.utils import cleanup_orphan_teams
        Team.objects.create(name='MC ALGER', country=self.arab)
        Swimmer.objects.create(name='Ali TAMER', sex='M', nationality=self.arab, club='MC ALGER')
        self.assertEqual(cleanup_orphan_teams(), 0)

    def test_team_with_result_kept(self):
        from teams.utils import cleanup_orphan_teams
        Team.objects.create(name='CA BRAZZA', country=self.arab)
        event = Event.objects.create(name='50 M Freestyle', distance=50, stroke='Freestyle')
        champ = Championship.objects.create(name='Meet', date='2026-06-01', pool='LCM', country=self.arab)
        s = Swimmer.objects.create(name='Omar SAYED', sex='M', nationality=self.arab)
        Result.objects.create(swimmer=s, championship=champ, event=event,
                              team='CA Brazza 2', time_centiseconds=3000)
        # 'CA Brazza 2' matches team 'CA BRAZZA' via normalized key
        self.assertEqual(cleanup_orphan_teams(), 0)

    def test_curated_team_never_deleted(self):
        from teams.utils import cleanup_orphan_teams
        Team.objects.create(name='OLD CLUB', country=self.country, founded_year=1950)
        Team.objects.create(name='NAT TEAM', country=self.arab, is_national_team=True)
        self.assertEqual(cleanup_orphan_teams(), 0)
        self.assertEqual(Team.objects.count(), 2)


class BoardMemberApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from core.models import User
        cls.country = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.team = Team.objects.create(name='Al Ahly', country=cls.country)
        cls.other = Team.objects.create(name='Zamalek', country=cls.country)
        cls.admin = User.objects.create_user(username='adm', password='x', role='ADMIN')
        cls.club = User.objects.create_user(username='club', password='x', role='CLUB', team=cls.team)
        cls.viewer = User.objects.create_user(username='view', password='x', role='VIEWER')

    def test_anonymous_can_read(self):
        from teams.models import BoardMember
        BoardMember.objects.create(team=self.team, name='Mr President', role='President')
        res = self.client.get(f'/api/v1/board-members/?team={self.team.id}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

    def test_admin_can_create(self):
        self.client.force_login(self.admin)
        res = self.client.post('/api/v1/board-members/',
                               {'team': self.team.id, 'name': 'Chair', 'role': 'Chairman'})
        self.assertEqual(res.status_code, 201)

    def test_club_manages_own_team_only(self):
        self.client.force_login(self.club)
        ok = self.client.post('/api/v1/board-members/',
                              {'team': self.team.id, 'name': 'Sec', 'role': 'Secretary'})
        self.assertEqual(ok.status_code, 201)
        bad = self.client.post('/api/v1/board-members/',
                               {'team': self.other.id, 'name': 'X', 'role': 'Y'})
        self.assertEqual(bad.status_code, 403)

    def test_viewer_cannot_create(self):
        self.client.force_login(self.viewer)
        res = self.client.post('/api/v1/board-members/',
                               {'team': self.team.id, 'name': 'Nope'})
        self.assertEqual(res.status_code, 403)
