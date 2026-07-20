"""Normalise Event names, merge duplicates, and fix sort_order.

Usage:
    python manage.py fix_events          # dry-run (shows what would change)
    python manage.py fix_events --apply  # apply changes
"""
import re

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Event
from importer.services import _compute_sort_order


# Canonical individual event names — distance + stroke
CANONICAL_STROKES = {
    'FREE': 'Freestyle',
    'FREESTYLE': 'Freestyle',
    'FLY': 'Butterfly',
    'BUTTERFLY': 'Butterfly',
    'BACK': 'Backstroke',
    'BACKSTROKE': 'Backstroke',
    'BREAST': 'Breaststroke',
    'BREASTSTROKE': 'Breaststroke',
    'IM': 'Individual Medley',
    'I.M.': 'Individual Medley',
    'INDIVIDUAL MEDLEY': 'Individual Medley',
    'MEDLEY': 'Individual Medley',
}


def canonical_individual_name(event):
    """Build canonical name like '100 M Freestyle' from distance + stroke."""
    stroke = event.stroke
    if not stroke:
        return None
    return f'{event.distance} M {stroke}'


class Command(BaseCommand):
    help = 'Normalise event names, merge duplicates, fix sort_order'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Actually apply changes (default is dry-run)')

    @transaction.atomic
    def handle(self, *args, **options):
        apply = options['apply']
        if not apply:
            self.stdout.write(self.style.WARNING(
                'DRY RUN — pass --apply to commit changes\n'))

        fixed_order = 0
        merged = 0
        renamed = 0

        # 1. Fix sort_order for all events
        for ev in Event.objects.all():
            correct_order = _compute_sort_order(ev.stroke, ev.distance, ev.is_relay)
            if ev.sort_order != correct_order:
                self.stdout.write(
                    f'  SORT  {ev.name!r}: {ev.sort_order} -> {correct_order}')
                if apply:
                    ev.sort_order = correct_order
                    ev.save(update_fields=['sort_order'])
                fixed_order += 1

        # 2. Normalise individual event names to "DISTANCE M Stroke" format
        for ev in Event.objects.filter(is_relay=False):
            canonical = canonical_individual_name(ev)
            if canonical and ev.name != canonical:
                # Check if canonical already exists
                target = Event.objects.filter(
                    name__iexact=canonical).exclude(id=ev.id).first()
                if target:
                    # Merge into the canonical event
                    self.stdout.write(
                        f'  MERGE {ev.name!r} -> {target.name!r} (id {ev.id} -> {target.id})')
                    if apply:
                        from championships.models import Result
                        from medals.models import Medal
                        from records.models import Record
                        # Move results, handling unique constraint conflicts
                        for r in Result.objects.filter(event=ev):
                            try:
                                r.event = target
                                r.save(update_fields=['event'])
                            except Exception:
                                r.delete()  # duplicate — remove
                        Medal.objects.filter(event=ev).update(event=target)
                        Record.objects.filter(event=ev).update(event=target)
                        ev.delete()
                    merged += 1
                else:
                    # Just rename
                    self.stdout.write(f'  RENAME {ev.name!r} -> {canonical!r}')
                    if apply:
                        ev.name = canonical
                        ev.save(update_fields=['name'])
                    renamed += 1

        # 3. Merge exact duplicate events (same name, case-insensitive)
        seen = {}
        for ev in Event.objects.all().order_by('id'):
            key = ev.name.upper()
            if key in seen:
                target = seen[key]
                self.stdout.write(
                    f'  DEDUP {ev.name!r} (id {ev.id}) -> {target.name!r} (id {target.id})')
                if apply:
                    from championships.models import Result
                    from medals.models import Medal
                    from records.models import Record
                    for r in Result.objects.filter(event=ev):
                        try:
                            r.event = target
                            r.save(update_fields=['event'])
                        except Exception:
                            r.delete()
                    Medal.objects.filter(event=ev).update(event=target)
                    Record.objects.filter(event=ev).update(event=target)
                    ev.delete()
                merged += 1
            else:
                seen[key] = ev

        self.stdout.write(self.style.SUCCESS(
            f'\nDone: {fixed_order} sort_order fixed, {renamed} renamed, {merged} merged'))
        if not apply:
            self.stdout.write(self.style.WARNING('No changes applied — use --apply'))
