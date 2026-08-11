from django.core.management.base import BaseCommand
from django.db import IntegrityError, transaction

from championships.models import Result
from swimmers.models import Swimmer
from teams.utils import country_for_relay_team


class Command(BaseCommand):
    help = (
        'Rename national relay-team placeholder swimmers whose names are '
        'source artifacts ("EGY EGY", "Kuwait Swimming") to the country '
        'name, merging into an existing country placeholder when one '
        'exists. Also clears their club field and fixes nationality. '
        'Idempotent.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        renamed = merged = tidied = 0
        for s in Swimmer.objects.filter(is_relay_team=True).select_related('nationality'):
            country = country_for_relay_team(s.name)
            if not country:
                continue
            old_name = s.name
            if s.name.strip().lower() == country.name.strip().lower():
                # Name already right — just tidy club/nationality
                if s.club or s.nationality_id != country.id:
                    self.stdout.write(f'tidy {s.name!r} ({s.sex}): club/nationality')
                    if not dry:
                        s.club = ''
                        s.nationality = country
                        s.save(update_fields=['club', 'nationality'])
                    tidied += 1
                continue

            target = (Swimmer.objects
                      .filter(name__iexact=country.name, sex=s.sex, is_relay_team=True)
                      .exclude(id=s.id).first())
            self.stdout.write(
                f'{old_name!r} ({s.sex}) -> {country.name!r}'
                + (f' [merge into #{target.id}]' if target else ''))
            if dry:
                continue

            if target:
                for r in s.results.all():
                    try:
                        with transaction.atomic():
                            r.swimmer = target
                            r.save(update_fields=['swimmer'])
                    except IntegrityError:
                        # Identical row already on the target — drop the dup
                        r.delete()
                s.medals.update(swimmer=target)
                s.delete()
                target.club = ''
                target.nationality = country
                target.save(update_fields=['club', 'nationality'])
                keeper = target
                merged += 1
            else:
                s.name = country.name
                s.club = ''
                s.nationality = country
                s.save(update_fields=['name', 'club', 'nationality'])
                keeper = s
                renamed += 1

            # Result.team carries the raw team string too
            Result.objects.filter(swimmer=keeper, team__iexact=old_name)\
                .update(team=country.name)

        self.stdout.write(f'Renamed {renamed}, merged {merged}, tidied {tidied}')
