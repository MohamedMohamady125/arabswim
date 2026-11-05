"""Backfill lead-in split times (and the records they set) from past data.

Scans every individual result that carries splits, stores its lead-in
(from-the-start) times at shorter standard distances, then re-runs the
record check so historical first-lap swims can claim records
(user rule 2026-11-04: the first 50 of a 100 can break the 50 record).

Usage:
    python manage.py backfill_intermediate_times [--dry-run]
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Backfill intermediate (lead-in split) times and recheck records'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be stored, write nothing')

    def handle(self, *args, **opts):
        from championships.models import Result
        from records.intermediates import leading_splits_cs, sync_intermediate_times
        from records.auto import check_and_update_records

        qs = (Result.objects
              .filter(event__is_relay=False, is_hc=False,
                      time_centiseconds__gt=0)
              .exclude(splits=[]).exclude(splits__isnull=True)
              .select_related('event', 'swimmer', 'swimmer__nationality',
                              'nationality', 'championship',
                              'championship__country'))
        total = qs.count()
        stored = 0
        with_rows = 0
        records_broken = 0
        for i, r in enumerate(qs.iterator(chunk_size=500), 1):
            if opts['dry_run']:
                pairs = leading_splits_cs(r)
                if pairs:
                    with_rows += 1
                    stored += len(pairs)
                continue
            rows = sync_intermediate_times(r)
            if rows:
                with_rows += 1
                stored += len(rows)
                # Re-run the record check: the candidates list inside
                # includes the freshly stored intermediates.
                records_broken += len(check_and_update_records(r))
            if i % 500 == 0:
                self.stdout.write(f'{i}/{total} results scanned…')
        mode = 'DRY RUN — ' if opts['dry_run'] else ''
        self.stdout.write(self.style.SUCCESS(
            f'{mode}{total} results scanned, {with_rows} with usable lead-in '
            f'splits, {stored} intermediate times, '
            f'{records_broken} record entries touched'))
