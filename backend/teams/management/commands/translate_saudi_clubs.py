"""Replace Saudi club codes / Arabic names with full English names.

Reads a CSV mapping (default: saudi_clubs_english.csv at the repo root) with
columns `arabic_or_code,english_name`. Every Team, Result.team string and
Swimmer.club string whose value matches one of the CSV keys is switched to the
full English name. Because several source codes map to the same club
(e.g. HIL + HILAL -> Al-Hilal), Team records that collapse to one English name
are MERGED into a single keeper (reusing teams.utils.merge_team_records); the
survivor is renamed with teams.utils.rename_team so the Result/Swimmer club
strings stay in sync.

Only Saudi data is touched (teams in KSA; results in Saudi meets or swum by
Saudi athletes; Saudi swimmers' club field) so a 3-letter code can't collide
with another country's club.

Dry-run by default. Pass --apply to write.

Usage:
    DEBUG=True SECRET_KEY=audit .venv/bin/python manage.py translate_saudi_clubs
    DEBUG=True SECRET_KEY=audit .venv/bin/python manage.py translate_saudi_clubs --apply
"""
import csv
import os
from collections import defaultdict

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from teams.models import Team
from teams.utils import merge_team_records, rename_team
from championships.models import Result
from swimmers.models import Swimmer
from core.models import Country


def _norm(v):
    return (v or '').strip()


class Command(BaseCommand):
    help = 'Replace Saudi club codes/Arabic names with full English names.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Write changes. Without this flag it is a dry run.')
        parser.add_argument('--csv', default='',
                            help='Path to the mapping CSV (default: <repo>/saudi_clubs_english.csv).')

    # ---- CSV ----------------------------------------------------------------
    def _load_mapping(self, path):
        """Return {lookup_key: english_name}. Keys indexed raw-stripped and
        casefolded so both Arabic strings and latin codes match regardless of
        case."""
        mapping = {}
        with open(path, encoding='utf-8-sig', newline='') as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                key = _norm(row.get('arabic_or_code'))
                eng = _norm(row.get('english_name'))
                if not key or not eng:
                    continue
                mapping[key] = eng
                mapping[key.casefold()] = eng
        return mapping

    def _lookup(self, mapping, value):
        s = _norm(value)
        if not s:
            return None
        return mapping.get(s) or mapping.get(s.casefold())

    # ---- main ---------------------------------------------------------------
    def handle(self, *args, **opts):
        apply = opts['apply']
        path = opts['csv'] or os.path.join(
            os.path.dirname(settings.BASE_DIR), 'saudi_clubs_english.csv')
        if not os.path.exists(path):
            # settings.BASE_DIR may already be the repo root in some layouts
            alt = os.path.join(settings.BASE_DIR, 'saudi_clubs_english.csv')
            path = alt if os.path.exists(alt) else path
        self.stdout.write(f'Mapping CSV: {path}')
        mapping = self._load_mapping(path)
        self.stdout.write(f'Mapping entries (incl. casefold): {len(mapping)}')

        ksa = Country.objects.filter(code__iexact='KSA').first()
        if not ksa:
            self.stderr.write('No KSA country found — aborting.')
            return

        # === 1. TEAM records: group KSA teams by their target English name ===
        ksa_teams = list(Team.objects.filter(country=ksa))
        groups = defaultdict(list)       # english -> [Team]
        unmatched_teams = []
        for t in ksa_teams:
            eng = self._lookup(mapping, t.name)
            if eng:
                groups[eng].append(t)
            else:
                unmatched_teams.append(t.name)

        # Fold in any team already literally named the English target so we
        # merge into it rather than hit the unique-name constraint.
        for eng in list(groups.keys()):
            existing = Team.objects.filter(country=ksa, name__iexact=eng).exclude(
                id__in=[t.id for t in groups[eng]])
            for t in existing:
                groups[eng].append(t)

        def _score(team):
            # Richest keeper: has logo, then more profile fields filled, then
            # name already English, then lowest id (stable).
            filled = sum(bool(getattr(team, f)) for f in
                         ('logo', 'banner', 'founded_year', 'description',
                          'website', 'address', 'email', 'phone'))
            name_is_eng = team.name.strip().casefold() == \
                (self._lookup(mapping, team.name) or '').casefold() \
                and not any(ord(c) > 0x5FF for c in team.name)
            return (1 if team.logo else 0, filled, 1 if name_is_eng else 0, -team.id)

        renames = []     # (old_name, english)
        merges = []       # (english, [loser_names], keeper_name)
        for eng, members in groups.items():
            keeper = max(members, key=_score)
            losers = [t for t in members if t.id != keeper.id]
            if keeper.name != eng:
                renames.append((keeper.name, eng))
            if losers:
                merges.append((eng, [l.name for l in losers], keeper.name))

        # FKs that would CASCADE-delete on a loser merge — re-point first.
        from teams.models import Trophy, TrainingSession, BoardMember
        from news.models import Article
        from media_app.models import Album
        from coaches.models import Coach

        def _repoint_fks(keep, remove):
            n = 0
            n += TrainingSession.objects.filter(team=remove).update(team=keep)
            n += BoardMember.objects.filter(team=remove).update(team=keep)
            n += Article.objects.filter(team=remove).update(team=keep)
            n += Album.objects.filter(team=remove).update(team=keep)
            n += Coach.objects.filter(team=remove).update(team=keep)
            return n

        # === 2. Build the Result.team / Swimmer.club sweep (Saudi-scoped) ====
        # Distinct club strings that appear on Saudi-context results.
        result_scope = Result.objects.filter(
            Q(championship__country=ksa) | Q(swimmer__nationality=ksa))
        res_values = (result_scope.exclude(team='')
                      .values_list('team', flat=True).distinct())
        res_updates = {}   # old -> english
        for v in res_values:
            eng = self._lookup(mapping, v)
            if eng and _norm(v) != eng:
                res_updates[v] = eng

        club_values = (Swimmer.objects.filter(nationality=ksa)
                       .exclude(club='').values_list('club', flat=True).distinct())
        club_updates = {}
        for v in club_values:
            eng = self._lookup(mapping, v)
            if eng and _norm(v) != eng:
                club_updates[v] = eng

        # === Report ==========================================================
        self.stdout.write('')
        self.stdout.write(f'KSA teams: {len(ksa_teams)}  '
                          f'(matched groups: {len(groups)}, unmatched: {len(unmatched_teams)})')
        self.stdout.write(f'Team renames: {len(renames)}')
        for old, eng in sorted(renames)[:60]:
            self.stdout.write(f'    {old!r}  ->  {eng!r}')
        self.stdout.write(f'Team merges (collapsing duplicates): {len(merges)}')
        for eng, losers, keeper in sorted(merges):
            self.stdout.write(f'    {eng!r}  <=  keeper {keeper!r} + {losers}')
        self.stdout.write(f'\nResult.team string updates (distinct values): {len(res_updates)}')
        for old, eng in sorted(res_updates.items())[:60]:
            self.stdout.write(f'    {old!r}  ->  {eng!r}')
        self.stdout.write(f'Swimmer.club string updates (distinct values): {len(club_updates)}')
        if unmatched_teams:
            self.stdout.write(self.style.WARNING(
                f'\nUnmatched KSA teams (left as-is): {sorted(unmatched_teams)}'))

        if not apply:
            self.stdout.write(self.style.WARNING(
                '\nDRY RUN — nothing written. Re-run with --apply to write.'))
            return

        # === Apply ===========================================================
        with transaction.atomic():
            # Merges first (re-point FKs, then canonical merge), then rename keeper.
            for eng, _loser_names, _keeper_name in merges:
                members = groups[eng]
                keeper = max(members, key=_score)
                keeper = Team.objects.get(id=keeper.id)
                for m in members:
                    if m.id == keeper.id:
                        continue
                    remove = Team.objects.get(id=m.id)
                    _repoint_fks(keeper, remove)
                    merge_team_records(keeper, remove)
            # Renames (keeper may have been the only member — rename it).
            for eng in groups:
                members = Team.objects.filter(country=ksa, name__iexact=eng)
                # After merges, there should be exactly one; rename any code-named
                # survivor to the English target.
                survivors = list(Team.objects.filter(
                    id__in=[t.id for t in groups[eng]]))
                for s in survivors:
                    fresh = Team.objects.filter(id=s.id).first()
                    if fresh and fresh.name != eng:
                        rename_team(fresh, eng)

            # Sweep remaining Result.team / Swimmer.club strings (values with no
            # Team record, or Arabic result strings on a code-named team).
            res_done = 0
            for old, eng in res_updates.items():
                res_done += result_scope.filter(team=old).update(team=eng)
            club_done = 0
            for old, eng in club_updates.items():
                club_done += (Swimmer.objects.filter(nationality=ksa, club=old)
                              .update(club=eng))
            # Relay placeholder swimmer names (Saudi) matching a key.
            relay_done = 0
            for old, eng in {**res_updates, **club_updates}.items():
                relay_done += (Swimmer.objects.filter(
                    is_relay_team=True, nationality=ksa, name=old).update(name=eng))

        self.stdout.write(self.style.SUCCESS(
            f'\nAPPLIED. result rows={res_done}, swimmer.club rows={club_done}, '
            f'relay placeholders={relay_done}'))
