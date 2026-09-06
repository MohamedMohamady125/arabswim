from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from sponsors.models import Sponsor

ASSET = Path(settings.BASE_DIR) / 'sponsors' / 'seed_assets' / 'world_aquatics.jpg'


class Command(BaseCommand):
    help = 'Add World Aquatics as the first partner (from the bundled logo).'

    def handle(self, *args, **options):
        if not ASSET.exists():
            self.stderr.write(f'Asset not found: {ASSET}')
            return
        sponsor, created = Sponsor.objects.get_or_create(name='World Aquatics')
        sponsor.website = 'https://www.worldaquatics.com'
        sponsor.is_active = True
        sponsor.sort_order = 0  # first in the strip
        sponsor.logo.save('world_aquatics.jpg', ContentFile(ASSET.read_bytes()), save=False)
        sponsor.save()
        self.stdout.write(self.style.SUCCESS(
            ('Created' if created else 'Updated') + ' World Aquatics partner.'))
