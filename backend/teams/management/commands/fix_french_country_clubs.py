"""Remove bogus "club" records that are really country names in French.

Some internationally-hosted meets (e.g. the 4th Arab Championships) were
imported from French-language result files where the team/club column holds
each swimmer's country name in French ("TUNISIE", "MAROC", "ARABIE
SAOUDITE"). The importer treated those as club names and created Team
records + set swimmer.club, so every country page listed its own name (in
French) as a club.

This command deletes those bogus Team records and clears the matching
swimmer.club values. Result.team is left untouched — at an international
meet it correctly identifies the national team, and auto_create_teams
already ignores the team column of non-National meets. Idempotent.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from swimmers.models import Swimmer
from teams.models import Team
from teams.utils import normalize_team_key
from importer.matcher import COUNTRY_NAME_ALIASES


class Command(BaseCommand):
    help = 'Delete bogus club records that are French country-name spellings'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would change without changing data')

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options['dry_run']

        # Match keys for every non-English country-name spelling.
        alias_keys = {normalize_team_key(a) for a in COUNTRY_NAME_ALIASES}
        alias_keys.discard('')

        bogus_teams = [t for t in Team.objects.filter(is_national_team=False)
                       if normalize_team_key(t.name) in alias_keys]
        swimmers = [s for s in Swimmer.objects.exclude(club='').exclude(club__isnull=True)
                    if normalize_team_key(s.club) in alias_keys]

        for t in bogus_teams:
            self.stdout.write(f'  team: {t.name!r} (country={t.country.name})')
        for s in swimmers:
            self.stdout.write(f'  swimmer club cleared: {s.name!r} was {s.club!r}')

        if dry:
            self.stdout.write(self.style.SUCCESS(
                f'Would delete {len(bogus_teams)} team(s), '
                f'clear {len(swimmers)} swimmer club(s)'))
            return

        for s in swimmers:
            s.club = ''
            s.save(update_fields=['club'])
        for t in bogus_teams:
            t.delete()

        self.stdout.write(self.style.SUCCESS(
            f'Deleted {len(bogus_teams)} bogus team(s), '
            f'cleared {len(swimmers)} swimmer club(s)'))
