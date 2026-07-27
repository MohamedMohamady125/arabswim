"""Tests for Olympic tie-rule medal awarding (medals.utils.recompute_medals)."""
from django.test import TestCase

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from medals.models import Medal
from medals.utils import recompute_medals


class RecomputeMedalsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.country = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.event = Event.objects.create(name='100 M Freestyle', distance=100,
                                         stroke='Freestyle', is_relay=False)
        cls.champ = Championship.objects.create(
            name='Test Meet', date='2026-06-01', pool='LCM', country=cls.country)

    def _swimmer(self, name, sex='M'):
        return Swimmer.objects.create(name=name, sex=sex, nationality=self.country)

    def _result(self, swimmer, time_cs, round_type='Finals', category='', event=None):
        return Result.objects.create(
            swimmer=swimmer, championship=self.champ, event=event or self.event,
            round_type=round_type, category=category, time_centiseconds=time_cs)

    def _medals(self):
        return {(m.swimmer.name, m.medal_type)
                for m in Medal.objects.filter(championship=self.champ)}

    def test_no_ties_normal_medals(self):
        for name, t in [('A', 5000), ('B', 5100), ('C', 5200), ('D', 5300)]:
            self._result(self._swimmer(name), t)
        recompute_medals(self.champ)
        self.assertEqual(self._medals(),
                         {('A', 'GOLD'), ('B', 'SILVER'), ('C', 'BRONZE')})

    def test_tie_for_gold_two_golds_no_silver(self):
        for name, t in [('A', 5000), ('B', 5000), ('C', 5100), ('D', 5200)]:
            self._result(self._swimmer(name), t)
        recompute_medals(self.champ)
        self.assertEqual(self._medals(),
                         {('A', 'GOLD'), ('B', 'GOLD'), ('C', 'BRONZE')})

    def test_tie_for_silver_no_bronze(self):
        for name, t in [('A', 5000), ('B', 5100), ('C', 5100), ('D', 5200)]:
            self._result(self._swimmer(name), t)
        recompute_medals(self.champ)
        self.assertEqual(self._medals(),
                         {('A', 'GOLD'), ('B', 'SILVER'), ('C', 'SILVER')})

    def test_tie_for_bronze_two_bronzes(self):
        for name, t in [('A', 5000), ('B', 5100), ('C', 5200), ('D', 5200)]:
            self._result(self._swimmer(name), t)
        recompute_medals(self.champ)
        self.assertEqual(self._medals(),
                         {('A', 'GOLD'), ('B', 'SILVER'),
                          ('C', 'BRONZE'), ('D', 'BRONZE')})

    def test_three_way_tie_for_gold(self):
        for name, t in [('A', 5000), ('B', 5000), ('C', 5000), ('D', 5100)]:
            self._result(self._swimmer(name), t)
        recompute_medals(self.champ)
        self.assertEqual(self._medals(),
                         {('A', 'GOLD'), ('B', 'GOLD'), ('C', 'GOLD')})

    def test_source_rank_beats_recomputed_rank(self):
        # International meet: non-Arab results were deleted, the remaining
        # Arab swimmers keep their original PDF placements.
        r1 = self._result(self._swimmer('A'), 5000)   # placed 5th at the meet
        r2 = self._result(self._swimmer('B'), 5100)   # placed 8th
        r1.original_rank, r2.original_rank = 5, 8
        r1.save(); r2.save()
        recompute_medals(self.champ)
        self.assertEqual(self._medals(), set())

    def test_source_rank_awards_real_podium(self):
        r1 = self._result(self._swimmer('A'), 5000)
        r2 = self._result(self._swimmer('B'), 5100)
        r3 = self._result(self._swimmer('C'), 5200)
        r1.original_rank, r2.original_rank, r3.original_rank = 2, 3, 6
        r1.save(); r2.save(); r3.save()
        recompute_medals(self.champ)
        self.assertEqual(self._medals(), {('A', 'SILVER'), ('B', 'BRONZE')})

    def test_rows_without_source_rank_get_nothing_when_group_has_ranks(self):
        r1 = self._result(self._swimmer('A'), 5000)
        r1.original_rank = 4
        r1.save()
        self._result(self._swimmer('B'), 5100)  # no source rank
        recompute_medals(self.champ)
        self.assertEqual(self._medals(), set())

    def test_finals_decide_when_prelims_present(self):
        a, b = self._swimmer('A'), self._swimmer('B')
        self._result(a, 4900, round_type='Prelims')
        self._result(b, 4950, round_type='Prelims')
        self._result(a, 5100, round_type='Finals')
        self._result(b, 5000, round_type='Finals')
        recompute_medals(self.champ)
        self.assertEqual(self._medals(), {('B', 'GOLD'), ('A', 'SILVER')})

    def test_single_round_meet_awards_medals(self):
        self._result(self._swimmer('A'), 5000, round_type='')
        self._result(self._swimmer('B'), 5100, round_type='')
        recompute_medals(self.champ)
        self.assertEqual(self._medals(), {('A', 'GOLD'), ('B', 'SILVER')})

    def test_genders_ranked_separately(self):
        self._result(self._swimmer('M1', 'M'), 5000)
        self._result(self._swimmer('F1', 'F'), 5500)
        recompute_medals(self.champ)
        self.assertEqual(self._medals(), {('M1', 'GOLD'), ('F1', 'GOLD')})

    def test_categories_ranked_separately(self):
        self._result(self._swimmer('A'), 5000, category='Cadets')
        self._result(self._swimmer('B'), 5500, category='Juniors')
        recompute_medals(self.champ)
        self.assertEqual(self._medals(), {('A', 'GOLD'), ('B', 'GOLD')})

    def test_manual_medals_preserved(self):
        manual = Medal.objects.create(
            swimmer=self._swimmer('Legend'), championship=self.champ,
            event=self.event, medal_type='GOLD', result=None)
        self._result(self._swimmer('A'), 5000)
        recompute_medals(self.champ)
        recompute_medals(self.champ)  # idempotent
        self.assertTrue(Medal.objects.filter(pk=manual.pk).exists())
        self.assertEqual(
            Medal.objects.filter(championship=self.champ).count(), 2)

    def test_idempotent(self):
        self._result(self._swimmer('A'), 5000)
        recompute_medals(self.champ)
        recompute_medals(self.champ)
        self.assertEqual(Medal.objects.filter(championship=self.champ).count(), 1)


class RelayMedalTests(TestCase):
    """Relay medals: one per athlete on the squad plus the placeholder row."""

    @classmethod
    def setUpTestData(cls):
        cls.country = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.relay_event = Event.objects.create(
            name='4x100 M Freestyle Relay', distance=400,
            stroke='Freestyle Relay', is_relay=True)
        cls.champ = Championship.objects.create(
            name='Relay Meet', date='2026-06-01', pool='LCM', country=cls.country)

    def _relay_result(self, team_name, time_cs, leg_names):
        placeholder = Swimmer.objects.create(
            name=team_name, sex='M', nationality=self.country, is_relay_team=True)
        return Result.objects.create(
            swimmer=placeholder, championship=self.champ, event=self.relay_event,
            round_type='Finals', time_centiseconds=time_cs,
            relay_swimmers=[{'name': n, 'split_time': ''} for n in leg_names])

    def test_each_relay_athlete_gets_a_medal(self):
        names = ['Ali TAMER', 'Omar SAYED', 'Ziad KAMAL', 'Hassan NOUR']
        for n in names:
            Swimmer.objects.create(name=n, sex='M', nationality=self.country)
        self._relay_result('Egypt Relay', 20000, names)
        recompute_medals(self.champ)
        golds = Medal.objects.filter(championship=self.champ, medal_type='GOLD')
        self.assertEqual(golds.count(), 5)  # placeholder + 4 athletes
        self.assertEqual(
            golds.filter(swimmer__is_relay_team=False).count(), 4)

    def test_unmatched_leg_names_are_skipped(self):
        Swimmer.objects.create(name='Ali TAMER', sex='M', nationality=self.country)
        self._relay_result('Egypt Relay', 20000, ['Ali TAMER', 'Unknown GUY'])
        recompute_medals(self.champ)
        self.assertEqual(
            Medal.objects.filter(championship=self.champ).count(), 2)

    def test_relay_medals_idempotent(self):
        Swimmer.objects.create(name='Ali TAMER', sex='M', nationality=self.country)
        self._relay_result('Egypt Relay', 20000, ['Ali TAMER'])
        recompute_medals(self.champ)
        recompute_medals(self.champ)
        self.assertEqual(
            Medal.objects.filter(championship=self.champ).count(), 2)

    def test_summary_counts_athletes_not_placeholder(self):
        names = ['Ali TAMER', 'Omar SAYED']
        for n in names:
            Swimmer.objects.create(name=n, sex='M', nationality=self.country)
        self._relay_result('Egypt Relay', 20000, names)
        recompute_medals(self.champ)
        res = self.client.get(f'/api/v1/medals/summary/?championship={self.champ.id}')
        self.assertEqual(res.status_code, 200)
        row = next(r for r in res.json()
                   if r['swimmer__nationality__code'] == 'EGY')
        self.assertEqual(row['gold'], 2)  # athletes only, placeholder excluded
