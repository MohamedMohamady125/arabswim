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
