"""Enforce the strict nationality rule across every already-imported meet.

The rule: a result's flag is only ever the nationality the file stated or the
one already known for that athlete — never a guess. Concretely:

  * If a meet's file carried nationalities, every result already got one at
    import time.
  * If it did not, results are left blank UNLESS the athlete's nationality is
    known from their DB profile (i.e. it was stated in some other meet / data),
    in which case the flag is shown for them; everyone else stays blank.

This command backfills the second case for meets imported before the rule was
fully applied. It ONLY fills blanks (nationality IS NULL); it never overwrites a
value the file stamped or an admin set. Manually-edited results are skipped.
Per-swimmer nationality-change history is honoured, so a swim carries the
country the athlete represented on the meet's date.

Read-only by default; pass --apply to commit.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from championships.models import Result
from swimmers.models import Swimmer


class Command(BaseCommand):
    help = 'Backfill blank result nationalities from each swimmer\'s known nationality.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Commit changes (default is a dry run).')

    def handle(self, *args, **opts):
        apply = opts['apply']

        # Swimmers with a known nationality that have at least one blank,
        # non-manual result. These are the only ones we can fill without
        # guessing — the country comes straight off their profile/timeline.
        swimmer_ids = list(
            Result.objects.filter(
                nationality__isnull=True,
                manually_edited=False,
                swimmer__nationality__isnull=False,
            ).values_list('swimmer_id', flat=True).distinct()
        )

        filled = 0
        affected_swimmers = 0
        for sid in swimmer_ids:
            swimmer = Swimmer.objects.get(id=sid)
            changes = list(swimmer.nationality_changes.order_by('effective_date', 'id'))

            def country_at(meet_date):
                if not changes or meet_date is None:
                    return swimmer.nationality_id
                country_id = swimmer.nationality_id  # after the last change
                for ch in changes:
                    if meet_date < ch.effective_date:
                        return ch.from_country_id or swimmer.nationality_id
                    country_id = ch.to_country_id
                return country_id

            blanks = list(
                Result.objects.filter(
                    swimmer_id=sid, nationality__isnull=True, manually_edited=False,
                ).select_related('championship')
            )
            to_update = []
            for r in blanks:
                cid = country_at(r.championship.date)
                if cid is not None:
                    r.nationality_id = cid
                    to_update.append(r)
            if to_update:
                affected_swimmers += 1
                filled += len(to_update)
                if apply:
                    Result.objects.bulk_update(to_update, ['nationality'])

        summary = (f'Filled {filled} blank result(s) across '
                   f'{affected_swimmers} swimmer(s).')
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
