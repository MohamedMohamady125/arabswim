"""Tests for squad-number stripping on Algerian team names."""
from django.core.management import call_command
from django.test import TestCase

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from teams.models import Team
from teams.utils import strip_squad_number


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
