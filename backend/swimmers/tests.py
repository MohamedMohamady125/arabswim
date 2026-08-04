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
