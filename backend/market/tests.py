from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from market.models import Listing


class ListingVisibilityTests(APITestCase):
    """Only approved listings are public; admins moderate the rest."""

    def setUp(self):
        for status in ('PENDING', 'APPROVED', 'REJECTED', 'SOLD'):
            Listing.objects.create(title=f'{status} suit', status=status, seller_contact='seller@example.com')
        self.admin = get_user_model().objects.create_user('adm', password='x', role='ADMIN')

    def test_anonymous_sees_only_approved(self):
        res = self.client.get('/api/v1/market/listings/')
        self.assertEqual([l['title'] for l in res.json()['results']], ['APPROVED suit'])
        self.assertEqual(self.client.get('/api/v1/market/listings/?status=PENDING').json()['count'], 0)

    def test_admin_sees_all_and_can_filter(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/v1/market/listings/').json()['count'], 4)
        self.assertEqual(self.client.get('/api/v1/market/listings/?status=PENDING').json()['count'], 1)
