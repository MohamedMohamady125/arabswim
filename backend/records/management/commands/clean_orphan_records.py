"""Remove automatic records whose swim no longer exists, and rebuild the
record books they were blocking.

These are left over from meets that were deleted or imported again before
records followed their results (records/signals.py). Without --apply it only
reports. Hand-entered records are never touched.
"""
from collections import Counter

from django.core.management.base import BaseCommand

from records.models import Record
from records.signals import record_book_key, restore_books


class Command(BaseCommand):
    help = 'Delete automatic records with no result behind them and rebuild their record books.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Make the changes (default: report only)')

    def handle(self, *args, **opts):
        orphans = list(Record.objects.filter(source='AUTO', result__isnull=True)
                       .select_related('event', 'swimmer'))
        by_meet = Counter(r.meet_name or '(no meet name)' for r in orphans)
        self.stdout.write(f'{len(orphans)} automatic records have no result behind them:')
        for name, n in by_meet.most_common():
            self.stdout.write(f'  {n:4d}  {name}')
        if not opts['apply']:
            self.stdout.write('Report only. Run again with --apply to remove them and rebuild the books.')
            return
        keys = {record_book_key(r) for r in orphans}
        Record.objects.filter(pk__in=[r.pk for r in orphans]).delete()
        restored = restore_books(keys)
        self.stdout.write(f'Removed {len(orphans)} records; {restored} records entered from swims on file '
                          f'across {len(keys)} record books.')
