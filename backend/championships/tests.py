"""Tests for TC-file category inference (championships.categories).

Mirrors the real-world case that motivated the feature: a Tunisian national
meet where most events are categorized (Minimes/Cadets/Seniors...) but a few
events come from a "toutes catégories" file — no category, and a single
merged 1..N ranking across all age groups.
"""
from django.test import TestCase

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Classification, Result
from championships.categories import infer_blank_categories
from medals.models import Medal
from medals.utils import recompute_medals


class TCMeetTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.country = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.national = Classification.objects.create(name='National')
        cls.fly = Event.objects.create(name='50 M Butterfly', distance=50,
                                       stroke='Butterfly', is_relay=False)
        cls.free = Event.objects.create(name='50 M Freestyle', distance=50,
                                        stroke='Freestyle', is_relay=False)
        cls.champ = Championship.objects.create(
            name='Championnat National', date='2026-07-27', pool='LCM',
            country=cls.country, classification=cls.national)

    def _swimmer(self, name, sex='F'):
        return Swimmer.objects.create(name=name, sex=sex, nationality=self.country)

    def _result(self, swimmer, event, time_cs, category='', round_type='Finals',
                rank=None, age=None):
        return Result.objects.create(
            swimmer=swimmer, championship=self.champ, event=event,
            round_type=round_type, category=category, time_centiseconds=time_cs,
            original_rank=rank, age_at_competition=age)

    def _tc_meet(self):
        """Categorized 50 fly + TC 50 free with a merged 1..6 Finale A.

        Free final by time: senior1, minime1, senior2, cadet1, minime2, cadet2
        — so per-category podiums differ from the merged top 3.
        """
        self.sr1, self.sr2 = self._swimmer('SR One'), self._swimmer('SR Two')
        self.cd1, self.cd2 = self._swimmer('CD One'), self._swimmer('CD Two')
        self.mn1, self.mn2 = self._swimmer('MN One'), self._swimmer('MN Two')
        # Categorized event: establishes swimmer→category for most swimmers
        # and the meet's (sex, age)→category map.
        for sw, cat, t, rk, age in [
                (self.sr1, 'Seniors/Juniors', 2900, 1, 19),
                (self.cd1, 'Cadets', 3000, 1, 16),
                (self.cd2, 'Cadets', 3050, 2, 16),
                (self.mn1, 'Minimes', 3100, 1, 14)]:
            self._result(sw, self.fly, t, category=cat, rank=rk, age=age)
        # TC event: blank categories, merged open ranking 1..6.
        for sw, t, rk, age in [
                (self.sr1, 2700, 1, 19), (self.mn1, 2750, 2, 14),
                (self.sr2, 2800, 3, 19), (self.cd1, 2850, 4, 16),
                (self.mn2, 2900, 5, 14), (self.cd2, 2950, 6, 16)]:
            self._result(sw, self.free, t, rank=rk, age=age)

class InferBlankCategoriesTests(TCMeetTestCase):
    def test_categories_inferred_from_own_swims_and_age_map(self):
        self._tc_meet()
        updated = infer_blank_categories(self.champ)
        self.assertEqual(updated, 6)
        cats = {r.swimmer.name: r.category
                for r in Result.objects.filter(event=self.free)}
        self.assertEqual(cats, {
            'SR One': 'Seniors/Juniors',   # own categorized swim
            'CD One': 'Cadets', 'CD Two': 'Cadets',
            'MN One': 'Minimes',
            'SR Two': 'Seniors/Juniors',   # age-map fallback (19 → S/J)
            'MN Two': 'Minimes',           # age-map fallback (14 → Minimes)
        })

    def test_merged_open_ranks_become_per_category_ranks(self):
        self._tc_meet()
        infer_blank_categories(self.champ)
        ranks = {r.swimmer.name: r.original_rank
                 for r in Result.objects.filter(event=self.free)}
        self.assertEqual(ranks, {
            'SR One': 1, 'SR Two': 2,   # was 1, 3
            'MN One': 1, 'MN Two': 2,   # was 2, 5
            'CD One': 1, 'CD Two': 2,   # was 4, 6
        })

    def test_every_category_gets_its_own_podium(self):
        self._tc_meet()
        infer_blank_categories(self.champ)
        recompute_medals(self.champ)
        free_golds = {m.swimmer.name
                      for m in Medal.objects.filter(championship=self.champ,
                                                    result__event=self.free,
                                                    medal_type='GOLD')}
        self.assertEqual(free_golds, {'SR One', 'MN One', 'CD One'})

    def test_ambiguous_age_is_never_guessed(self):
        self._tc_meet()
        # Same age appears in two categories elsewhere in the meet → the age
        # map must refuse to categorize an unknown 16-year-old.
        self._result(self._swimmer('Edge Girl'), self.fly, 3200,
                     category='Minimes', rank=2, age=16)
        stray = self._result(self._swimmer('Unknown'), self.free, 3000,
                             rank=7, age=16)
        infer_blank_categories(self.champ)
        stray.refresh_from_db()
        self.assertEqual(stray.category, '')

    def test_untouched_on_international_meets(self):
        self.champ.classification = Classification.objects.create(name='International')
        self.champ.save()
        self._tc_meet()
        self.assertEqual(infer_blank_categories(self.champ), 0)
        self.assertEqual(
            Result.objects.filter(event=self.free).exclude(category='').count(), 0)

    def test_noop_when_meet_has_no_categorized_results(self):
        sw = self._swimmer('Solo')
        self._result(sw, self.free, 2700, rank=1, age=19)
        self.assertEqual(infer_blank_categories(self.champ), 0)

    def test_relay_placeholders_are_ignored(self):
        self._tc_meet()
        relay = Event.objects.create(name='4x100 M Freestyle Relay', distance=400,
                                     stroke='Freestyle', is_relay=True)
        club = Swimmer.objects.create(name='EST', sex='F', nationality=self.country,
                                      is_relay_team=True)
        r = self._result(club, relay, 24000, rank=1)
        infer_blank_categories(self.champ)
        r.refresh_from_db()
        self.assertEqual(r.category, '')

    def test_idempotent(self):
        self._tc_meet()
        self.assertEqual(infer_blank_categories(self.champ), 6)
        self.assertEqual(infer_blank_categories(self.champ), 0)

    def test_tc_signature_sets_open_podium_flag(self):
        self._tc_meet()
        self.assertFalse(self.champ.has_open_podium)
        infer_blank_categories(self.champ)
        self.champ.refresh_from_db()
        self.assertTrue(self.champ.has_open_podium)


class OpenPodiumTests(TCMeetTestCase):
    """TC meets award an open podium per event on top of category podiums,
    so the same swim can earn two medals (e.g. category gold + open gold)."""

    def _medals(self, event, scope):
        return {(m.swimmer.name, m.medal_type)
                for m in Medal.objects.filter(championship=self.champ,
                                              result__event=event, scope=scope)}

    def test_open_podium_awarded_across_categories(self):
        self._tc_meet()
        infer_blank_categories(self.champ)
        recompute_medals(self.champ)
        # Open podium = top 3 by time across all categories.
        self.assertEqual(self._medals(self.free, 'OPEN'), {
            ('SR One', 'GOLD'), ('MN One', 'SILVER'), ('SR Two', 'BRONZE')})
        self.assertEqual(self._medals(self.fly, 'OPEN'), {
            ('SR One', 'GOLD'), ('CD One', 'SILVER'), ('CD Two', 'BRONZE')})
        # Category podiums are untouched — SR One holds both golds in free.
        self.assertIn(('SR One', 'GOLD'), self._medals(self.free, 'CATEGORY'))
        self.assertEqual(
            Medal.objects.filter(championship=self.champ, swimmer=self.sr1,
                                 result__event=self.free,
                                 medal_type='GOLD').count(), 2)

    def test_no_open_podium_without_flag(self):
        # A plain categorized national meet (no TC file) keeps single podiums.
        self._tc_meet()
        for r in Result.objects.filter(event=self.free):
            r.category = 'Seniors/Juniors'
            r.save(update_fields=['category'])
        recompute_medals(self.champ)
        self.assertFalse(
            Medal.objects.filter(championship=self.champ, scope='OPEN').exists())

    def test_heats_only_category_with_merged_ranks_gets_reranked(self):
        # Real-world Benjamins case: rows created from the TC file first, then
        # categorized by the dedupe when the per-category file merged in.
        # No blanks remain, but the small category swam Séries only and kept
        # merged open ranks (32, 38...) — its Séries classement IS its podium.
        self._tc_meet()
        infer_blank_categories(self.champ)  # sets has_open_podium
        bj1, bj2 = self._swimmer('BJ One'), self._swimmer('BJ Two')
        r1 = self._result(bj1, self.free, 3400, category='Benjamins',
                          round_type='Heats', rank=32, age=11)
        r2 = self._result(bj2, self.free, 3500, category='Benjamins',
                          round_type='Heats', rank=38, age=11)
        # Prelims below a final must keep their rank untouched.
        pre = self._result(self.sr2, self.free, 2810, category='Seniors/Juniors',
                           round_type='Heats', rank=3, age=19)
        self.assertEqual(infer_blank_categories(self.champ), 0)
        r1.refresh_from_db(); r2.refresh_from_db(); pre.refresh_from_db()
        self.assertEqual((r1.original_rank, r2.original_rank), (1, 2))
        self.assertEqual(pre.original_rank, 3)
        recompute_medals(self.champ)
        cat_medals = self._medals(self.free, 'CATEGORY')
        self.assertIn(('BJ One', 'GOLD'), cat_medals)
        self.assertIn(('BJ Two', 'SILVER'), cat_medals)

    def test_relay_legs_get_open_medals_too(self):
        self._tc_meet()
        infer_blank_categories(self.champ)
        relay = Event.objects.create(name='4x50 M Freestyle Relay', distance=200,
                                     stroke='Freestyle', is_relay=True)
        club_a = Swimmer.objects.create(name='ASCNS', sex='F', is_relay_team=True,
                                        nationality=self.country)
        club_b = Swimmer.objects.create(name='EST', sex='F', is_relay_team=True,
                                        nationality=self.country)
        # Two category podiums (each squad wins its category)...
        Result.objects.create(
            swimmer=club_a, championship=self.champ, event=relay,
            round_type='Finals', category='Seniors/Juniors',
            time_centiseconds=11000, original_rank=1,
            relay_swimmers=[{'name': 'SR One'}])
        Result.objects.create(
            swimmer=club_b, championship=self.champ, event=relay,
            round_type='Finals', category='Cadets',
            time_centiseconds=11500, original_rank=1,
            relay_swimmers=[{'name': 'CD One'}])
        recompute_medals(self.champ)
        # ...plus one open podium across categories, by time.
        open_medals = {(m.swimmer.name, m.medal_type)
                       for m in Medal.objects.filter(
                           championship=self.champ, result__event=relay,
                           scope='OPEN')}
        self.assertEqual(open_medals, {
            ('ASCNS', 'GOLD'), ('SR One', 'GOLD'),
            ('EST', 'SILVER'), ('CD One', 'SILVER')})
