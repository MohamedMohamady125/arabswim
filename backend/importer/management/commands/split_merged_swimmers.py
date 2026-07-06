"""Split swimmer profiles that merged two same-named athletes.

Detection: within a single championship, one swimmer record holds results
in mutually exclusive age categories (e.g. 'Cadets' AND 'Minimes', or
'13-14' AND '15-16'). One athlete cannot be in two exclusive bands at the
same meet, so those results belong to different people who share a name.

Repair: results are clustered by compatible age band (only meets close in
time to a conflicted meet are touched — categories legitimately change as
an athlete ages). The largest cluster keeps the original swimmer; each
other cluster gets a new swimmer record with the same name. Medals follow
their results. Idempotent: a clean database is left unchanged.
"""
import datetime

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from championships.models import Result
from importer.matcher import bands_conflict, category_band
from medals.models import Medal
from swimmers.models import Swimmer

WINDOW_DAYS = 400  # meets within this window of a conflict are considered


class Command(BaseCommand):
    help = 'Split swimmer profiles that merged distinct same-named athletes'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be split without changing data')

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options['dry_run']
        split_count = 0

        candidate_ids = (
            Result.objects.filter(event__is_relay=False)
            .exclude(category='')
            .values('swimmer_id', 'championship_id')
            .annotate(n=Count('category', distinct=True))
            .filter(n__gt=1)
            .values_list('swimmer_id', flat=True)
        )

        for swimmer in Swimmer.objects.filter(id__in=set(candidate_ids)):
            results = list(
                Result.objects.filter(swimmer=swimmer, event__is_relay=False)
                .select_related('championship')
            )

            # Championships where this profile holds conflicting bands
            conflict_dates = []
            by_champ = {}
            for r in results:
                by_champ.setdefault(r.championship_id, []).append(r)
            for champ_results in by_champ.values():
                bands = {category_band(r.category) for r in champ_results}
                bands.discard('')
                if any(bands_conflict(a, b) for a in bands for b in bands if a != b):
                    date = champ_results[0].championship.date
                    if date:
                        conflict_dates.append(date)
                    else:
                        conflict_dates.append(None)
            if not conflict_dates:
                continue

            def in_window(result):
                d = result.championship.date
                if d is None or None in conflict_dates:
                    return True
                return any(abs((d - cd).days) <= WINDOW_DAYS
                           for cd in conflict_dates if cd is not None)

            window = [r for r in results
                      if category_band(r.category) and in_window(r)]

            # Cluster the window's bands: bands that don't conflict stay
            # together (e.g. 'Juniors' with 'Seniors/Juniors').
            bands = sorted({category_band(r.category) for r in window})
            clusters = []
            for band in bands:
                merged_into = None
                for cluster in clusters:
                    if all(not bands_conflict(band, other) for other in cluster):
                        cluster.add(band)
                        merged_into = cluster
                        break
                if merged_into is None:
                    clusters.append({band})
            if len(clusters) <= 1:
                continue

            cluster_results = [
                [r for r in window if category_band(r.category) in cluster]
                for cluster in clusters
            ]
            order = sorted(range(len(clusters)),
                           key=lambda i: -len(cluster_results[i]))
            keep_idx = order[0]

            self.stdout.write(
                f'{swimmer.name} (#{swimmer.id}): '
                + ', '.join(
                    f"{'KEEP ' if i == keep_idx else 'SPLIT '}"
                    f"{sorted(clusters[i])} ({len(cluster_results[i])} results)"
                    for i in order))

            if dry:
                split_count += len(clusters) - 1
                continue

            for i in order[1:]:
                moved = cluster_results[i]
                new_swimmer = Swimmer.objects.create(
                    name=swimmer.name,
                    nationality=swimmer.nationality,
                    sex=swimmer.sex,
                    date_of_birth=None,
                    birth_year=None,
                )
                ids = [r.id for r in moved]
                Result.objects.filter(id__in=ids).update(swimmer=new_swimmer)
                Medal.objects.filter(result_id__in=ids).update(swimmer=new_swimmer)
                split_count += 1

        if split_count:
            verb = 'would be created' if dry else 'created'
            self.stdout.write(self.style.SUCCESS(
                f'{split_count} new swimmer profile(s) {verb} from merged records'))
        else:
            self.stdout.write('No merged swimmer profiles found')
