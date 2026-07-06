"""Remove swimmers (and their results/medals/records) from non-Arab countries.

The database is Arab-only: African, world or invitational meet imports used
to create swimmer profiles for every nation in the file. Imports now skip
non-Arab rows; this command purges the profiles that already exist.
Only swimmers whose nationality has region='OTHER' are removed — Arab and
GCC swimmers are never touched. Idempotent.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from swimmers.models import Swimmer


class Command(BaseCommand):
    help = 'Delete swimmers whose nationality is not an Arab/GCC country'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be deleted without changing data')

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options['dry_run']
        qs = Swimmer.objects.filter(nationality__region='OTHER')
        count = qs.count()
        if not count:
            self.stdout.write('No non-Arab swimmers found')
            return

        by_country = {}
        for code in qs.values_list('nationality__code', flat=True):
            by_country[code] = by_country.get(code, 0) + 1
        breakdown = ', '.join(f'{c}: {n}' for c, n in sorted(by_country.items()))

        if dry:
            self.stdout.write(self.style.SUCCESS(
                f'{count} non-Arab swimmer(s) would be deleted ({breakdown})'))
            return

        qs.delete()  # cascades to results, medals, records
        self.stdout.write(self.style.SUCCESS(
            f'{count} non-Arab swimmer(s) deleted ({breakdown})'))
