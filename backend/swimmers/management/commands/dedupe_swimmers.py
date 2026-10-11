"""Bulk-merge duplicate swimmer profiles (same person imported many times).

Conservative, auto-safe criteria — two profiles merge only when ALL hold:
  * same nationality (a same-named athlete under a different country is a
    different person; profiles with NO nationality stay out of cross-country
    merges — they only merge with each other),
  * same normalized name (case/punctuation/word-order insensitive),
  * birth-year compatible: identical birth year, OR one side has no birth
    year AND the group has exactly one distinct birth year (unambiguous).

Profiles with the same name+nationality but *different* birth years are left
alone (two different kids who share a name), matching the app's own
duplicate rules. The merge itself reuses importer.matcher.merge_swimmers,
which drops exact-duplicate results/medals/records and re-points the rest.

Keeper selection: the profile with the most results wins (then the fullest
name, then the lowest id) so the surviving profile is the richest one.

Dry-run by default. Pass --apply to write. Optional --country CODE to scope.

Usage:
    DEBUG=True SECRET_KEY=audit .venv/bin/python manage.py dedupe_swimmers
    DEBUG=True SECRET_KEY=audit .venv/bin/python manage.py dedupe_swimmers --country KSA --apply
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from swimmers.models import Swimmer
from importer.matcher import normalize_for_matching, merge_swimmers, invalidate_norm_cache


def _by(s):
    if s.birth_year:
        return s.birth_year
    if s.date_of_birth:
        return s.date_of_birth.year
    return None


def _clusters_for_group(members):
    """Split one (nationality, name) group into merge clusters.

    Returns a list of lists, each list being >=2 profiles that are the same
    person. Profiles whose birth year is incompatible with the rest are
    excluded.
    """
    buckets = defaultdict(list)   # birth_year -> [swimmer]
    no_by = []
    for s in members:
        by = _by(s)
        (buckets[by] if by else no_by).append(s)

    clusters = []
    if not buckets:
        # Nobody has a birth year — the whole group is one cluster.
        if len(no_by) > 1:
            clusters.append(no_by)
    elif len(buckets) == 1:
        # Exactly one birth year present — the no-birth-year profiles are
        # unambiguously the same person, so fold them in.
        only = next(iter(buckets.values()))
        merged = only + no_by
        if len(merged) > 1:
            clusters.append(merged)
    else:
        # Multiple distinct birth years — ambiguous. Merge within each
        # birth-year bucket only; leave the no-birth-year profiles untouched.
        for b in buckets.values():
            if len(b) > 1:
                clusters.append(b)
    return clusters


def _keeper(cluster, result_counts):
    """Richest profile: most results, then fullest name, then lowest id."""
    return max(cluster, key=lambda s: (
        result_counts.get(s.id, 0), len(s.name or ''), -s.id))


class Command(BaseCommand):
    help = 'Merge duplicate swimmer profiles (same name + nationality + compatible birth year).'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Write merges. Without this flag it is a dry run.')
        parser.add_argument('--country', default='',
                            help='Restrict to one nationality by country code (e.g. KSA, EGY).')
        parser.add_argument('--limit', type=int, default=0,
                            help='Stop after merging this many profiles (0 = no limit).')

    def handle(self, *args, **opts):
        apply = opts['apply']
        code = (opts['country'] or '').strip().upper()
        limit = opts['limit']

        qs = Swimmer.objects.filter(is_relay_team=False)
        if code:
            qs = qs.filter(nationality__code__iexact=code)

        members = list(qs.only('id', 'name', 'birth_year', 'date_of_birth',
                               'nationality_id'))
        self.stdout.write(f'Swimmers in scope: {len(members)}'
                          + (f'  (country={code})' if code else ''))

        groups = defaultdict(list)
        for s in members:
            key = (s.nationality_id,
                   ' '.join(sorted(normalize_for_matching(s.name).split())))
            groups[key].append(s)

        clusters = []
        for g in groups.values():
            if len(g) > 1:
                clusters.extend(_clusters_for_group(g))

        redundant = sum(len(c) - 1 for c in clusters)
        self.stdout.write(f'Merge clusters: {len(clusters)}')
        self.stdout.write(f'Profiles that will be removed (merged away): {redundant}')

        # Per-country breakdown of the removals.
        from core.models import Country
        cname = {c.id: c.code for c in Country.objects.all()}
        by_country = defaultdict(int)
        for c in clusters:
            by_country[cname.get(c[0].nationality_id, '??')] += len(c) - 1
        self.stdout.write('  by nationality: ' + ', '.join(
            f'{k}={v}' for k, v in sorted(by_country.items(), key=lambda x: -x[1])))

        # A few example clusters so a mis-group is obvious before writing.
        self.stdout.write('\n--- sample clusters (up to 15) ---')
        for c in clusters[:15]:
            names = ', '.join(f'{s.name!r}#{s.id}(by={_by(s)})' for s in c[:6])
            self.stdout.write(f'  [{len(c)}] {names}')

        if not apply:
            self.stdout.write(self.style.WARNING(
                '\nDRY RUN — nothing written. Re-run with --apply to merge.'))
            return

        # Result counts only for the profiles we are about to touch.
        ids = [s.id for c in clusters for s in c]
        result_counts = dict(
            Swimmer.objects.filter(id__in=ids)
            .annotate(n=Count('results')).values_list('id', 'n'))

        merged_count = 0
        for cluster in clusters:
            keeper = _keeper(cluster, result_counts)
            losers = [s for s in cluster if s.id != keeper.id]
            with transaction.atomic():
                keep = Swimmer.objects.get(id=keeper.id)
                for loser in losers:
                    try:
                        remove = Swimmer.objects.get(id=loser.id)
                    except Swimmer.DoesNotExist:
                        continue
                    merge_swimmers(keep, remove)
                    merged_count += 1
            if limit and merged_count >= limit:
                self.stdout.write(f'  reached --limit {limit}, stopping.')
                break
            if merged_count % 500 == 0 and merged_count:
                self.stdout.write(f'  merged {merged_count}...')

        invalidate_norm_cache()
        self.stdout.write(self.style.SUCCESS(
            f'\nAPPLIED. Profiles merged away: {merged_count}'))
