from django.core.management.base import BaseCommand
from core.models import Event


class Command(BaseCommand):
    help = 'Seed standard swimming events'

    def handle(self, *args, **kwargs):
        events = [
            # Freestyle
            {'name': '50 M Freestyle', 'distance': 50, 'stroke': 'Freestyle', 'is_relay': False, 'sort_order': 1},
            {'name': '100 M Freestyle', 'distance': 100, 'stroke': 'Freestyle', 'is_relay': False, 'sort_order': 2},
            {'name': '200 M Freestyle', 'distance': 200, 'stroke': 'Freestyle', 'is_relay': False, 'sort_order': 3},
            {'name': '400 M Freestyle', 'distance': 400, 'stroke': 'Freestyle', 'is_relay': False, 'sort_order': 4},
            {'name': '800 M Freestyle', 'distance': 800, 'stroke': 'Freestyle', 'is_relay': False, 'sort_order': 5},
            {'name': '1500 M Freestyle', 'distance': 1500, 'stroke': 'Freestyle', 'is_relay': False, 'sort_order': 6},
            # Backstroke
            {'name': '50 M Backstroke', 'distance': 50, 'stroke': 'Backstroke', 'is_relay': False, 'sort_order': 7},
            {'name': '100 M Backstroke', 'distance': 100, 'stroke': 'Backstroke', 'is_relay': False, 'sort_order': 8},
            {'name': '200 M Backstroke', 'distance': 200, 'stroke': 'Backstroke', 'is_relay': False, 'sort_order': 9},
            # Breaststroke
            {'name': '50 M Breaststroke', 'distance': 50, 'stroke': 'Breaststroke', 'is_relay': False, 'sort_order': 10},
            {'name': '100 M Breaststroke', 'distance': 100, 'stroke': 'Breaststroke', 'is_relay': False, 'sort_order': 11},
            {'name': '200 M Breaststroke', 'distance': 200, 'stroke': 'Breaststroke', 'is_relay': False, 'sort_order': 12},
            # Butterfly
            {'name': '50 M Butterfly', 'distance': 50, 'stroke': 'Butterfly', 'is_relay': False, 'sort_order': 13},
            {'name': '100 M Butterfly', 'distance': 100, 'stroke': 'Butterfly', 'is_relay': False, 'sort_order': 14},
            {'name': '200 M Butterfly', 'distance': 200, 'stroke': 'Butterfly', 'is_relay': False, 'sort_order': 15},
            # Individual Medley
            {'name': '200 M Individual Medley', 'distance': 200, 'stroke': 'Individual Medley', 'is_relay': False, 'sort_order': 16},
            {'name': '400 M Individual Medley', 'distance': 400, 'stroke': 'Individual Medley', 'is_relay': False, 'sort_order': 17},
            # Relays
            {'name': '4x50 M Freestyle Relay', 'distance': 200, 'stroke': 'Freestyle Relay', 'is_relay': True, 'sort_order': 18},
            {'name': '4x100 M Freestyle Relay', 'distance': 400, 'stroke': 'Freestyle Relay', 'is_relay': True, 'sort_order': 19},
            {'name': '4x200 M Freestyle Relay', 'distance': 800, 'stroke': 'Freestyle Relay', 'is_relay': True, 'sort_order': 20},
            {'name': '4x50 M Medley Relay', 'distance': 200, 'stroke': 'Medley Relay', 'is_relay': True, 'sort_order': 21},
            {'name': '4x100 M Medley Relay', 'distance': 400, 'stroke': 'Medley Relay', 'is_relay': True, 'sort_order': 22},
        ]
        for e in events:
            Event.objects.update_or_create(
                name=e['name'],
                defaults=e
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(events)} events'))
