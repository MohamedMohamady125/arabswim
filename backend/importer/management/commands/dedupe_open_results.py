"""Remove open-classification duplicate results from already-imported meets.

Egyptian Hy-Tek exports publish each swim twice: once in its age-group
event and once in an 'Open' classification of the same race (same swimmer,
same time). New imports drop the open copies at parse time
(drop_open_classification_duplicates); this command cleans up meets that
were imported before the fix.

For each duplicated (swimmer, event, round, time) within a championship,
keeps the age-group copy and deletes the open-classification one(s).
Championships that had open duplicates get has_open_podium=True and their
medals recomputed, so open podiums survive as OPEN-scope medals.
"""
import re
from collections import defaultdict

from django.core.management.base import BaseCommand

from championships.models import Championship, Result
from medals.utils import recompute_medals

OPEN_CATEGORY_RE = re.compile(r'&\s*O(?:ver)?\b|\bOpen\b', re.IGNORECASE)


class Command(BaseCommand):
    help = ('Delete open-classification duplicate results (same swimmer, '
            'event, round and time as an age-group row) and recompute '
            'medals with has_open_podium enabled.')

    def add_arguments(self, parser):
        parser.add_argument('--championship', type=int)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        champs = Championship.objects.all()
        if opts.get('championship'):
            champs = champs.filter(id=opts['championship'])

        total_deleted = 0
        for champ in champs.iterator():
            rows = (Result.objects
                    .filter(championship=champ, is_manual=False,
                            time_centiseconds__gt=0)
                    .values_list('id', 'swimmer_id', 'event_id',
                                 'round_type', 'time_centiseconds',
                                 'category'))
            groups = defaultdict(list)
            for rid, sid, eid, rnd, t, cat in rows:
                groups[(sid, eid, rnd, t)].append((rid, cat or ''))

            to_delete = []
            open_seen = False
            for dup_rows in groups.values():
                if len(dup_rows) < 2:
                    continue
                open_rows = [r for r in dup_rows if OPEN_CATEGORY_RE.search(r[1])]
                aged_rows = [r for r in dup_rows if not OPEN_CATEGORY_RE.search(r[1])]
                if not open_rows or not aged_rows:
                    continue  # not the open/age-group pattern — leave alone
                open_seen = True
                to_delete.extend(rid for rid, _ in open_rows)

            if not to_delete:
                continue
            total_deleted += len(to_delete)
            self.stdout.write(
                f'{champ.name} (id={champ.id}): '
                f'{len(to_delete)} open duplicates'
                f'{" (dry run)" if opts["dry_run"] else ""}')
            if opts['dry_run']:
                continue
            Result.objects.filter(id__in=to_delete).delete()
            if open_seen and not champ.has_open_podium:
                champ.has_open_podium = True
                champ.save(update_fields=['has_open_podium'])
            awarded = recompute_medals(champ)
            self.stdout.write(f'  medals recomputed: {awarded}')

        verb = 'Would delete' if opts['dry_run'] else 'Deleted'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {total_deleted} open-classification duplicates'))
