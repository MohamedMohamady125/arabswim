"""Repair scrambled swimmer names in a championship's results.

Some old Omega/FINA books (e.g. the 2009 FINA/Arena World Cup, Durban) were
imported with the swimmer name column mangled: the birth year was left inline
and the leading surname token rotated to the end, producing records like

    "Stefan 1981 NYSTRAND"        (should be "Stefan NYSTRAND", born 1981)
    "MILLAN Kyle 1989 MAC"        ("Kyle MAC MILLAN")
    "RENSBURG Conrad 1990 VAN"    ("Conrad VAN RENSBURG")
    "SOON QIN Johathan 1994 POH"  ("Johathan POH SOON QIN")

Each mangled row also spawned a *duplicate* swimmer record separate from the
clean one used by the finals, so a swimmer's heats and finals ended up split
across two profiles.

This command:
  1. Rewrites every scrambled (year-in-name) swimmer to canonical
     "Given SURNAME" and fills birth_year — only for swimmers referenced solely
     by the target championship (never touches cross-meet profiles).
  2. Consolidates duplicate swimmer records *within the championship* by a
     case/order-independent name key, repointing Result / Medal / Record onto a
     single keeper (a pre-existing cross-meet profile when one exists, else the
     lowest id) and deleting the emptied duplicates.

Idempotent and transaction-wrapped. Runs read-only by default; pass --apply to
commit.
"""
import re

from django.core.management.base import BaseCommand
from django.db import transaction

from championships.models import Result
from swimmers.models import Swimmer
from medals.models import Medal
from records.models import Record

YEAR_RE = re.compile(r'^(?:19|20)\d\d$')


def _is_surname_token(tok):
    """A source surname token is written all-caps (allowing hyphen/apostrophe)."""
    letters = [c for c in tok if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)


def unscramble(name):
    """(canonical_name, birth_year|None) for a possibly-scrambled name.

    Removes an inline birth year; if a year was present the leading surname
    token was rotated to the end, so rotate it back. Then split leading all-caps
    tokens as the surname and emit "Given SURNAME". Already-clean names (no year)
    are normalised to the same "Given SURNAME" order.
    """
    toks = name.replace('\xa0', ' ').split()
    year = None
    kept = []
    for t in toks:
        if year is None and YEAR_RE.match(t):
            year = int(t)
        else:
            kept.append(t)
    if not kept:
        return name.strip(), year

    if year is not None and len(kept) >= 2:
        kept = [kept[-1]] + kept[:-1]

    # Leading all-caps run = surname; the rest = given name.
    i = 0
    while i < len(kept) and _is_surname_token(kept[i]):
        i += 1
    surname, given = kept[:i], kept[i:]

    if not surname or not given:
        # "Given SURNAME" already (given leads, caps surname trails).
        j = len(kept)
        while j > 0 and _is_surname_token(kept[j - 1]):
            j -= 1
        given, surname = kept[:j], kept[j:]

    if not surname or not given:
        return ' '.join(kept), year
    return ' '.join(given + surname), year


def merge_key(name):
    """Order/case-independent identity key: (given-set, surname-set)."""
    canonical, _ = unscramble(name)
    toks = canonical.split()
    surname = tuple(sorted(t.upper() for t in toks if _is_surname_token(t)))
    given = tuple(sorted(t.upper() for t in toks if not _is_surname_token(t)))
    return given, surname


class Command(BaseCommand):
    help = 'Repair scrambled/year-in-name swimmer records for a championship.'

    def add_arguments(self, parser):
        parser.add_argument('--championship-id', type=int, default=320)
        parser.add_argument('--apply', action='store_true',
                            help='Commit changes (default is a dry run).')

    def handle(self, *args, **opts):
        champ_id = opts['championship_id']
        apply = opts['apply']

        swimmer_ids = list(
            Result.objects.filter(championship_id=champ_id)
            .values_list('swimmer_id', flat=True).distinct()
        )
        swimmers = {s.id: s for s in Swimmer.objects.filter(id__in=swimmer_ids)}

        # A swimmer is "local" if every result it has belongs to this champ.
        ext_ids = set(
            Result.objects.filter(swimmer_id__in=swimmer_ids)
            .exclude(championship_id=champ_id)
            .values_list('swimmer_id', flat=True)
        )

        self.stdout.write(
            f'Championship {champ_id}: {len(swimmer_ids)} swimmers '
            f'({len(ext_ids)} referenced outside this meet)\n')

        # ---- Phase A: rename scrambled local swimmers ----------------------
        renamed = 0
        for sid, s in swimmers.items():
            if sid in ext_ids:
                continue  # never touch cross-meet profiles
            if not re.search(r'\b(?:19|20)\d\d\b', s.name or ''):
                continue
            canonical, year = unscramble(s.name)
            changed = False
            if canonical and canonical != s.name:
                self.stdout.write(f'  rename  {sid}: {s.name!r} -> {canonical!r}')
                s.name = canonical
                changed = True
            if year and not s.birth_year and not s.date_of_birth:
                s.birth_year = year
                changed = True
            if changed:
                renamed += 1
                if apply:
                    s.save(update_fields=['name', 'birth_year'])

        # ---- Phase B: merge duplicates within the championship -------------
        groups = {}
        for sid, s in swimmers.items():
            groups.setdefault(merge_key(s.name), []).append(sid)

        merged = 0
        deleted = 0
        for key, ids in groups.items():
            if len(ids) < 2:
                continue
            # Keeper: prefer a cross-meet profile, else the lowest id.
            ext = [i for i in ids if i in ext_ids]
            keeper = min(ext) if ext else min(ids)
            dups = [i for i in ids if i != keeper]
            self.stdout.write(
                f'  merge   {[swimmers[i].name for i in ids]} '
                f'ids={ids} -> keep {keeper} ({swimmers[keeper].name!r})')
            for d in dups:
                if d in ext_ids:
                    # Safety: never delete a profile used by other meets.
                    self.stdout.write(f'    SKIP delete {d} (used outside meet)')
                    continue
                if apply:
                    Result.objects.filter(swimmer_id=d).update(swimmer_id=keeper)
                    Medal.objects.filter(swimmer_id=d).update(swimmer_id=keeper)
                    Record.objects.filter(swimmer_id=d).update(swimmer_id=keeper)
                    Swimmer.objects.filter(id=d).delete()
                merged += 1
                deleted += 1

        summary = (f'\nRenamed {renamed} swimmer(s); merged {merged} duplicate(s) '
                   f'(deleted {deleted} record(s)).')
        if apply:
            self.stdout.write(self.style.SUCCESS(summary + ' [APPLIED]'))
        else:
            self.stdout.write(self.style.WARNING(summary + ' [DRY RUN — rerun with --apply]'))

    def execute(self, *args, **options):
        # Wrap the whole run so a dry run rolls back and an apply is atomic.
        with transaction.atomic():
            super().execute(*args, **options)
            if not options.get('apply'):
                transaction.set_rollback(True)
