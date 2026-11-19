"""Put every existing swimmer photo through the portrait cut-out (swimmer
centred, transparent background that the site shows on Arab Swim navy) —
the same treatment new uploads get.

Safe to run again: a photo that has been through it carries a mark in its
file name and is skipped. The previous file is left on disk.
"""
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from core.cutout import is_marked, isolate_upload
from core.images import normalize_image_bytes


class Command(BaseCommand):
    help = 'Cut existing swimmer photos out for the navy portrait background (skips ones already done).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    @staticmethod
    def _original_bytes(photo):
        """The upload as it was before an earlier cut-out, when it is still on
        disk next to the current file (cleaner edges than cutting a cut-out again)."""
        import os
        from core.cutout import MARK, OLD_MARKS, source_stem
        try:
            folder = os.path.dirname(photo.path)
            stem = source_stem(photo.name)
            if stem == os.path.splitext(os.path.basename(photo.name))[0]:
                return None  # never been through a cut-out: the file itself is the original
            for name in sorted(os.listdir(folder)):
                base = os.path.splitext(name)[0]
                if base == stem and not any(m in base for m in (MARK,) + OLD_MARKS):
                    with open(os.path.join(folder, name), 'rb') as fh:
                        return fh.read()
        except Exception:
            pass
        return None

    def handle(self, *args, **opts):
        from swimmers.models import Swimmer
        done = skipped = failed = 0
        for s in Swimmer.objects.exclude(photo='').exclude(photo__isnull=True).iterator():
            if is_marked(s.photo.name):
                skipped += 1
                continue
            if opts['dry_run']:
                self.stdout.write(f'would process {s.pk} {s.photo.name}')
                continue
            data = self._original_bytes(s.photo)
            if data is None:
                try:
                    with s.photo.open('rb') as fh:
                        data = fh.read()
                except Exception:
                    failed += 1
                    continue
            cut = isolate_upload(data, s.photo.name)
            res = normalize_image_bytes(*cut) if cut else None
            if not res:
                failed += 1
                continue
            new_bytes, new_name = res
            # queryset update: no signals, no audit noise, nothing else on the row touched
            name = s.photo.storage.save(f'swimmers/photos/{new_name}', ContentFile(new_bytes))
            Swimmer.objects.filter(pk=s.pk).update(photo=name)
            done += 1
        self.stdout.write(f'portraits: {done} cut out, {skipped} already done, {failed} left as they were')
