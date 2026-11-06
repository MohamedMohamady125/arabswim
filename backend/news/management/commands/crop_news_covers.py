"""Center-crop legacy news cover images to 16:9 in place.

Covers uploaded through the frontend CropUpload are already exactly 16:9;
older uploads (square/portrait) get the middle 16:9 band cut out so the file
matches what every cover box renders. Runs where the media volume is mounted
(the Railway container). Dry-run by default; pass --apply to write files.
"""
import io

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

from news.models import Article

TARGET = 16 / 9
TOLERANCE = 0.03


class Command(BaseCommand):
    help = 'Center-crop news cover images to 16:9 in place (dry-run without --apply)'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Actually overwrite the image files')

    def handle(self, *args, **opts):
        from PIL import Image

        apply = opts['apply']
        for a in Article.objects.exclude(cover_image='').order_by('id'):
            name = a.cover_image.name
            if not default_storage.exists(name):
                self.stdout.write(f'#{a.id} MISSING file {name}')
                continue
            with default_storage.open(name, 'rb') as f:
                raw = f.read()
            img = Image.open(io.BytesIO(raw))
            img.load()
            fmt = img.format or 'JPEG'
            w, h = img.size
            ratio = w / h
            if abs(ratio - TARGET) <= TOLERANCE:
                self.stdout.write(f'#{a.id} already 16:9 ({w}x{h}) — skipped')
                continue
            if ratio > TARGET:          # too wide: trim the sides equally
                new_w = round(h * TARGET)
                left = (w - new_w) // 2
                box = (left, 0, left + new_w, h)
            else:
                # Too tall: anchor near the TOP, never the center — in news
                # photos of people the face sits in the upper part of the
                # frame, and a center band decapitates it. Keep a small 8%
                # headroom above the band.
                new_h = round(w / TARGET)
                top = min(round(h * 0.08), h - new_h)
                box = (0, top, w, top + new_h)
            out = img.crop(box)
            tag = 'APPLIED' if apply else 'would crop (dry-run)'
            self.stdout.write(
                f'#{a.id} "{a.title[:40]}" {w}x{h} -> {out.size[0]}x{out.size[1]} {tag}')
            if not apply:
                continue
            if fmt.upper() in ('JPEG', 'JPG') and out.mode != 'RGB':
                out = out.convert('RGB')
            buf = io.BytesIO()
            save_kwargs = {'quality': 92} if fmt.upper() in ('JPEG', 'JPG') else {}
            out.save(buf, format=fmt, **save_kwargs)
            # same storage name so the DB field and URL stay unchanged
            default_storage.delete(name)
            default_storage.save(name, io.BytesIO(buf.getvalue()))
