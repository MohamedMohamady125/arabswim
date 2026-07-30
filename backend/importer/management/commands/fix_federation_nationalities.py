from django.core.management.base import BaseCommand

from championships.models import Result
from importer.matcher import resolve_country


class Command(BaseCommand):
    """Repair national-team meets where the Team column held federation names
    ("Kuwait Swimming", "Bahrain Aquatics") that the importer couldn't resolve,
    so every swimmer fell back to the meet host country.

    For each result whose team resolves to a country: set the swimmer's
    nationality to that country and blank the team (a correct import clears
    the club when it IS a country, so it doesn't show as a fake club).
    """

    help = 'Fix swimmer nationalities from federation team names in national-team meets'

    def add_arguments(self, parser):
        parser.add_argument('championship_ids', nargs='+', type=int)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        dry = options['dry_run']
        nat_fixed = 0
        teams_cleared = 0
        for champ_id in options['championship_ids']:
            results = Result.objects.filter(
                championship_id=champ_id).exclude(team='').select_related(
                'swimmer', 'swimmer__nationality')
            seen_swimmers = set()
            for r in results:
                country = resolve_country(r.team)
                if not country:
                    continue
                s = r.swimmer
                if s.id not in seen_swimmers and s.nationality_id != country.id:
                    seen_swimmers.add(s.id)
                    old = s.nationality.name if s.nationality else 'None'
                    self.stdout.write(
                        f'  {s.name}: {old} -> {country.name} (team "{r.team}")')
                    if not dry:
                        s.nationality = country
                        s.save(update_fields=['nationality'])
                    nat_fixed += 1
                if not dry:
                    r.team = ''
                    r.save(update_fields=['team'])
                teams_cleared += 1
        prefix = '[dry-run] ' if dry else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}{nat_fixed} swimmers re-nationalized, '
            f'{teams_cleared} federation team entries cleared'))
