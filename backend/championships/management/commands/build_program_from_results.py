"""Synthesize a day-by-day program for meets whose source files carried no
per-event session dates (the majority), so their Program tab is empty.

Programs are normally created during import from event `session_date` values
(importer/services.py). Most source files don't have them, so most meets show
no program at all. This command backfills a program straight from the results
already stored: for every championship that HAS results but ZERO program
items, it emits one ProgramItem per distinct (event, gender, session) seen in
the results — session mapped from round_type (Heats/Prelims -> HEATS,
Semis -> SEMIS, Finals/Consolation -> FINALS).

Day is 1 for every line: the results don't tell us which calendar day an
event was swum, so we don't invent one. The public program still renders the
full event list grouped by session, with each line linking to its results.

Idempotent and safe:
  * Only touches meets with results and no existing program, so real
    session-date programs and any admin-entered program are never altered.
  * get_or_create on the full unique key, so re-running adds nothing.

    python manage.py build_program_from_results            # all eligible meets
    python manage.py build_program_from_results --champ 314 # one meet
    python manage.py build_program_from_results --dry-run
"""
from django.core.management.base import BaseCommand

from championships.models import Championship, ProgramItem
from importer.services import ROUND_TO_SESSION


class Command(BaseCommand):
    help = 'Build a program from imported results for meets that have none.'

    def add_arguments(self, parser):
        parser.add_argument('--champ', type=int,
                            help='Only this championship id.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be created, change nothing.')

    def handle(self, *args, **opts):
        from importer.parsers.base import is_relay_event

        qs = Championship.objects.all().order_by('id')
        if opts['champ']:
            qs = qs.filter(id=opts['champ'])

        total_meets = total_items = 0
        for champ in qs:
            if champ.program_items.exists():
                continue
            if not champ.results.exists():
                continue

            # Distinct (event, gender, session) in event order. Keep the first
            # occurrence's order so the program follows the event sequence.
            seen = {}
            order_counter = 0
            results = (champ.results
                       .select_related('event', 'swimmer')
                       .order_by('event_id', 'id'))
            for r in results:
                if not r.event_id:
                    continue
                ev_name = r.event.name or ''
                relay = is_relay_event(ev_name) or (
                    r.swimmer.is_relay_team if r.swimmer_id else False)
                if relay and 'mixed' in ev_name.lower():
                    gender = 'X'
                elif r.swimmer_id and r.swimmer.sex in ('M', 'F'):
                    gender = r.swimmer.sex
                else:
                    gender = 'X'
                session = ROUND_TO_SESSION.get(r.round_type or '', '')
                key = (r.event_id, gender, session)
                if key in seen:
                    continue
                seen[key] = order_counter
                order_counter += 1

            if not seen:
                continue

            total_meets += 1
            made = 0
            for (event_id, gender, session), order in seen.items():
                if opts['dry_run']:
                    made += 1
                    continue
                _, created = ProgramItem.objects.get_or_create(
                    championship=champ, day=1, event_id=event_id,
                    gender=gender, session=session, age_category='',
                    time_of_day='', defaults={'order': order},
                )
                if created:
                    made += 1
            total_items += made
            self.stdout.write(
                f'  [{champ.id}] {champ.name}: +{made} program lines')

        verb = 'would create' if opts['dry_run'] else 'created'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {total_items} program lines across {total_meets} meets.'))
