"""Repair meet end_dates that are a month/day transposition of the start.

A batch of meets were stored with an end_date whose month and day are
swapped relative to the start date (e.g. start 2026-06-12, end 2026-12-06).
This produces impossible meet windows: multi-month spans that drive the
/live "Day 126 of 178" counter and make the meet wrongly match the
live-now date window. The true end date is unrecoverable from the swapped
value, so these are reset to the start date (single-day meet).

Only rows whose end_date is EXACTLY the transposition of the start are
touched, so no legitimate multi-day meet is affected. Dry run by default.
"""
from django.core.management.base import BaseCommand
from championships.models import Championship


def is_transposed(start, end):
    """True if end is the month/day swap of start (and that swap is valid)."""
    if not start or not end:
        return False
    if end.year != start.year or end.month == end.day:
        return False
    return end.month == start.day and end.day == start.month


class Command(BaseCommand):
    help = 'Reset meet end_dates that are a month/day transposition of the start date.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Write changes (default is a dry run).')

    def handle(self, *args, **opts):
        apply = opts['apply']
        changed = 0
        for champ in Championship.objects.exclude(end_date__isnull=True).only(
                'id', 'name', 'date', 'end_date'):
            if not is_transposed(champ.date, champ.end_date):
                continue
            changed += 1
            self.stdout.write(
                f'  {champ.id} {champ.name!r}: end {champ.end_date} -> {champ.date}')
            if apply:
                champ.end_date = champ.date
                champ.save(update_fields=['end_date'])
        verb = 'Updated' if apply else 'Would update'
        self.stdout.write(self.style.SUCCESS(f'{verb} {changed} meet(s).'))
