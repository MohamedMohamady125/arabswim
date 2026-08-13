"""One-time enhancement pass over existing photographic uploads.

Runs the same mild enhancement new uploads get (EXIF rotation fix,
autocontrast, light sharpening) over photos that were uploaded before
enhancement existed. Only photographic fields are touched — club/academy
logos and banners are skipped since autocontrast ruins flat graphics.

Run ONCE: re-running re-sharpens already-enhanced files.
"""
from django.core.management.base import BaseCommand

from core.image_enhance import enhance_image_bytes

# (app.Model, field) pairs holding photographic content
PHOTO_FIELDS = [
    ('media_app.MediaItem', 'image'),
    ('swimmers.Swimmer', 'photo'),
    ('championships.Championship', 'meet_photo'),
    ('fame.Inductee', 'photo'),
    ('coaches.Coach', 'photo'),
]


class Command(BaseCommand):
    help = 'Enhance existing photos in place (EXIF fix, autocontrast, sharpen). Run once.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        from django.apps import apps
        total = 0
        for model_path, field in PHOTO_FIELDS:
            try:
                model = apps.get_model(model_path)
            except LookupError:
                self.stdout.write(f'skip {model_path}: model not found')
                continue
            qs = model.objects.exclude(**{field: ''}).exclude(**{f'{field}__isnull': True})
            done = failed = 0
            for obj in qs.iterator():
                f = getattr(obj, field)
                try:
                    with f.open('rb') as fh:
                        data = fh.read()
                    new_data, ok = enhance_image_bytes(data, f.name)
                    if not ok:
                        failed += 1
                        continue
                    if not opts['dry_run']:
                        # overwrite the same storage path — no DB change needed
                        with f.storage.open(f.name, 'wb') as out:
                            out.write(new_data)
                    done += 1
                except Exception as e:
                    failed += 1
                    self.stdout.write(f'  {model_path} id={obj.pk}: {e}')
            total += done
            self.stdout.write(f'{model_path}.{field}: {done} enhanced, {failed} skipped/failed')
        verb = 'Would enhance' if opts['dry_run'] else 'Enhanced'
        self.stdout.write(self.style.SUCCESS(f'{verb} {total} photos'))
