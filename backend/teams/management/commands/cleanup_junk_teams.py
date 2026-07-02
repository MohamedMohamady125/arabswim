"""
Delete junk Team rows (and junk placeholder Swimmers) created by
relay/result parsing glitches — names that are swim times, pure numbers,
or digit-corrupted club names.

Usage:
    ./manage.py cleanup_junk_teams            # dry run (prints what would go)
    ./manage.py cleanup_junk_teams --apply    # actually delete
"""
from django.core.management.base import BaseCommand

from teams.models import Team
from teams.utils import is_valid_team_name
from swimmers.models import Swimmer


class Command(BaseCommand):
    help = 'Remove junk teams/swimmers whose names are times or corrupted strings'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually delete (default is dry run)')

    def handle(self, *args, **options):
        apply = options['apply']

        junk_teams = [t for t in Team.objects.all() if not is_valid_team_name(t.name)]
        self.stdout.write(f'Junk teams: {len(junk_teams)}')
        for t in junk_teams:
            self.stdout.write(f'  team #{t.id}: {t.name!r}')

        # Placeholder swimmers (no birth data) whose name fails validation are
        # relay-parsing junk; their results are junk too (cascade delete).
        junk_swimmers = [
            s for s in Swimmer.objects.filter(date_of_birth__isnull=True, birth_year__isnull=True)
            if not is_valid_team_name(s.name)
        ]
        self.stdout.write(f'Junk placeholder swimmers: {len(junk_swimmers)}')
        for s in junk_swimmers:
            self.stdout.write(f'  swimmer #{s.id}: {s.name!r} (club={s.club!r})')

        if not apply:
            self.stdout.write(self.style.WARNING('Dry run — re-run with --apply to delete.'))
            return

        for t in junk_teams:
            t.delete()
        for s in junk_swimmers:
            s.delete()
        self.stdout.write(self.style.SUCCESS(
            f'Deleted {len(junk_teams)} teams and {len(junk_swimmers)} swimmers.'))
