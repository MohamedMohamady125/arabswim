from django.core.management.base import BaseCommand
from core.models import Event


class Command(BaseCommand):
    help = 'Seed open-water swimming events (FINA + youth distance set)'

    def handle(self, *args, **kwargs):
        # sort_order 100+ keeps open-water events after every pool event.
        events = [
            {'name': '1 Km Open Water', 'distance': 1000, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 100},
            {'name': '2 Km Open Water', 'distance': 2000, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 101},
            {'name': '3 Km Open Water', 'distance': 3000, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 102},
            {'name': '5 Km Open Water', 'distance': 5000, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 103},
            {'name': '7.5 Km Open Water', 'distance': 7500, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 104},
            {'name': '10 Km Open Water', 'distance': 10000, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 105},
            {'name': '16 Km Open Water', 'distance': 16000, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 106},
            {'name': '25 Km Open Water', 'distance': 25000, 'stroke': 'Open Water', 'is_relay': False, 'sort_order': 107},
            # Mixed open-water relay: 4 x 1.25 km = 5000 m total.
            {'name': '4x1.25 Km Open Water Relay', 'distance': 5000, 'stroke': 'Open Water', 'is_relay': True, 'sort_order': 108},
        ]
        for e in events:
            Event.objects.update_or_create(name=e['name'], defaults=e)
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(events)} open-water events'))
