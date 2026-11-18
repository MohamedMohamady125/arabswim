"""Fix automatic records filed under the wrong country.

A record made before a swimmer's nationality change was recorded kept the
old country even though the swim itself is stamped with the new one. This
walks every swimmer with such a record and runs records.sync on them.
Safe to run again: with nothing out of line it changes nothing.
"""
from django.core.management.base import BaseCommand

from records.sync import resync_swimmer_records, stale_records


class Command(BaseCommand):
    help = 'Move automatic records to the country their swim was swum for.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        from swimmers.models import Swimmer
        ids = sorted(set(stale_records().values_list('swimmer_id', flat=True)))
        if opts['dry_run']:
            for rec in stale_records().select_related('swimmer', 'country', 'result__nationality', 'event'):
                self.stdout.write(
                    f'{rec.swimmer.name}: {rec.record_type} {rec.event.name} {rec.pool} '
                    f'filed under {rec.country.code if rec.country else "-"}, '
                    f'swum for {rec.result.nationality.code}')
            self.stdout.write(f'{len(ids)} swimmer(s) with records under the wrong country')
            return
        total = {'relabelled': 0, 'removed': 0, 'created': 0}
        for s in Swimmer.objects.filter(id__in=ids):
            for k, v in resync_swimmer_records(s).items():
                total[k] += v
        self.stdout.write(
            f'record countries: {len(ids)} swimmer(s); {total["relabelled"]} relabelled, '
            f'{total["removed"]} removed from the wrong book, {total["created"]} entered in the right one')
