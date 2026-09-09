"""Enforce the identity rule "nationality is part of who the athlete is".

An athlete who competed for two countries (e.g. Wales in some meets and Great
Britain in others) must not live on one merged profile that shows a single
flag. Each nationality is its own account, and every swim is filed under the
account whose nationality matches what the file stated for that meet.

Historically the importer kept one profile and switched its nationality on the
most recent meet, so older profiles ended up owning results under several
countries (Result.nationality already records the country each swim counted
for). This command splits those profiles:

  * The profile keeps its current nationality's swims (and any nationality-less
    swims). If the profile has no nationality, it adopts its most common one.
  * For every other nationality found among its results, a sibling profile with
    the same name/birth-year/sex is created (or reused) under that country, and
    the matching results — plus their medals and records — are moved onto it.
  * Stale NationalityChange rows are removed: each profile is now single-country.

Only splits by nationalities the files themselves recorded — nothing is
invented. Read-only by default; pass --apply to commit.
"""
from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from championships.models import Result
from swimmers.models import Swimmer, NationalityChange
from medals.models import Medal
from records.models import Record


class Command(BaseCommand):
    help = "Split profiles that own results under multiple nationalities."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Commit changes (default is a dry run).')
        parser.add_argument('--swimmer-id', type=int, default=None,
                            help='Restrict to a single swimmer (debugging).')

    def handle(self, *args, **opts):
        apply = opts['apply']

        base = Result.objects.filter(
            nationality__isnull=False, swimmer__is_relay_team=False)
        if opts['swimmer_id']:
            base = base.filter(swimmer_id=opts['swimmer_id'])

        multi_ids = list(
            base.values('swimmer_id')
            .annotate(n=Count('nationality_id', distinct=True))
            .filter(n__gt=1)
            .values_list('swimmer_id', flat=True)
        )

        self.stdout.write(
            f'{len(multi_ids)} profile(s) own results under >1 nationality.\n')

        siblings_created = 0
        results_moved = 0
        medals_moved = 0
        records_moved = 0

        for sid in multi_ids:
            keeper = Swimmer.objects.get(id=sid)
            res = list(Result.objects.filter(
                swimmer=keeper, nationality__isnull=False)
                .values_list('id', 'nationality_id'))
            counts = Counter(nat for _, nat in res)

            # Keeper retains its profile nationality if that is among the
            # result countries; otherwise its most common one (and adopts it).
            if keeper.nationality_id in counts:
                keeper_nat = keeper.nationality_id
            else:
                keeper_nat = counts.most_common(1)[0][0]
                if keeper.nationality_id != keeper_nat:
                    if apply:
                        keeper.nationality_id = keeper_nat
                        keeper.save(update_fields=['nationality'])

            others = [nat for nat in counts if nat != keeper_nat]
            keeper_codes = _code(keeper_nat)
            self.stdout.write(
                f'  {keeper.id} {keeper.name!r}: keep {keeper_codes} '
                f'({counts[keeper_nat]}), split '
                + ', '.join(f'{_code(n)}({counts[n]})' for n in others))

            for nat in others:
                move_ids = [rid for rid, n in res if n == nat]

                sibling = Swimmer.objects.filter(
                    name__iexact=keeper.name, is_relay_team=False,
                    nationality_id=nat,
                    birth_year=keeper.birth_year,
                ).exclude(id=keeper.id).first()
                if not sibling:
                    if apply:
                        sibling = Swimmer.objects.create(
                            name=keeper.name,
                            date_of_birth=keeper.date_of_birth,
                            birth_year=keeper.birth_year,
                            nationality_id=nat,
                            sex=keeper.sex,
                            club=keeper.club,
                        )
                    siblings_created += 1

                sib_id = sibling.id if sibling else '(new)'
                self.stdout.write(
                    f'      -> {_code(nat)} profile {sib_id}: '
                    f'{len(move_ids)} result(s)')

                results_moved += len(move_ids)
                m_by_result = Medal.objects.filter(
                    swimmer=keeper, result_id__in=move_ids).count()
                m_standalone = Medal.objects.filter(
                    swimmer=keeper, result__isnull=True,
                    nationality_id=nat).count()
                r_moved = Record.objects.filter(
                    swimmer=keeper, result_id__in=move_ids).count()
                medals_moved += m_by_result + m_standalone
                records_moved += r_moved

                if apply:
                    Result.objects.filter(id__in=move_ids).update(swimmer=sibling)
                    Medal.objects.filter(
                        swimmer=keeper, result_id__in=move_ids).update(
                        swimmer=sibling, nationality_id=nat)
                    Medal.objects.filter(
                        swimmer=keeper, result__isnull=True,
                        nationality_id=nat).update(swimmer=sibling)
                    Record.objects.filter(
                        swimmer=keeper, result_id__in=move_ids).update(
                        swimmer=sibling)

            # Each profile is now single-country: drop stale change history so a
            # later restamp can't re-derive a wrong per-result nationality.
            if apply:
                NationalityChange.objects.filter(swimmer=keeper).delete()

        summary = (
            f'\nCreated {siblings_created} sibling profile(s); moved '
            f'{results_moved} result(s), {medals_moved} medal(s), '
            f'{records_moved} record(s).')
        if apply:
            self.stdout.write(self.style.SUCCESS(summary + ' [APPLIED]'))
        else:
            self.stdout.write(self.style.WARNING(
                summary + ' [DRY RUN — rerun with --apply]'))

    def execute(self, *args, **options):
        with transaction.atomic():
            super().execute(*args, **options)
            if not options.get('apply'):
                transaction.set_rollback(True)


_code_cache = {}


def _code(country_id):
    if country_id not in _code_cache:
        from core.models import Country
        c = Country.objects.filter(id=country_id).first()
        _code_cache[country_id] = c.code if c else str(country_id)
    return _code_cache[country_id]
