"""
Repair club countries using each meet's classification.

Team countries are inferred from swimmer nationalities at import time, so a
foreign club whose only saved swimmers are Arab gets the wrong country
(e.g. GRENOBLE ALP'38 tagged Tunisia after a French meet where only the
Tunisian swimmer was kept). Meets classified National/Other with a country
sub-classification name the country their clubs belong to — reapply that
rule across all championships.

Usage:
    python manage.py fix_club_countries
"""
from django.core.management.base import BaseCommand
from championships.models import Championship
from teams.utils import apply_subclassification_country


class Command(BaseCommand):
    help = 'Reapply classification-based club countries for all meets'

    def handle(self, *args, **options):
        total = 0
        qs = Championship.objects.filter(
            classification__isnull=False,
            sub_classification__isnull=False,
        ).select_related('classification', 'sub_classification')
        for championship in qs:
            updated = apply_subclassification_country(championship)
            if updated:
                self.stdout.write(
                    f'{championship.name}: {updated} club(s) updated')
                total += updated
        self.stdout.write(self.style.SUCCESS(f'Updated {total} club(s)'))
