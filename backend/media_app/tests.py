from rest_framework.test import APITestCase

from championships.models import Championship
from media_app.models import Album


class AlbumFilterTests(APITestCase):
    def test_championship_filter(self):
        Album.objects.create(title='Loose album')
        fields = {f.name for f in Championship._meta.get_fields()}
        kwargs = {'name': 'Test Meet'}
        if 'date' in fields:
            kwargs['date'] = '2026-01-01'
        champ = Championship.objects.create(**kwargs)
        Album.objects.create(title='Meet album', championship=champ)
        res = self.client.get(f'/api/v1/media/albums/?championship={champ.id}')
        self.assertEqual([a['title'] for a in res.json()], ['Meet album'])
        self.assertEqual(len(self.client.get('/api/v1/media/albums/').json()), 2)
        # a malformed value is ignored instead of crashing
        self.assertEqual(self.client.get('/api/v1/media/albums/?championship=abc').status_code, 200)
