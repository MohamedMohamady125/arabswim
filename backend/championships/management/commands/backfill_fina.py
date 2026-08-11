from django.core.management.base import BaseCommand

from championships.models import Result
from importer.points import calculate_points


class Command(BaseCommand):
    help = ('Backfill missing FINA points: recompute fina_points from World '
            'Aquatics base times for every timed result that has none. '
            'Optionally limit to one championship with --championship <id>.')

    def add_arguments(self, parser):
        parser.add_argument('--championship', type=int)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        qs = (Result.objects
              .filter(fina_points__isnull=True, time_centiseconds__gt=0)
              .select_related('event', 'swimmer', 'championship'))
        if opts.get('championship'):
            qs = qs.filter(championship_id=opts['championship'])
        total = qs.count()
        self.stdout.write(f'{total} timed results without FINA points')
        filled = 0
        for r in qs.iterator():
            gender = r.swimmer.sex if r.swimmer else 'M'
            pool = r.championship.pool if r.championship else 'LCM'
            pts = calculate_points(r.time_centiseconds, r.event.name, gender, pool)
            if pts and pts > 0:
                filled += 1
                if not opts['dry_run']:
                    r.fina_points = pts
                    r.save(update_fields=['fina_points'])
        verb = 'Would fill' if opts['dry_run'] else 'Filled'
        self.stdout.write(self.style.SUCCESS(f'{verb} {filled} of {total}'))
