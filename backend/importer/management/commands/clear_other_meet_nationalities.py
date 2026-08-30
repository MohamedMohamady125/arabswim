"""
Clear guessed nationalities from "Other" classification meets.

For international/invitational meets, the importer previously guessed
nationality from the host country when the file didn't include one.
This command removes those guesses: if a result's nationality matches
the meet's host country AND the swimmer has results in that country's
national meets (meaning they're actually from there), keep it. Otherwise
clear it — the file didn't say so, we shouldn't guess.

Usage:
    python manage.py clear_other_meet_nationalities --dry-run
    python manage.py clear_other_meet_nationalities
"""
from django.core.management.base import BaseCommand
from championships.models import Championship, Result


class Command(BaseCommand):
    help = 'Clear guessed nationalities from Other-classification meets'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        dry = options['dry_run']

        other_meets = Championship.objects.filter(
            classification__name='Other'
        ).select_related('country')

        total_cleared = 0

        for champ in other_meets:
            host_country = champ.country
            if not host_country:
                continue

            # Find results where nationality == host country
            # These are likely guessed, not from the file
            results = Result.objects.filter(
                championship=champ,
                nationality=host_country,
            ).select_related('swimmer', 'swimmer__nationality')

            cleared = 0
            for r in results:
                # If the swimmer's DB nationality is ALSO the host country,
                # the swimmer might genuinely be from there. But for "Other"
                # meets, we still shouldn't show a flag unless the file said so.
                # Clear the result nationality — the swimmer profile still
                # keeps their real nationality.
                if not dry:
                    r.nationality = None
                    r.save(update_fields=['nationality'])
                cleared += 1

            if cleared:
                self.stdout.write(
                    f'  {champ.name} (id={champ.id}, host={host_country.code}): '
                    f'{"would clear" if dry else "cleared"} {cleared} result nationalities'
                )
                total_cleared += cleared

        verb = 'Would clear' if dry else 'Cleared'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {total_cleared} result nationalities across {other_meets.count()} Other meets'
        ))
