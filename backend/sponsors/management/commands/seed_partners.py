from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from sponsors.models import Sponsor


# Original placeholder wordmarks (no real trademarks) so the Partners strip has
# something to show. Replace them with real partner logos from the admin panel.
# Each entry: (name, SVG mark builder).
def _svg(name, mark):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 72" width="260" height="72">
  <g fill="none">{mark}</g>
  <text x="96" y="46" font-family="Arial, Helvetica, sans-serif"
        font-size="30" font-weight="800" letter-spacing="1" fill="#14181f">{name}</text>
</svg>'''


PARTNERS = [
    ('AQUAJET', '<circle cx="48" cy="36" r="26" fill="#0a6acf"/><path d="M48 18c8 10 12 16 12 22a12 12 0 1 1-24 0c0-6 4-12 12-22z" fill="#ffffff"/>'),
    ('NEREID', '<rect x="24" y="14" width="44" height="44" rx="10" fill="#0d7a52"/><path d="M34 44c4-8 6-12 12-12s8 4 12 12" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>'),
    ('TRITON', '<circle cx="48" cy="36" r="26" fill="#b6553a"/><path d="M48 20v32M40 26h16M44 46h8" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>'),
    ('DELFIN', '<rect x="24" y="14" width="44" height="44" rx="22" fill="#1a2a6c"/><path d="M32 40c6 4 14 6 24 2-4 6-12 9-20 6" fill="#ffffff"/>'),
    ('MARLIN', '<circle cx="48" cy="36" r="26" fill="#c9184a"/><path d="M30 38h22l10-8-6 10 6 10-10-8H30z" fill="#ffffff"/>'),
    ('CORAL', '<rect x="24" y="14" width="44" height="44" rx="10" fill="#e07a1f"/><path d="M46 52V30m0 0c0-6 6-8 6-14m-6 14c0-6-6-8-6-14m6 22c4 0 8-3 8-8m-8 8c-4 0-8-3-8-8" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>'),
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

        for i, (name, mark) in enumerate(PARTNERS, start=1):
            sponsor, created = Sponsor.objects.get_or_create(
                name=name,
                defaults={'is_active': True, 'sort_order': i},
            )
            sponsor.is_active = True
            sponsor.sort_order = i
            svg = _svg(name, mark).encode('utf-8')
            sponsor.logo.save(f'{name.lower()}.svg', ContentFile(svg), save=False)
            sponsor.save()
            self.stdout.write(('Created ' if created else 'Updated ') + name)

        self.stdout.write(self.style.SUCCESS(f'Done — {len(PARTNERS)} partners seeded.'))
