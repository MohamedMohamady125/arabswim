from django.core.management.base import BaseCommand
from swimmers.models import Swimmer


class Command(BaseCommand):
    help = 'Fix swimmer names to "Firstname LASTNAME" format'

    def handle(self, *args, **kwargs):
        updated = 0
        for s in Swimmer.objects.all():
            new_name = s.name

            # Fix comma format: "Abbas, Jaber" → "Abbas JABER"
            if ',' in new_name:
                parts = new_name.split(',', 1)
                first = parts[0].strip().title()
                last = parts[1].strip().upper()
                new_name = f'{first} {last}'

            # NOTE: do NOT add order-swapping here. "Title CAPS" order is
            # ambiguous ("Marie KHOURY" vs "Khoury MARIE" both match), so any
            # swap flip-flops names on every deploy. One-off repairs belong in
            # the championship-scoped `swap_name_order` command.

            if new_name != s.name:
                s.name = new_name
                s.save(update_fields=['name'])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f'Fixed {updated} swimmer names'))
