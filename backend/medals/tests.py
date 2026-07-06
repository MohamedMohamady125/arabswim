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
