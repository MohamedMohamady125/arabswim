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


class RecordListPagingTests(_Fixture):
    """The record list is read whole by the site: page size is selectable,
    the order is stable, and a national book can be narrowed to a country."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        for i in range(30):
            Record.objects.create(
                swimmer=cls.swimmer, event=cls.e50, record_type='NATIONAL',
                pool='LCM', time_centiseconds=2500 + i, is_new=True,
                country=cls.egy if i < 4 else cls.tun, result_date='2026-01-10')

    def get(self, **params):
        from rest_framework.test import APIClient
        resp = APIClient().get('/api/v1/records/', params)
        self.assertEqual(resp.status_code, 200)
        return resp.json()

    def test_page_size_param(self):
        d = self.get(is_new='true', page_size=500)
        self.assertEqual(d['count'], 30)
        self.assertEqual(len(d['results']), 30)
        self.assertEqual(len(self.get(is_new='true')['results']), 25)

    def test_pages_do_not_overlap_when_dates_tie(self):
        a = [r['id'] for r in self.get(page_size=15)['results']]
        b = [r['id'] for r in self.get(page_size=15, page=2)['results']]
        self.assertEqual(len(set(a) | set(b)), 30)

    def test_country_filter_and_country_ordering(self):
        self.assertEqual(self.get(country=self.egy.id)['count'], 4)
        d = self.get(ordering='country__name,-result_date', page_size=500)
        names = [r['country_detail']['name'] for r in d['results']]
        self.assertEqual(names, sorted(names))


class HandEnteredRecordTests(_Fixture):
    """Records added on the New Records page (by hand or Excel) show on New
    Records and in the record books, and never inside a meet."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        self.admin = get_user_model().objects.create_superuser('boss', 'b@example.com', 'pw')
        self.client.force_login(self.admin)
        from rest_framework.test import APIClient
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.mar = Country.objects.create(name='Morocco', code='MAR', region='ARAB')
        # a meet swim on file: 50 free in 23.00
        self.res = self._result(self.e50, 2300, [])

    def _post(self, **over):
        body = {'swimmer': self.swimmer.id, 'event': self.e50.id, 'record_type': 'NATIONAL',
                'pool': 'LCM', 'time_centiseconds': 2250, 'result_date': '2026-03-01',
                'meet_name': 'Away meet', 'country': self.mar.id, 'result': self.res.id}
        body.update(over)
        return self.api.post('/api/v1/records/', body, format='json')

    def test_manual_record_takes_the_chosen_country_and_never_a_result(self):
        r = self._post()
        self.assertEqual(r.status_code, 201, r.content)
        rec = Record.objects.get(pk=r.json()['id'])
        self.assertEqual(rec.country_id, self.mar.id)   # the country picked, not the swimmer's
        self.assertEqual(rec.source, 'MANUAL')
        self.assertIsNone(rec.result_id)                # a posted result id is ignored
        self.assertFalse(Record.objects.filter(result__championship=self.champ).exists())

    def test_national_record_without_country_falls_back_to_swimmer_nationality(self):
        r = self._post(country=None)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Record.objects.get(pk=r.json()['id']).country_id, self.tun.id)

    def test_shows_in_new_records_and_the_record_book_not_in_the_meet(self):
        self._post(country=self.tun.id)
        new = self.api.get('/api/v1/records/', {'is_new': 'true'}).json()
        self.assertEqual([x['source'] for x in new['results']], ['MANUAL'])
        book = self.api.get('/api/v1/records/computed/',
                            {'scope': 'national', 'country': self.tun.id, 'pool': 'LCM'}).json()
        row = next(x for x in book if x['event_id'] == self.e50.id)
        self.assertEqual(row['time_centiseconds'], 2250)
        self.assertTrue(row['manual'])
        self.assertIsNone(row['championship_id'])
        self.assertIsNone(row['result_id'])
        # the book narrowed to that one meet still shows the meet's own swim
        meet_book = self.api.get('/api/v1/records/computed/',
                                 {'scope': 'national', 'country': self.tun.id, 'pool': 'LCM',
                                  'championship': self.champ.id}).json()
        self.assertEqual(next(x for x in meet_book if x['event_id'] == self.e50.id)['time_centiseconds'], 2300)
        # and the meet's own records list has nothing from the manual entry
        meet = self.api.get(f'/api/v1/championships/{self.champ.id}/records-broken/')
        self.assertEqual(meet.status_code, 200)
        self.assertNotIn('Away meet', meet.content.decode())

    def test_slower_manual_record_does_not_replace_a_faster_meet_swim(self):
        self._post(country=self.tun.id, time_centiseconds=2400)
        book = self.api.get('/api/v1/records/computed/',
                            {'scope': 'national', 'country': self.tun.id, 'pool': 'LCM'}).json()
        row = next(x for x in book if x['event_id'] == self.e50.id)
        self.assertEqual(row['time_centiseconds'], 2300)
        self.assertEqual(row['result_id'], self.res.id)

    def test_meet_import_never_prunes_a_hand_entered_record(self):
        self._post(country=self.tun.id, time_centiseconds=2400, result_date='2026-06-01')
        check_and_update_records(self.res)   # faster swim, earlier date
        self.assertTrue(Record.objects.filter(source='MANUAL', time_centiseconds=2400).exists())

    def test_excel_import_with_scope_and_country_chosen_in_the_dialog(self):
        import io
        from openpyxl import Workbook
        from django.core.files.uploadedfile import SimpleUploadedFile
        wb = Workbook(); ws = wb.active
        ws.append(['Swimmer', 'Event', 'Time', 'Date'])          # no Scope, no Country column
        ws.append(['Test SWIMMER', '50 M Freestyle', '22.10', '2026-04-02'])
        buf = io.BytesIO(); wb.save(buf)
        up = lambda: SimpleUploadedFile('r.xlsx', buf.getvalue())
        r = self.api.post('/api/v1/records/import-excel/', {'file': up(), 'record_type': 'NATIONAL'}, format='multipart')
        self.assertEqual(r.status_code, 400)                      # national needs a country
        r = self.api.post('/api/v1/records/import-excel/',
                          {'file': up(), 'record_type': 'NATIONAL', 'country': self.mar.id}, format='multipart')
        self.assertEqual(r.json()['created'], 1, r.content)
        rec = Record.objects.get(time_centiseconds=2210)
        self.assertEqual((rec.record_type, rec.country_id, rec.source, rec.result_id),
                         ('NATIONAL', self.mar.id, 'IMPORT', None))


class RecordCountryFollowsResultTests(_Fixture):
    """A record made before a nationality change was recorded must not stay
    in the book of a country the swim was not swum for."""

    def setUp(self):
        import datetime
        from swimmers.models import NationalityChange
        self.ksa = Country.objects.create(name='Saudi Arabia', code='KSA', region='GCC')
        # an older Tunisian record by someone else: 50 free in 23.50
        self.other = Swimmer.objects.create(name='Other TUNISIAN', sex='M', nationality=self.tun, birth_year=1998)
        old = Result.objects.create(swimmer=self.other, championship=self.champ, event=self.e50,
                                    nationality=self.tun, time_centiseconds=2350)
        check_and_update_records(old)
        # the swim: imported while the profile still said Tunisia
        self.res = self._result(self.e50, 2300, [])
        check_and_update_records(self.res)
        self.assertEqual(
            set(Record.objects.filter(swimmer=self.swimmer).values_list('record_type', 'country__code')),
            {('NATIONAL', 'TUN'), ('ARAB', 'TUN')})
        # admin records that he already swam for Saudi Arabia at that meet
        NationalityChange.objects.create(swimmer=self.swimmer, from_country=self.tun, to_country=self.ksa,
                                         effective_date=datetime.date(2026, 1, 9))
        self.swimmer.nationality = self.ksa
        self.swimmer.save(update_fields=['nationality'])

    def test_records_move_to_the_country_the_swim_was_swum_for(self):
        from swimmers.models import restamp_result_nationalities
        restamp_result_nationalities(self.swimmer)
        self.res.refresh_from_db()
        self.assertEqual(self.res.nationality_id, self.ksa.id)
        mine = set(Record.objects.filter(swimmer=self.swimmer).values_list('record_type', 'country__code'))
        self.assertEqual(mine, {('NATIONAL', 'KSA'), ('ARAB', 'KSA'), ('GCC', 'KSA')})
        # Tunisia's book goes back to its own fastest swimmer
        tun = Record.objects.filter(record_type='NATIONAL', country=self.tun, event=self.e50).order_by('time_centiseconds').first()
        self.assertEqual(tun.swimmer_id, self.other.id)
        self.assertFalse(Record.objects.filter(country=self.tun, swimmer=self.swimmer).exists())

    def test_running_it_again_changes_nothing(self):
        from records.sync import resync_swimmer_records
        from swimmers.models import restamp_result_nationalities
        restamp_result_nationalities(self.swimmer)
        before = sorted(Record.objects.values_list('id', 'country_id', 'record_type'))
        self.assertEqual(resync_swimmer_records(self.swimmer), {'relabelled': 0, 'removed': 0, 'created': 0})
        self.assertEqual(sorted(Record.objects.values_list('id', 'country_id', 'record_type')), before)

    def test_hand_entered_records_keep_their_country(self):
        from swimmers.models import restamp_result_nationalities
        manual = Record.objects.create(swimmer=self.swimmer, event=self.e100, record_type='NATIONAL', pool='LCM',
                                       time_centiseconds=5000, country=self.tun, result_date='2020-01-01',
                                       source='MANUAL')
        restamp_result_nationalities(self.swimmer)
        manual.refresh_from_db()
        self.assertEqual(manual.country_id, self.tun.id)
