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


class PortraitCutoutTests(TestCase):
    """Framing maths of the swimmer-portrait cut-out (no model needed)."""

    def _mask(self, w, h, box):
        import numpy as np
        m = np.zeros((h, w), dtype='uint8')
        x0, y0, x1, y1 = box
        m[y0:y1, x0:x1] = 255
        return m

    def test_off_centre_subject_is_centred_in_a_4_5_frame(self):
        from core.cutout import subject_frame
        # subject sits in the left third of a wide photo, not touching any edge
        left, top, fw, fh = subject_frame(self._mask(1000, 800, (100, 200, 300, 600)))
        self.assertAlmostEqual(fw / fh, 0.8, places=3)
        self.assertAlmostEqual(left + fw / 2, 200, delta=2)      # centred on the subject
        self.assertGreaterEqual(200 - top, 0.06 * fh)             # white above the head
        self.assertLessEqual(top + fh, 800 + fh)                  # frame is finite

    def test_body_cut_by_the_bottom_edge_sits_on_the_frame_bottom(self):
        from core.cutout import subject_frame
        left, top, fw, fh = subject_frame(self._mask(800, 1000, (250, 150, 650, 1000)))
        self.assertAlmostEqual(top + fh, 1000, delta=1)
        self.assertAlmostEqual(left + fw / 2, 450, delta=2)

    def test_no_clear_subject_leaves_the_photo_alone(self):
        from core.cutout import subject_frame
        self.assertIsNone(subject_frame(self._mask(400, 500, (0, 0, 400, 500))))
        self.assertIsNone(subject_frame(self._mask(400, 500, (10, 10, 20, 20))))

    def test_only_swimmer_portraits_go_through_the_cutout(self):
        from unittest import mock
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        from PIL import Image
        import io
        from core import images
        from swimmers.models import Swimmer
        from coaches.models import Coach
        buf = io.BytesIO(); Image.new('RGB', (40, 50), (10, 90, 200)).save(buf, 'JPEG')
        white = io.BytesIO(); Image.new('RGB', (40, 50), (255, 255, 255)).save(white, 'JPEG')
        with override_settings(PORTRAIT_CUTOUT=True), \
                mock.patch('core.cutout.isolate_upload', return_value=(white.getvalue(), 'a-wb.jpg')) as cut:
            s = Swimmer(name='A B', photo=SimpleUploadedFile('a.jpg', buf.getvalue(), 'image/jpeg'))
            images.normalize_on_save(Swimmer, s)
            self.assertEqual(cut.call_count, 1)
            self.assertIn('a-wb-', s.photo.name)
            c = Coach(name='C D', photo=SimpleUploadedFile('c.jpg', buf.getvalue(), 'image/jpeg'))
            images.normalize_on_save(Coach, c)
            self.assertEqual(cut.call_count, 1)

    def test_a_cutout_reframed_by_hand_is_not_cut_out_again(self):
        from unittest import mock
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        from PIL import Image
        import io
        from core import images
        from core.cutout import is_marked
        from swimmers.models import Swimmer
        cut_png = io.BytesIO(); Image.new('RGBA', (40, 50), (16, 46, 86, 0)).save(cut_png, 'PNG')
        flat = io.BytesIO(); Image.new('RGB', (40, 50), (10, 90, 200)).save(flat, 'PNG')
        with override_settings(PORTRAIT_CUTOUT=True), \
                mock.patch('core.cutout.isolate_upload', return_value=None) as cut:
            # the saved cut-out, cropped again in the crop tool: framing kept
            s = Swimmer(name='A B', photo=SimpleUploadedFile('ali-cut-0a1b2c3d4e.png', cut_png.getvalue(), 'image/png'))
            images.normalize_on_save(Swimmer, s)
            self.assertEqual(cut.call_count, 0)
            self.assertTrue(is_marked(s.photo.name))
            self.assertTrue(s.photo.name.startswith('ali-v2-cut-'))
            # a marked NAME on an ordinary photo is not enough to skip the cut-out
            t = Swimmer(name='C D', photo=SimpleUploadedFile('x-cut.png', flat.getvalue(), 'image/png'))
            images.normalize_on_save(Swimmer, t)
            self.assertEqual(cut.call_count, 1)

    def test_failed_cutout_keeps_the_upload(self):
        from unittest import mock
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        from PIL import Image
        import io
        from core import images
        from swimmers.models import Swimmer
        buf = io.BytesIO(); Image.new('RGB', (40, 50), (10, 90, 200)).save(buf, 'JPEG')
        with override_settings(PORTRAIT_CUTOUT=True), mock.patch('core.cutout.isolate_upload', return_value=None):
            s = Swimmer(name='A B', photo=SimpleUploadedFile('a.jpg', buf.getvalue(), 'image/jpeg'))
            images.normalize_on_save(Swimmer, s)
            self.assertTrue(s.photo.name.startswith('a-'))
            self.assertNotIn('-wb', s.photo.name)


class PortraitNavyBackgroundTests(TestCase):
    """The stored portrait is transparent outside the swimmer, with brand navy
    hidden underneath, and its name tells the backfill it is done."""

    def test_compose_is_transparent_outside_the_swimmer_with_navy_underneath(self):
        from PIL import Image
        from core.cutout import BRAND_NAVY, compose
        img = Image.new('RGB', (100, 100), (200, 30, 30))
        mask = Image.new('L', (100, 100), 0)
        mask.paste(255, (30, 30, 70, 100))
        out = compose(img, mask, (10, 10, 80, 100))
        self.assertEqual(out.mode, 'RGBA')
        self.assertEqual(out.size, (80, 100))
        self.assertEqual(out.getpixel((2, 2)), BRAND_NAVY + (0,))          # background: clear, navy under it
        self.assertEqual(out.getpixel((40, 60)), (200, 30, 30, 255))        # the swimmer: untouched
        self.assertEqual(out.getpixel((79, 99)), BRAND_NAVY + (0,))         # outside the source photo too

    def test_edge_pixels_lose_the_old_background_colour(self):
        from PIL import Image
        from core.cutout import clean_edges
        img = Image.new('RGB', (60, 60), (255, 255, 255))                    # white wall
        img.paste((20, 20, 20), (0, 0, 30, 60))                              # dark swimmer on the left
        img.putpixel((30, 30), (140, 140, 140))                              # a blended edge pixel
        mask = Image.new('L', (60, 60), 0)
        mask.paste(255, (0, 0, 30, 60))
        mask.putpixel((30, 30), 120)
        out = clean_edges(img, mask)
        self.assertLess(max(out.getpixel((30, 30))), 60)                     # pulled back to the swimmer's colour
        self.assertEqual(out.getpixel((10, 30)), (20, 20, 20))

    def _scene(self):
        """Confidence map: a sure swimmer (left block), a wide half-sure
        object touching them (right block), a soft one-sided edge on top."""
        import numpy as np
        m = np.zeros((400, 320), dtype='uint8')
        m[60:400, 40:180] = 255          # the swimmer
        m[200:330, 180:300] = 150        # something held beside them: 59% sure
        m[56:60, 40:180] = 120           # hairline: a thin soft edge
        return m

    def test_a_half_sure_object_beside_the_swimmer_is_removed_not_left_see_through(self):
        import numpy as np
        from PIL import Image
        from core.cutout import refine_mask
        out = np.asarray(refine_mask(Image.fromarray(self._scene(), 'L')))
        self.assertEqual(int(out[220:310, 215:290].max()), 0)                # the object: gone completely
        self.assertEqual(int(out[150, 100]), 255)                            # the swimmer: solid
        self.assertGreater(int(out[58, 100]), 0)                             # the soft edge on top: kept
        # nothing see-through away from the outline
        mid = (out > 25) & (out < 230)
        self.assertLess(mid.sum() / (out > 128).sum(), 0.08)

    def test_a_bystander_piece_is_dropped_and_a_patch_inside_the_swimmer_is_kept(self):
        import numpy as np
        from PIL import Image
        from core.cutout import refine_mask
        m = np.zeros((400, 320), dtype='uint8')
        m[60:400, 40:220] = 255
        m[200:240, 100:150] = 110        # a crest on the chest the model doubted
        m[20:60, 270:310] = 255          # a small separate piece
        out = np.asarray(refine_mask(Image.fromarray(m, 'L')))
        self.assertEqual(int(out[40, 290]), 0)
        self.assertGreater(int(out[220, 125]), 200)

    def test_wall_colour_hiding_in_dark_hair_goes_but_a_white_shirt_on_a_white_wall_stays(self):
        import numpy as np
        from PIL import Image
        from core.cutout import remove_halo
        wall = np.array([240, 240, 240], dtype='float32')
        img = np.full((300, 300, 3), 240, dtype='uint8')
        img[40:150, 60:240] = (25, 20, 18)        # dark hair
        img[150:300, 60:240] = (238, 238, 236)    # white shirt
        mask = np.zeros((300, 300), dtype='uint8')
        mask[34:300, 54:246] = 255                # the model took a ring of wall with it
        out = np.asarray(remove_halo(Image.fromarray(img, 'RGB'), Image.fromarray(mask, 'L'), wall))
        self.assertLess(int(out[36, 150]), 40)        # wall above the hair: gone
        self.assertEqual(int(out[90, 150]), 255)      # hair: kept
        self.assertGreater(int(out[230, 56]), 200)    # shirt edge against the wall: kept

    def test_a_first_version_cutout_is_cleaned_in_place(self):
        import io
        import numpy as np
        from PIL import Image
        from core.cutout import repair_bytes
        a = self._scene()
        rgba = np.zeros(a.shape + (4,), dtype='uint8')
        rgba[..., :3] = (200, 30, 30)
        rgba[..., 3] = np.where(a == 255, 255, np.where(a == 0, 0, a))
        buf = io.BytesIO(); Image.fromarray(rgba, 'RGBA').save(buf, 'PNG')
        data, name = repair_bytes(buf.getvalue(), 'swimmers/photos/ali-cut-0a1b2c3d4e.png')
        self.assertEqual(name, 'ali-v2-cut.png')
        out = Image.open(io.BytesIO(data))
        self.assertEqual(out.size, (320, 400))                               # same framing
        self.assertEqual(out.getpixel((250, 260))[3], 0)                     # the ghost: gone
        self.assertEqual(out.getpixel((100, 200)), (200, 30, 30, 255))

    def test_names_mark_current_cutouts_and_redo_the_white_ones(self):
        from core.cutout import is_marked, marked_name, source_stem
        from core.cutout import is_current
        self.assertEqual(marked_name('swimmers/photos/ali.jpg'), 'ali-v2-cut.png')
        self.assertEqual(marked_name('swimmers/photos/ali-wb-0a1b2c3d4e.jpg'), 'ali-v2-cut.png')
        self.assertEqual(marked_name('ali-v2-cut-0a1b2c3d4e.png'), 'ali-v2-cut.png')
        self.assertTrue(is_marked('ali-v2-cut-0a1b2c3d4e.png'))
        self.assertTrue(is_current('ali-v2-cut-0a1b2c3d4e.png'))
        self.assertFalse(is_current('ali-cut-0a1b2c3d4e.png'))               # first version: cleaned by repair
        self.assertTrue(is_marked('swimmers/photos/ali-cut-0a1b2c3d4e.png'))
        self.assertFalse(is_marked('swimmers/photos/ali-wb-0a1b2c3d4e.jpg'))  # white version: done again
        self.assertFalse(is_marked('swimmers/photos/ali.jpg'))
        self.assertEqual(source_stem('ali-cut-0a1b2c3d4e.png'), 'ali')


class InviteLinkTests(TestCase):
    """Admin makes a link for one entity; whoever opens it gets the account
    that owns that entity, once."""

    def setUp(self):
        from rest_framework.test import APIClient
        from django.contrib.auth import get_user_model
        from core.models import Country
        from academies.models import Academy
        from teams.models import Team
        from swimmers.models import Swimmer
        self.User = get_user_model()
        self.admin = self.User.objects.create_superuser('boss', 'boss@example.com', 'pw', role='ADMIN')
        self.api = APIClient(); self.api.force_authenticate(self.admin)
        self.pub = APIClient()
        self.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        self.academy = Academy.objects.create(name='Blue Fins', country=self.egy)
        self.team = Team.objects.create(name='Nile Club', country=self.egy)
        self.swimmer = Swimmer.objects.create(name='Ali HASSAN', sex='M', nationality=self.egy, birth_year=2005)

    def _make(self, kind, target):
        r = self.api.post('/api/v1/auth/invites/', {'kind': kind, 'target': target.pk}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def _accept(self, token, email='owner@example.com', password='Swim-strong-2026'):
        return self.pub.post(f'/api/v1/auth/invites/open/{token}/', {'email': email, 'password': password}, format='json')

    def test_only_admin_can_make_or_list_links(self):
        self.assertEqual(self.pub.post('/api/v1/auth/invites/', {'kind': 'ACADEMY', 'target': self.academy.pk}, format='json').status_code, 401)
        self.assertEqual(self.pub.get('/api/v1/auth/invites/').status_code, 401)

    def test_each_kind_creates_the_account_that_owns_that_entity(self):
        cases = [('ACADEMY', self.academy, 'academy'), ('CLUB', self.team, 'team'),
                 ('FEDERATION', self.egy, 'country'), ('ATHLETE', self.swimmer, 'swimmer')]
        for i, (kind, target, field) in enumerate(cases):
            inv = self._make(kind, target)
            look = self.pub.get(f'/api/v1/auth/invites/open/{inv["token"]}/').json()
            self.assertTrue(look['usable'])
            self.assertEqual(look['kind'], kind)
            self.assertNotIn('token', look)
            r = self._accept(inv['token'], email=f'owner{i}@example.com')
            self.assertEqual(r.status_code, 201, r.content)
            body = r.json()
            self.assertEqual(body['user']['role'], kind)
            self.assertEqual(body['user'][field], target.pk)
            self.assertTrue(body['access'])
            u = self.User.objects.get(email=f'owner{i}@example.com')
            self.assertEqual(getattr(u, field + '_id'), target.pk)
            self.assertTrue(u.check_password('Swim-strong-2026'))

    def test_link_works_once(self):
        inv = self._make('ACADEMY', self.academy)
        self.assertEqual(self._accept(inv['token']).status_code, 201)
        again = self._accept(inv['token'], email='second@example.com')
        self.assertEqual(again.status_code, 400)
        self.assertFalse(self.User.objects.filter(email='second@example.com').exists())
        self.assertFalse(self.pub.get(f'/api/v1/auth/invites/open/{inv["token"]}/').json()['usable'])
        # and no second link for an entity that now has its account
        r = self.api.post('/api/v1/auth/invites/', {'kind': 'ACADEMY', 'target': self.academy.pk}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_new_link_cancels_the_old_one_and_revoke_and_expiry_block(self):
        import datetime
        from django.utils import timezone
        from core.models import Invite
        first = self._make('CLUB', self.team)
        second = self._make('CLUB', self.team)
        self.assertEqual(self._accept(first['token']).status_code, 400)        # cancelled by the newer link
        self.assertEqual(self.api.post(f'/api/v1/auth/invites/{second["id"]}/revoke/').status_code, 200)
        self.assertEqual(self._accept(second['token']).status_code, 400)
        third = self._make('CLUB', self.team)
        Invite.objects.filter(pk=third['id']).update(expires_at=timezone.now() - datetime.timedelta(days=1))
        self.assertEqual(self._accept(third['token']).status_code, 400)
        self.assertFalse(self.User.objects.filter(role='CLUB').exists())

    def test_owner_signs_in_with_the_email_they_chose(self):
        inv = self._make('ACADEMY', self.academy)
        self._accept(inv['token'], email='Owner@Example.com')
        ok = self.pub.post('/api/v1/auth/login/', {'username': 'OWNER@example.com', 'password': 'Swim-strong-2026'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertTrue(ok.json()['access'])
        bad = self.pub.post('/api/v1/auth/login/', {'username': 'owner@example.com', 'password': 'wrong'}, format='json')
        self.assertEqual(bad.status_code, 401)
        old = self.pub.post('/api/v1/auth/login/', {'username': 'boss', 'password': 'pw'}, format='json')
        self.assertEqual(old.status_code, 200)                                  # usernames still work

    def test_deleting_a_link_removes_its_page_and_account_but_keeps_their_work(self):
        inv = self._make('CLUB', self.team)
        self._accept(inv['token'], email='club.owner@example.com')
        owner = self.User.objects.get(email='club.owner@example.com')
        from rest_framework.test import APIClient
        as_owner = APIClient(); as_owner.force_authenticate(owner)
        self.assertEqual(as_owner.patch(f'/api/v1/teams/{self.team.id}/', {'description': 'Our story'}, format='json').status_code, 200)
        board = as_owner.post('/api/v1/board-members/', {'team': self.team.id, 'name': 'Pres IDENT', 'role': 'President'}, format='json')
        self.assertEqual(board.status_code, 201, board.content)

        self.assertEqual(self.pub.delete(f'/api/v1/auth/invites/{inv["id"]}/').status_code, 401)   # admin only
        r = self.api.delete(f'/api/v1/auth/invites/{inv["id"]}/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['account_deleted'], 'club.owner@example.com')
        self.assertFalse(self.User.objects.filter(email='club.owner@example.com').exists())      # cannot sign in any more
        self.assertEqual(self.pub.get(f'/api/v1/auth/invites/open/{inv["token"]}/').status_code, 404)  # the page is gone
        self.team.refresh_from_db()
        self.assertEqual(self.team.description, 'Our story')                                      # their work stays
        self.assertEqual(self.team.board_members.count(), 1)
        self.assertEqual(self.api.get('/api/v1/auth/invites/').json(), [])
        again = self._make('CLUB', self.team)                                                     # and it can be invited again
        self.assertEqual(again['status'], 'PENDING')

    def test_deleting_an_unused_link_only_removes_the_link(self):
        inv = self._make('ACADEMY', self.academy)
        before = self.User.objects.count()
        r = self.api.delete(f'/api/v1/auth/invites/{inv["id"]}/')
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json()['account_deleted'])
        self.assertEqual(self.User.objects.count(), before)
        self.assertEqual(self.pub.get(f'/api/v1/auth/invites/open/{inv["token"]}/').status_code, 404)

    def test_bad_input_is_explained_and_creates_nothing(self):
        inv = self._make('ACADEMY', self.academy)
        r = self._accept(inv['token'], email='not-an-email', password='123')
        self.assertEqual(r.status_code, 400)
        self.assertIn('email', r.json()['errors'])
        self.assertIn('password', r.json()['errors'])
        r = self._accept(inv['token'], email='boss@example.com')                # email already has an account
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.pub.get('/api/v1/auth/invites/open/nope/').status_code, 404)
        self.assertEqual(self._accept(inv['token']).status_code, 201)            # the link is still good afterwards


class OwnerAccountRulesTests(TestCase):
    """What an invited owner account may and may not change."""

    def setUp(self):
        from rest_framework.test import APIClient
        from django.contrib.auth import get_user_model
        from core.models import Country
        from teams.models import Team
        from swimmers.models import Swimmer
        U = get_user_model()
        self.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        self.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        self.team = Team.objects.create(name='Nile Club', country=self.egy)
        self.other = Team.objects.create(name='Other Club', country=self.egy)
        self.swimmer = Swimmer.objects.create(name='Ali HASSAN', sex='M', nationality=self.egy, birth_year=2005)
        self.club = APIClient(); self.club.force_authenticate(U.objects.create_user('club@x.com', 'club@x.com', 'pw', role='CLUB', team=self.team))
        self.fed = APIClient(); self.fed.force_authenticate(U.objects.create_user('fed@x.com', 'fed@x.com', 'pw', role='FEDERATION', country=self.egy))
        self.ath = APIClient(); self.ath.force_authenticate(U.objects.create_user('ath@x.com', 'ath@x.com', 'pw', role='ATHLETE', swimmer=self.swimmer))

    def test_club_fills_its_page_but_cannot_rename_or_reflag_it(self):
        r = self.club.patch(f'/api/v1/teams/{self.team.id}/', {
            'description': 'Founded on the Nile', 'instagram_url': '@nile.club', 'x_url': 'https://x.com/nile',
            'name': 'Hacked Name', 'is_national_team': True, 'is_academy': True, 'country': self.tun.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.team.refresh_from_db()
        self.assertEqual(self.team.description, 'Founded on the Nile')
        self.assertEqual(self.team.instagram_url, 'https://instagram.com/nile.club')   # a bare handle becomes a link
        self.assertEqual(self.team.x_url, 'https://x.com/nile')
        self.assertEqual(self.team.name, 'Nile Club')
        self.assertFalse(self.team.is_national_team)
        self.assertFalse(self.team.is_academy)
        self.assertEqual(self.team.country_id, self.egy.id)
        self.assertEqual(self.club.patch(f'/api/v1/teams/{self.other.id}/', {'description': 'x'}, format='json').status_code, 403)

    def test_federation_edits_its_contact_card_only(self):
        r = self.fed.patch(f'/api/v1/countries/{self.egy.id}/', {
            'federation_phone': '+20 100', 'federation_instagram': 'egyswim'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.egy.refresh_from_db()
        self.assertEqual(self.egy.federation_phone, '+20 100')
        self.assertEqual(self.egy.federation_instagram, 'https://instagram.com/egyswim')
        self.assertEqual(self.fed.patch(f'/api/v1/countries/{self.egy.id}/', {'name': 'X'}, format='json').status_code, 400)
        self.assertEqual(self.fed.patch(f'/api/v1/countries/{self.tun.id}/', {'federation_phone': '1'}, format='json').status_code, 403)
        self.assertEqual(self.fed.delete(f'/api/v1/countries/{self.egy.id}/').status_code, 403)
        self.assertEqual(self.club.patch(f'/api/v1/countries/{self.egy.id}/', {'federation_phone': '1'}, format='json').status_code, 403)

    def test_federation_gets_a_national_team_for_its_board(self):
        from teams.models import Team
        r = self.fed.post(f'/api/v1/countries/{self.egy.id}/ensure-national-team/')
        self.assertEqual(r.status_code, 200, r.content)
        team = Team.objects.get(pk=r.json()['id'])
        self.assertTrue(team.is_national_team)
        self.assertEqual(team.country_id, self.egy.id)
        again = self.fed.post(f'/api/v1/countries/{self.egy.id}/ensure-national-team/').json()
        self.assertEqual(again['id'], team.id)                                          # reused, not duplicated
        self.assertEqual(self.fed.post(f'/api/v1/countries/{self.tun.id}/ensure-national-team/').status_code, 403)
        # and it can now add a board member to it
        b = self.fed.post('/api/v1/board-members/', {'team': team.id, 'name': 'Pres IDENT', 'role': 'President'}, format='json')
        self.assertEqual(b.status_code, 201, b.content)

    def test_swimmer_account_cannot_rewrite_identity_or_skip_photo_review(self):
        r = self.ath.put(f'/api/v1/swimmers/{self.swimmer.id}/', {'name': 'Someone ELSE', 'sex': 'M', 'nationality': self.tun.id}, format='json')
        self.assertEqual(r.status_code, 400)
        self.swimmer.refresh_from_db()
        self.assertEqual(self.swimmer.name, 'Ali HASSAN')
        self.assertEqual(self.ath.patch(f'/api/v1/swimmers/{self.swimmer.id}/', {'instagram_url': 'https://instagram.com/ali'}, format='json').status_code, 200)
        self.assertEqual(self.ath.post(f'/api/v1/swimmers/{self.swimmer.id}/upload_photo/').status_code, 403)


    def test_club_and_federation_upload_photos_for_their_own_swimmers_only(self):
        import io
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        from swimmers.models import Swimmer

        def pic():
            buf = io.BytesIO()
            Image.new('RGB', (400, 500), (200, 60, 60)).save(buf, 'JPEG')
            return SimpleUploadedFile('p.jpg', buf.getvalue(), content_type='image/jpeg')

        def up(client, swimmer):
            return client.post(f'/api/v1/swimmers/{swimmer.id}/upload_photo/', {'photo': pic()}, format='multipart')

        mine = Swimmer.objects.create(name='Omar NILE', sex='M', nationality=self.tun, club='nile club')
        theirs = Swimmer.objects.create(name='Sami OTHER', sex='M', nationality=self.tun, club='Other Club')
        self.assertEqual(up(self.club, mine).status_code, 200)          # on its roster
        self.assertEqual(up(self.club, theirs).status_code, 403)        # another club's swimmer
        self.assertEqual(up(self.club, self.swimmer).status_code, 403)  # no club link at all
        self.assertEqual(up(self.fed, self.swimmer).status_code, 200)   # Egyptian swimmer, Egyptian federation
        self.assertEqual(up(self.fed, mine).status_code, 403)           # Tunisian swimmer
        self.assertEqual(up(self.ath, self.swimmer).status_code, 403)   # a swimmer still goes through review
        mine.refresh_from_db()
        self.assertTrue(mine.photo)
        # removing a photo stays with the admin
        self.assertEqual(self.club.delete(f'/api/v1/swimmers/{mine.id}/delete-photo/').status_code, 403)


class PrelaunchLockTests(TestCase):
    """Before launch the API gives nothing to a visitor who is not signed in."""

    def setUp(self):
        from rest_framework.test import APIClient
        from django.contrib.auth import get_user_model
        from core.models import Country
        from core.prelaunch import forget_cached_state
        forget_cached_state()
        self.U = get_user_model()
        self.admin = self.U.objects.create_superuser('boss', 'boss@example.com', 'pw', role='ADMIN')
        self.owner = self.U.objects.create_user('o@x.com', 'o@x.com', 'pw', role='CLUB')
        Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        self.anon = APIClient()
        self.as_admin = APIClient(); self.as_admin.force_authenticate(self.admin)

    def _token_client(self, username):
        from rest_framework.test import APIClient
        c = APIClient()
        tok = self.anon.post('/api/v1/auth/login/', {'username': username, 'password': 'pw'}, format='json').json()['access']
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {tok}')
        return c

    def test_locked_by_default_for_visitors_but_not_for_accounts(self):
        from django.test import override_settings
        with override_settings(PRELAUNCH_ENFORCED=True):
            self.assertEqual(self.anon.get('/api/v1/countries/').status_code, 401)
            self.assertEqual(self.anon.get('/api/v1/swimmers/').status_code, 401)
            self.assertEqual(self.anon.post('/api/v1/auth/register/', {'username': 'x', 'email': 'x@x.com', 'password': 'Swim-strong-2026'}, format='json').status_code, 401)
            # the doors that stay open: flags, sign-in, invite links
            self.assertTrue(self.anon.get('/api/v1/features/').json()['prelaunch'])
            self.assertEqual(self.anon.get('/api/v1/auth/invites/open/nope/').status_code, 404)
            self.assertEqual(self._token_client('o@x.com').get('/api/v1/countries/').status_code, 200)
            self.assertEqual(self._token_client('boss').get('/api/v1/countries/').status_code, 200)

    def test_admin_opens_the_site(self):
        from django.test import override_settings
        with override_settings(PRELAUNCH_ENFORCED=True):
            self.assertEqual(self._token_client('o@x.com').patch('/api/v1/features/', {'prelaunch': False}, format='json').status_code, 403)
            self.assertEqual(self._token_client('boss').patch('/api/v1/features/', {'prelaunch': False}, format='json').status_code, 200)
            self.assertFalse(self.anon.get('/api/v1/features/').json()['prelaunch'])
            self.assertEqual(self.anon.get('/api/v1/countries/').status_code, 200)


class SeasonSquadTests(TestCase):
    """A swimmer is in a club's / country's squad for the years they raced
    for it, and in no other year."""

    def setUp(self):
        from rest_framework.test import APIClient
        from teams.models import Team
        self.c = APIClient()
        self.c.force_authenticate(get_user_model().objects.create_user('adm', password='x', role='ADMIN'))
        self.egy = Country.objects.create(name='Egypt', code='EGY', region='ARAB')
        self.tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        self.ev = Event.objects.create(name='50m Freestyle', distance=50, stroke='Freestyle', sort_order=1)
        self.nile = Team.objects.create(name='Nile Club', country=self.egy)
        self.this_year = date.today().year
        self.m21 = Championship.objects.create(name='Cup 21', date=date(2021, 5, 1), pool='LCM', country=self.egy, location='Cairo')
        self.m23 = Championship.objects.create(name='Cup 23', date=date(2023, 5, 1), pool='LCM', country=self.egy, location='Cairo')

    def swim(self, swimmer, meet, team, nat, pts=500):
        return Result.objects.create(swimmer=swimmer, championship=meet, event=self.ev, round_type='Finals',
                                     time_centiseconds=2500, fina_points=pts, team=team, nationality=nat)

    def test_club_roster_carries_the_years_each_swimmer_raced_for_it(self):
        moved = Swimmer.objects.create(name='Moved AWAY', sex='M', nationality=self.egy, club='Delta Club')
        self.swim(moved, self.m21, 'Nile Club', self.egy)
        self.swim(moved, self.m23, 'Delta Club', self.egy)
        stale = Swimmer.objects.create(name='Stale CLUB', sex='M', nationality=self.egy, club='Nile Club')
        self.swim(stale, self.m21, 'nile club', self.egy)          # last seen here in 2021
        new = Swimmer.objects.create(name='New SIGNING', sex='F', nationality=self.egy, club='Nile Club')
        back = Swimmer.objects.create(name='Came BACK', sex='F', nationality=self.egy, club='Nile Club')
        self.swim(back, self.m21, 'Nile Club', self.egy)
        self.swim(back, self.m23, 'Delta Club', self.egy)
        data = self.c.get(f'/api/v1/teams/{self.nile.id}/profile/').json()
        seasons = {r['name']: r['seasons'] for r in data['roster']}
        self.assertEqual(seasons['Moved AWAY'], [2021])
        self.assertEqual(seasons['Stale CLUB'], [2021])
        self.assertEqual(seasons['New SIGNING'], [self.this_year])
        self.assertEqual(seasons['Came BACK'], [self.this_year, 2021])
        self.assertEqual(data['roster_years'], [self.this_year, 2021])

    def test_country_squad_is_per_year_and_follows_the_country_represented(self):
        a = Swimmer.objects.create(name='Ali EGY', sex='M', nationality=self.egy)
        self.swim(a, self.m21, 'Egypt', self.egy, 600)
        self.swim(a, self.m23, 'Egypt', self.egy, 650)
        switched = Swimmer.objects.create(name='Sami SWITCH', sex='M', nationality=self.tun)
        self.swim(switched, self.m21, 'Egypt', self.egy, 700)     # swam for Egypt in 2021
        self.swim(switched, self.m23, 'Tunisia', self.tun, 720)   # for Tunisia since
        Swimmer.objects.create(name='No SWIMS', sex='F', nationality=self.egy)
        latest = self.c.get(f'/api/v1/countries/{self.egy.id}/squad/').json()
        self.assertEqual(latest['years'], [self.this_year, 2023, 2021])
        self.assertEqual([s['name'] for s in latest['swimmers']], ['No SWIMS'])
        y21 = self.c.get(f'/api/v1/countries/{self.egy.id}/squad/?year=2021').json()
        self.assertEqual([s['name'] for s in y21['swimmers']], ['Sami SWITCH', 'Ali EGY'])   # best first
        y23 = self.c.get(f'/api/v1/countries/{self.egy.id}/squad/?year=2023').json()
        self.assertEqual([s['name'] for s in y23['swimmers']], ['Ali EGY'])
        tun = self.c.get(f'/api/v1/countries/{self.tun.id}/squad/?year=2023').json()
        self.assertEqual([s['name'] for s in tun['swimmers']], ['Sami SWITCH'])
        arab = self.c.get('/api/v1/countries/arab/squad/?year=2023').json()
        self.assertEqual(len(arab['swimmers']), 2)
