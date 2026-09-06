from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from sponsors.models import Sponsor


# Original placeholder brand marks (no real trademarks) so the Partners strip
# looks finished. Each = rounded accent badge + white glyph + charcoal wordmark,
# a cohesive premium set. Replace with real partner logos from the admin panel.
def _svg(name, accent, glyph):
    text_w = int(len(name) * 18.5)
    w = 74 + text_w + 20
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 64" '
        f'width="{w}" height="64">'
        f'<rect x="4" y="4" width="56" height="56" rx="15" fill="{accent}"/>'
        f'<g fill="none" stroke="#ffffff" stroke-width="4" '
        f'stroke-linecap="round" stroke-linejoin="round">{glyph}</g>'
        f'<text x="74" y="43" font-family="\'Helvetica Neue\',Arial,sans-serif" '
        f'font-size="29" font-weight="800" letter-spacing="0.4" '
        f'fill="#14181f">{name}</text>'
        f'</svg>'
    )


PARTNERS = [
    # (name, accent, glyph inside the 56x56 badge, centred on 32,32)
    ('AQUAJET', '#0891b2',
     '<path d="M32 15c7 9 11 14 11 19a11 11 0 0 1-22 0c0-5 4-10 11-19z" fill="#ffffff" stroke="none"/>'),
    ('NEREID', '#0d9488',
     '<path d="M18 28c4-5 8-5 12 0s8 5 12 0M18 40c4-5 8-5 12 0s8 5 12 0"/>'),
    ('TRITON', '#c2410c',
     '<path d="M32 22v24M22 27h20M22 27v-6M32 27v-7M42 27v-6"/><circle cx="32" cy="48" r="3" fill="#ffffff" stroke="none"/>'),
    ('DELFIN', '#1e3a8a',
     '<path d="M18 39c10 8 22 4 27-6" stroke-width="4.5"/><path d="M40 32c3-2 6-2 6-6" stroke-width="4.5"/>'),
    ('MARLIN', '#be123c',
     '<path d="M22 21l11 11-11 11M34 21l11 11-11 11" stroke-width="4.5"/>'),
    ('CORAL', '#ea580c',
     '<path d="M20 43a12 12 0 0 1 24 0M26 43a6 6 0 0 1 12 0"/><circle cx="32" cy="43" r="2.4" fill="#ffffff" stroke="none"/>'),
]


class Command(BaseCommand):
    help = 'Seed the Partners strip with original placeholder logos.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true',
                            help='Delete existing sponsors before seeding.')

    def handle(self, *args, **options):
        if options['reset']:
            n, _ = Sponsor.objects.all().delete()
            self.stdout.write(f'Deleted existing sponsors ({n} rows).')

        for i, (name, accent, glyph) in enumerate(PARTNERS, start=1):
            sponsor, created = Sponsor.objects.get_or_create(
                name=name,
                defaults={'is_active': True, 'sort_order': i},
            )
            sponsor.is_active = True
            sponsor.sort_order = i
            svg = _svg(name, accent, glyph).encode('utf-8')
            sponsor.logo.save(f'{name.lower()}.svg', ContentFile(svg), save=False)
            sponsor.save()
            self.stdout.write(('Created ' if created else 'Updated ') + name)

        self.stdout.write(self.style.SUCCESS(f'Done — {len(PARTNERS)} partners seeded.'))
