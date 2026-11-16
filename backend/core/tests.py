from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Championship, Result
from medals.models import Medal
from records.models import Record
from teams.models import Team


class CountryProfileTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('admin', password='x')
        cls.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        other = Country.objects.create(name='Qatar', code='QAT', region='GCC')
        free50 = Event.objects.create(name='50m Freestyle', distance=50,
                                      stroke='Freestyle', sort_order=1)
        relay = Event.objects.create(name='4x100m Freestyle Relay', distance=400,
                                     stroke='Freestyle Relay', is_relay=True,
                                     sort_order=90)
        champ = Championship.objects.create(
            name='Arab Cup', date=date(2026, 5, 1), pool='LCM', country=cls.egy,
            location='Cairo')
        omar = Swimmer.objects.create(name='Omar Kamal', nationality=cls.egy,
                                      sex='M', birth_year=2005)
        nada = Swimmer.objects.create(name='Nada Fawzy', nationality=cls.egy,
                                      sex='F', birth_year=2007)
        foreign = Swimmer.objects.create(name='Ali Qatari', nationality=other,
                                         sex='M', birth_year=2004)
        r1 = Result.objects.create(swimmer=omar, championship=champ, event=free50,
                                   round_type='Finals', time_centiseconds=2350,
                                   fina_points=700)
        Result.objects.create(swimmer=omar, championship=champ, event=free50,
                              round_type='Prelims', time_centiseconds=2400,
                              fina_points=650)
        Result.objects.create(swimmer=nada, championship=champ, event=free50,
                              round_type='Finals', time_centiseconds=2600,
                              fina_points=680)
        Result.objects.create(swimmer=foreign, championship=champ, event=free50,
                              round_type='Finals', time_centiseconds=2300,
                              fina_points=720)
        # relay result should not appear in individual best times
        Result.objects.create(swimmer=omar, championship=champ, event=relay,
                              round_type='Finals', time_centiseconds=21000)
        Medal.objects.create(swimmer=omar, championship=champ, event=free50,
                             medal_type='GOLD', result=r1)
        Medal.objects.create(swimmer=nada, championship=champ, event=free50,
                             medal_type='SILVER')
        Record.objects.create(swimmer=omar, event=free50, record_type='NATIONAL',
                              time_centiseconds=2350, result_date=date(2026, 5, 1),
                              location='Cairo')
        Team.objects.create(name='Egypt National Team', country=cls.egy,
                            is_national_team=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def get_profile(self):
        resp = self.client.get(f'/api/v1/countries/{self.egy.id}/profile/')
        self.assertEqual(resp.status_code, 200)
        return resp.json()

    def test_lite_matches_full_participation_counts(self):
        # ?lite=1 drops the per-championship athlete lists but keeps the counts
        full = self.get_profile()['championships_participated']
        resp = self.client.get(f'/api/v1/countries/{self.egy.id}/profile/?lite=1')
        self.assertEqual(resp.status_code, 200)
        lite = resp.json()['championships_participated']
        self.assertEqual(len(lite), len(full))
        for a, b in zip(lite, full):
            self.assertNotIn('swimmers', a)
            for k in ('id', 'name', 'results_count', 'swimmers_count', 'medals', 'classification'):
                self.assertEqual(a[k], b[k])

    def test_stats(self):
        d = self.get_profile()
        self.assertEqual(d['country']['code'], 'EGY')
        self.assertEqual(d['stats']['swimmers'], 2)
        self.assertEqual(d['stats']['swimmers_male'], 1)
        self.assertEqual(d['stats']['swimmers_female'], 1)
        self.assertEqual(d['stats']['results'], 4)  # foreign swimmer excluded
        self.assertEqual(d['stats']['championships_hosted'], 1)
        self.assertEqual(d['stats']['teams'], 1)
        self.assertEqual(d['stats']['records'], 1)
        self.assertEqual(d['medals'], {'gold': 1, 'silver': 1, 'bronze': 0,
                                       'total': 2})

    def test_top_swimmers_best_swim_each(self):
        d = self.get_profile()
        self.assertEqual([s['name'] for s in d['top_swimmers']],
                         ['Omar Kamal', 'Nada Fawzy'])
        omar = d['top_swimmers'][0]
        self.assertEqual(omar['best_fina'], 700)
        self.assertEqual(omar['best_time'], '23.50')
        self.assertEqual(omar['best_event'], '50m Freestyle')

    def test_best_times_per_event_sex_pool(self):
        d = self.get_profile()
        self.assertEqual(len(d['best_times']), 2)  # M + F, relay excluded
        by_sex = {b['sex']: b for b in d['best_times']}
        self.assertEqual(by_sex['M']['time'], '23.50')  # finals, not prelims
        self.assertEqual(by_sex['M']['swimmer'], 'Omar Kamal')
        self.assertEqual(by_sex['F']['time'], '26.00')
        self.assertEqual(by_sex['M']['pool'], 'LCM')

    def test_records_and_lists(self):
        d = self.get_profile()
        self.assertEqual(len(d['records']), 1)
        self.assertEqual(d['records'][0]['record_type'], 'NATIONAL')
        self.assertEqual(d['records'][0]['time'], '23.50')
        self.assertEqual(len(d['championships_hosted']), 1)
        self.assertEqual(d['championships_hosted'][0]['name'], 'Arab Cup')
        self.assertEqual(len(d['teams']), 1)
        self.assertTrue(d['teams'][0]['is_national_team'])
        self.assertEqual(d['top_medalists'][0]['name'], 'Omar Kamal')
        self.assertEqual(d['top_medalists'][0]['gold'], 1)

    def test_season_best_ignores_old_seasons(self):
        # A HIGHER-FINA swim from an old season must never headline the
        # "Best Season Performance" card — only the latest active season.
        free50 = Event.objects.get(name='50m Freestyle')
        old_champ = Championship.objects.create(
            name='2023 Tyr Pro Series', date=date(2023, 6, 1), pool='LCM',
            country=self.egy, location='Fort Lauderdale')
        veteran = Swimmer.objects.create(name='Old Star', nationality=self.egy,
                                         sex='M', birth_year=1999)
        Result.objects.create(swimmer=veteran, championship=old_champ,
                              event=free50, round_type='Finals',
                              time_centiseconds=2200, fina_points=900)
        d = self.get_profile()
        sb = d['season_best']
        self.assertEqual(sb['name'], 'Omar Kamal')      # 2026 swim wins
        self.assertEqual(sb['best_fina'], 700)
        self.assertEqual(sb['season'], 2026)
        self.assertEqual(sb['championship'], 'Arab Cup')


class CountryListOrderingTests(TestCase):
    """Nationality lists/dropdowns always lead with Arab nations (incl. GCC),
    each block alphabetical."""

    @classmethod
    def setUpTestData(cls):
        Country.objects.create(name='Albania', code='ALB', region='OTHER')
        Country.objects.create(name='Qatar', code='QAT', region='GCC')
        Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        Country.objects.create(name='France', code='FRA', region='OTHER')

    def test_arab_and_gcc_first_then_alphabetical(self):
        resp = APIClient().get('/api/v1/countries/')
        # migrations seed extra countries — assert relative order of ours
        ours = [c['name'] for c in resp.data
                if c['name'] in ('Egypt', 'Qatar', 'Albania', 'France')]
        self.assertEqual(ours, ['Egypt', 'Qatar', 'Albania', 'France'])


class ImagePipelineTests(TestCase):
    """core.images: every upload is cleaned on save and served resized."""

    def _jpeg(self, size=(4000, 3000), exif_orientation=None):
        import io
        from PIL import Image
        img = Image.new('RGB', size, (10, 120, 200))
        buf = io.BytesIO()
        kw = {}
        if exif_orientation:
            exif = Image.Exif()
            exif[0x0112] = exif_orientation
            exif[0x010F] = 'CameraMaker'
            kw['exif'] = exif
        img.save(buf, format='JPEG', **kw)
        return buf.getvalue()

    def test_normalize_caps_size_rotates_and_strips_metadata(self):
        import io
        from PIL import Image
        from core.images import normalize_image_bytes, MASTER_MAX_SIDE
        out, name = normalize_image_bytes(self._jpeg(exif_orientation=6), 'IMG 0012 (1).JPG')
        img = Image.open(io.BytesIO(out))
        # orientation 6 = rotate 90°, so the landscape source comes out portrait
        self.assertEqual(max(img.size), MASTER_MAX_SIDE)
        self.assertGreater(img.height, img.width)
        self.assertEqual(len(img.getexif()), 0)
        self.assertRegex(name, r'^img-0012-1-[0-9a-f]{10}\.jpg$')

    def test_transparent_png_stays_png_and_opaque_webp_becomes_jpeg(self):
        import io
        from PIL import Image
        from core.images import normalize_image_bytes
        buf = io.BytesIO()
        Image.new('RGBA', (300, 300), (0, 0, 0, 0)).save(buf, format='PNG')
        _, name = normalize_image_bytes(buf.getvalue(), 'crest.png')
        self.assertTrue(name.endswith('.png'))
        buf = io.BytesIO()
        Image.new('RGB', (300, 300), (5, 5, 5)).save(buf, format='WEBP')
        _, name = normalize_image_bytes(buf.getvalue(), 'photo.webp')
        self.assertTrue(name.endswith('.jpg'))

    def test_garbage_is_left_alone(self):
        from core.images import normalize_image_bytes
        self.assertIsNone(normalize_image_bytes(b'not an image', 'x.jpg'))

    def test_model_save_normalizes_any_image_field(self):
        import tempfile
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        from PIL import Image
        from sponsors.models import Sponsor
        with tempfile.TemporaryDirectory() as tmp, override_settings(MEDIA_ROOT=tmp):
            s = Sponsor(name='Test partner')
            s.logo = SimpleUploadedFile('Big Photo.jpeg', self._jpeg(), content_type='image/jpeg')
            s.save()
            self.assertRegex(s.logo.name, r'^sponsors/logos/big-photo-[0-9a-f]{10}\.jpg$')
            with Image.open(s.logo.path) as img:
                self.assertEqual(max(img.size), 2560)

    def test_resize_endpoint_serves_bucketed_cached_copy(self):
        import io
        import os
        import tempfile
        from django.test import override_settings
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp, override_settings(MEDIA_ROOT=tmp):
            os.makedirs(os.path.join(tmp, 'swimmers/photos'))
            with open(os.path.join(tmp, 'swimmers/photos/a.jpg'), 'wb') as fh:
                fh.write(self._jpeg(size=(2000, 2500)))
            r = self.client.get('/img/200/swimmers/photos/a.jpg', HTTP_ACCEPT='image/webp,*/*')
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r['Content-Type'], 'image/webp')
            img = Image.open(io.BytesIO(b''.join(r.streaming_content)))
            self.assertEqual(img.size, (256, 320))  # 200 rounds up to the 256 bucket
            r = self.client.get('/img/200/swimmers/photos/a.jpg')
            self.assertEqual(r['Content-Type'], 'image/jpeg')
            from core.images import derived_image
            self.assertIsNone(derived_image(tmp, 'nope.jpg', 200))
            self.assertIsNone(derived_image(tmp, '../../etc/passwd', 200))

    def test_trim_cuts_flat_margins_off_a_logo(self):
        from PIL import Image
        from core.images import trim_borders
        img = Image.new('RGB', (400, 400), (255, 255, 255))
        img.paste((200, 0, 0), (150, 100, 250, 300))
        self.assertEqual(trim_borders(img).size, (100, 200))
