from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from news.models import Article
from teams.models import Team


class ArticleVisibilityTests(APITestCase):
    """Drafts are not public; search covers the body as well as the title."""

    def setUp(self):
        self.team = Team.objects.create(name='Test Club')
        self.other = Team.objects.create(name='Other Club')
        Article.objects.create(title='Published story', body='butterfly gold', status='PUBLISHED')
        Article.objects.create(title='Admin draft', status='DRAFT')
        Article.objects.create(title='Club draft', status='DRAFT', team=self.team)
        Article.objects.create(title='Other club draft', status='DRAFT', team=self.other)
        User = get_user_model()
        self.admin = User.objects.create_user('adm', password='x', role='ADMIN')
        self.club = User.objects.create_user('club', password='x', role='CLUB', team=self.team)

    def titles(self, url='/api/v1/news/'):
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        return sorted(a['title'] for a in res.json()['results'])

    def test_anonymous_sees_only_published(self):
        self.assertEqual(self.titles(), ['Published story'])
        self.assertEqual(self.titles('/api/v1/news/?status=DRAFT'), [])

    def test_draft_detail_hidden_from_anonymous(self):
        draft = Article.objects.get(title='Admin draft')
        self.assertEqual(self.client.get(f'/api/v1/news/{draft.id}/').status_code, 404)

    def test_admin_sees_everything(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(len(self.titles()), 4)

    def test_club_sees_published_and_own_drafts(self):
        self.client.force_authenticate(self.club)
        self.assertEqual(self.titles(), ['Club draft', 'Published story'])

    def test_search_matches_body(self):
        self.assertEqual(self.titles('/api/v1/news/?search=butterfly'), ['Published story'])
