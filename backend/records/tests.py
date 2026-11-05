from django.test import TestCase

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from records.models import Record, IntermediateTime
from records.intermediates import leading_splits_cs, sync_intermediate_times
from records.auto import check_and_update_records


class _Fixture(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        cls.e50 = Event.objects.create(name='50 M Freestyle', distance=50,
                                       stroke='Freestyle', sort_order=1)
        cls.e100 = Event.objects.create(name='100 M Freestyle', distance=100,
                                        stroke='Freestyle', sort_order=2)
        cls.e200im = Event.objects.create(name='200 M Individual Medley',
                                          distance=200,
                                          stroke='Individual Medley',
                                          sort_order=9)
        cls.swimmer = Swimmer.objects.create(
            name='Test SWIMMER', sex='M', nationality=cls.tun, birth_year=2000)
        cls.champ = Championship.objects.create(
            name='Test Meet', date='2026-01-10', pool='LCM', country=cls.tun)

    def _result(self, event, total_cs, splits):
        return Result.objects.create(
            championship=self.champ, event=event, swimmer=self.swimmer,
            nationality=self.tun, time_centiseconds=total_cs, splits=splits,
            round_type='Finals')


class LeadingSplitsTests(_Fixture):
    def test_per_lap_splits_yield_lead_in_time(self):
        # 100 free in 52.00 with laps 25.30 + 26.70: first 50 = 25.30
        r = self._result(self.e100, 5200, [
            {'distance': 50, 'time': '25.30'},
            {'distance': 100, 'time': '26.70'},
        ])
        self.assertEqual(leading_splits_cs(r), [(50, 2530)])

    def test_cumulative_splits_detected(self):
        # Same race stored cumulatively: 25.30 then 52.00
        r = self._result(self.e100, 5200, [
            {'distance': 50, 'time': '25.30'},
            {'distance': 100, 'time': '52.00'},
        ])
        self.assertEqual(leading_splits_cs(r), [(50, 2530)])

    def test_im_races_never_count(self):
        r = self._result(self.e200im, 14000, [
            {'distance': 50, 'time': '30.00'},
            {'distance': 100, 'time': '35.00'},
            {'distance': 150, 'time': '38.00'},
            {'distance': 200, 'time': '37.00'},
        ])
        self.assertEqual(leading_splits_cs(r), [])

    def test_unconfirmed_totals_rejected(self):
        # Splits that don't add up to the official time are unreliable
        r = self._result(self.e100, 5200, [
            {'distance': 50, 'time': '20.00'},
            {'distance': 100, 'time': '21.00'},
        ])
        self.assertEqual(leading_splits_cs(r), [])

    def test_sync_creates_rows_for_existing_events_only(self):
        r = self._result(self.e100, 5200, [
            {'distance': 50, 'time': '25.30'},
            {'distance': 100, 'time': '26.70'},
        ])
        rows = sync_intermediate_times(r)
        self.assertEqual(len(rows), 1)
        it = IntermediateTime.objects.get(result=r)
        self.assertEqual(it.event, self.e50)
        self.assertEqual(it.time_centiseconds, 2530)
        # Re-sync replaces, never duplicates
        sync_intermediate_times(r)
        self.assertEqual(IntermediateTime.objects.filter(result=r).count(), 1)


class SplitRecordTests(_Fixture):
    def test_first_lap_split_breaks_shorter_record(self):
        # Standing 50 free record: 25.40
        Record.objects.create(
            swimmer=self.swimmer, event=self.e50, record_type='NATIONAL',
            pool='LCM', time_centiseconds=2540, country=self.tun,
            result_date='2025-05-01')
        # 100 free whose first 50 is 25.30 — faster than the 50 record
        r = self._result(self.e100, 5200, [
            {'distance': 50, 'time': '25.30'},
            {'distance': 100, 'time': '26.70'},
        ])
        broken = check_and_update_records(r)
        self.assertIn('NATIONAL', broken)
        best50 = (Record.objects.filter(event=self.e50, record_type='NATIONAL')
                  .order_by('time_centiseconds').first())
        self.assertEqual(best50.time_centiseconds, 2530)
        self.assertEqual(best50.result, r)

    def test_slow_split_breaks_nothing(self):
        Record.objects.create(
            swimmer=self.swimmer, event=self.e50, record_type='NATIONAL',
            pool='LCM', time_centiseconds=2540, country=self.tun,
            result_date='2025-05-01')
        r = self._result(self.e100, 5600, [
            {'distance': 50, 'time': '27.00'},
            {'distance': 100, 'time': '29.00'},
        ])
        check_and_update_records(r)
        self.assertEqual(
            Record.objects.filter(event=self.e50).order_by(
                'time_centiseconds').first().time_centiseconds, 2540)
