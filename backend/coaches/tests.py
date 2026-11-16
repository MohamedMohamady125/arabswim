from django.test import TestCase

# Create your tests here.


from django.test import TestCase


class FormCreateDefaultsTests(TestCase):
    """Records created from upload forms keep their club link and stay visible."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from core.models import Country
        from teams.models import Team
        u = get_user_model().objects.create_superuser('boss', 'b@example.com', 'pw')
        if hasattr(u, 'role'):
            u.role = 'ADMIN'
            u.save()
        self.api = APIClient()
        self.api.force_authenticate(u)
        self.mar = Country.objects.create(name='Morocco', code='MAR', region='ARAB')
        self.team = Team.objects.create(name='WAC', country=self.mar)

    def test_coach_added_from_a_club_page_is_linked_and_active(self):
        r = self.api.post('/api/v1/coaches/', {'name': 'Coach', 'nationality': self.mar.id, 'team': self.team.id},
                          format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['team'], self.team.id)
        self.assertTrue(r.json()['is_active'])
        self.assertEqual(self.api.get('/api/v1/coaches/', {'team': self.team.id}).json()['count'], 1)

    def test_partner_added_without_flags_is_visible(self):
        r = self.api.post('/api/v1/sponsors/', {'name': 'Partner'}, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.json()['is_active'])
