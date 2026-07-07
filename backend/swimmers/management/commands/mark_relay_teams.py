from django.core.management.base import BaseCommand
from django.db.models import Count, F, Q

from swimmers.models import Swimmer


class Command(BaseCommand):
    help = (
        'Flag relay-team placeholder swimmers (rows whose results are all '
        'relay-event results) with is_relay_team=True. Idempotent.'
    )

    def handle(self, *args, **options):
        placeholders = Swimmer.objects.annotate(
            total=Count('results'),
            relays=Count('results', filter=Q(results__event__is_relay=True)),
        ).filter(total__gt=0, total=F('relays'), is_relay_team=False)
        marked = Swimmer.objects.filter(
            id__in=list(placeholders.values_list('id', flat=True))
        ).update(is_relay_team=True)

        # Safety: unflag anything with at least one individual result
        wrongly_flagged = Swimmer.objects.filter(
            is_relay_team=True,
            results__event__is_relay=False,
        ).distinct()
        unmarked = Swimmer.objects.filter(
            id__in=list(wrongly_flagged.values_list('id', flat=True))
        ).update(is_relay_team=False)

        self.stdout.write(f'Marked {marked} relay-team placeholders, unmarked {unmarked}')
