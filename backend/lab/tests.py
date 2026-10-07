"""Tests for the ArabSwim Lab engine and endpoints.

The fixture builds a small but realistic field for one event (100 Free) plus
a second event (100 Back) so DNA/depth/1%-club have something to chew on. All
swims are LCM, ranked (is_hc=False, time > 0), and swimmers are Arab-region so
nothing is filtered out by the RankingView-style rules the engine inherits.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from lab import engine


class LabTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        cls.ksa = Country.objects.create(name='Saudi Arabia', code='KSA', region='GCC')
        cls.other = Country.objects.create(name='France', code='FRA', region='OTHER')

        cls.free = Event.objects.create(name='100 M Freestyle', distance=100,
                                        stroke='Freestyle', is_relay=False)
        cls.back = Event.objects.create(name='100 M Backstroke', distance=100,
                                        stroke='Backstroke', is_relay=False)

        cls.m2025 = Championship.objects.create(name='Nationals 2025',
                                                date='2025-06-01', pool='LCM',
                                                country=cls.tun)
        cls.m2026 = Championship.objects.create(name='Nationals 2026',
                                                date='2026-06-01', pool='LCM',
                                                country=cls.tun)

    def _swimmer(self, name, country=None, sex='M'):
        return Swimmer.objects.create(name=name, sex=sex,
                                      nationality=country or self.tun)

    def _result(self, swimmer, event, time_cs, champ=None, round_type='Finals',
                fina=None):
        return Result.objects.create(
            swimmer=swimmer, championship=champ or self.m2026, event=event,
            round_type=round_type, time_centiseconds=time_cs, fina_points=fina)


class EngineTests(LabTestBase):
    def setUp(self):
        self.a = self._swimmer('Alpha A')     # 50.00 fastest
        self.b = self._swimmer('Bravo B')     # 51.00
        self.c = self._swimmer('Charlie C')   # 52.00
        self._result(self.a, self.free, 5000)
        self._result(self.b, self.free, 5100)
        self._result(self.c, self.free, 5200)
        # OTHER region + HC swims must never enter the field.
        self._result(self._swimmer('Zed Z', self.other), self.free, 4000)
        hc = self._swimmer('Hc Swimmer')
        Result.objects.create(swimmer=hc, championship=self.m2026,
                              event=self.free, time_centiseconds=4500, is_hc=True)

    def test_best_rows_orders_and_excludes(self):
        rows = engine.best_rows(self.free.id)
        self.assertEqual([r['best_time'] for r in rows], [5000, 5100, 5200])

    def test_best_rows_keeps_min_per_swimmer(self):
        self._result(self.a, self.free, 4950, champ=self.m2025)  # faster earlier
        rows = engine.best_rows(self.free.id)
        self.assertEqual(rows[0]['swimmer_id'], self.a.id)
        self.assertEqual(rows[0]['best_time'], 4950)
        self.assertEqual(len(rows), 3)  # still one row per swimmer

    def test_rank_for_time(self):
        rank, field = engine.rank_for_time(self.free.id, 5100)
        self.assertEqual((rank, field), (2, 3))
        rank, _ = engine.rank_for_time(self.free.id, 4900)  # would be fastest
        self.assertEqual(rank, 1)

    def test_percentile(self):
        # Fastest time beats/equals the whole field.
        self.assertEqual(engine.percentile(self.free.id, 5000), 100.0)
        # Slowest is faster-or-equal to only itself (1/3).
        self.assertEqual(engine.percentile(self.free.id, 5200), 33.3)

    def test_up_to_date_filter(self):
        self._result(self._swimmer('Delta D'), self.free, 4000, champ=self.m2025)
        rank, _ = engine.rank_for_time(self.free.id, 5000)
        self.assertEqual(rank, 2)  # the 4000 swim is faster


class EndpointTests(LabTestBase):
    def setUp(self):
        self.client = APIClient()
        self.a = self._swimmer('Alpha A')
        self.b = self._swimmer('Bravo B')
        self.c = self._swimmer('Charlie C')
        # Free field: a < b < c
        self.ra = self._result(self.a, self.free, 5000, fina=800)
        self._result(self.b, self.free, 5100, fina=760)
        self._result(self.c, self.free, 5200, fina=720)
        # Back field: a is weaker (slowest), b strongest
        self._result(self.a, self.back, 6200, fina=600)
        self._result(self.b, self.back, 6000, fina=650)

    def test_dna(self):
        r = self.client.get(f'/api/v1/lab/swimmer/{self.a.id}/dna/')
        self.assertEqual(r.status_code, 200)
        axes = {a['stroke']: a for a in r.data['axes']}
        self.assertEqual(len(r.data['axes']), 5)
        # Alpha is fastest in Free -> top percentile on the Freestyle axis.
        self.assertEqual(axes['Freestyle']['percentile'], 100.0)
        # No breaststroke swim -> empty axis at 0.
        self.assertEqual(axes['Breaststroke']['percentile'], 0)

    def test_chase(self):
        r = self.client.get(f'/api/v1/lab/swimmer/{self.b.id}/chase/'
                            f'?event={self.free.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['my_rank'], 2)
        # One faster swimmer ahead (alpha), one slower behind (charlie).
        self.assertEqual(len(r.data['next_targets']), 1)
        self.assertEqual(r.data['next_targets'][0]['swimmer_id'], self.a.id)
        self.assertEqual(len(r.data['chasing_you']), 1)
        self.assertEqual(r.data['chasing_you'][0]['swimmer_id'], self.c.id)
        # Unlock: rank 1 is reachable, drop = 1.00s = 100cs.
        self.assertEqual(r.data['unlock_history'][0]['rank'], 1)
        self.assertEqual(r.data['unlock_history'][0]['drop_centiseconds'], 100)

    def test_whatif(self):
        r = self.client.get(f'/api/v1/lab/whatif/?event={self.free.id}'
                            f'&time_centiseconds=4900&swimmer={self.c.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['projected_rank'], 1)
        self.assertEqual(r.data['current_rank'], 3)
        self.assertEqual(r.data['places_gained'], 2)

    def test_whatif_requires_params(self):
        self.assertEqual(self.client.get('/api/v1/lab/whatif/').status_code, 400)

    def test_xray(self):
        r = self.client.get(f'/api/v1/lab/result/{self.ra.id}/xray/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['rank_now'], 1)
        self.assertTrue(r.data['is_personal_best'])
        self.assertEqual(r.data['percentile'], 100.0)

    def test_rivals(self):
        r = self.client.get(f'/api/v1/lab/swimmer/{self.a.id}/rivals/')
        self.assertEqual(r.status_code, 200)
        rivals = {x['swimmer_id']: x for x in r.data['rivals']}
        # Alpha met Bravo in the 100 Free final (won) and 100 Back final
        # (lost) — head-to-head spans every shared race.
        self.assertEqual(rivals[self.b.id]['meetings'], 2)
        self.assertEqual(rivals[self.b.id]['wins'], 1)
        self.assertEqual(rivals[self.b.id]['losses'], 1)
        # Charlie only raced Alpha in the free, and lost.
        self.assertEqual(rivals[self.c.id]['wins'], 1)
        self.assertEqual(rivals[self.c.id]['losses'], 0)

    def test_consistency(self):
        # Two prelim/final pairs for a clean finals effect.
        self._result(self.a, self.free, 5050, round_type='Heats')
        r = self.client.get(f'/api/v1/lab/swimmer/{self.a.id}/consistency/'
                            f'?event={self.free.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['swim_count'], 2)
        self.assertIsNotNone(r.data['consistency_index'])
        # Final (5000) faster than heat (5050) -> positive finals effect.
        self.assertGreater(r.data['finals_effect_pct'], 0)

    def test_one_percent_club(self):
        r = self.client.get(f'/api/v1/lab/one-percent-club/?event={self.free.id}')
        self.assertEqual(r.status_code, 200)
        # Leader 5000; +1% = 5050. Only alpha (5000) qualifies; bravo 5100 out.
        ids = [m['swimmer_id'] for m in r.data['members']]
        self.assertIn(self.a.id, ids)
        self.assertNotIn(self.b.id, ids)

    def test_depth_ranking(self):
        # Give Egypt a couple of swimmers to compete on depth.
        e1 = self._swimmer('Egy One', self.egy)
        e2 = self._swimmer('Egy Two', self.egy)
        self._result(e1, self.free, 4950)
        self._result(e2, self.free, 4970)
        r = self.client.get(f'/api/v1/lab/depth-ranking/?event={self.free.id}')
        self.assertEqual(r.status_code, 200)
        codes = [c['country_code'] for c in r.data['countries']]
        self.assertIn('TUN', codes)
        self.assertIn('EGY', codes)
