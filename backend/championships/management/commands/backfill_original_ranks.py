"""Recover each result's original rank from the championship's stored PDF.

Medals used to be recomputed purely from the times remaining in the
database, so deleting non-Arab swimmers from an international meet
promoted the remaining Arab swimmers onto the podium. The source PDF's
placement is authoritative: this command re-parses every stored meet PDF,
matches parsed results to DB rows (event + round + category + time) and
stores the source rank in Result.original_rank. recompute_medals() then
awards medals from that rank, so a swimmer who placed 5th stays 5th no
matter who was deleted.

Idempotent and cheap on later runs: championships that already carry
original_rank values are skipped (use --force to redo them).
"""
from django.core.management.base import BaseCommand

from championships.models import Championship, Result
from medals.utils import recompute_medals


class Command(BaseCommand):
    help = "Backfill Result.original_rank from stored meet PDFs and re-award medals"

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Re-process championships that already have original ranks')
        parser.add_argument('--championship', type=int, default=None,
                            help='Only process this championship id')

    def handle(self, *args, **options):
        from importer.services import parse_file, source_rank, _find_event
        from core.models import Event

        qs = Championship.objects.exclude(pdf_file='').exclude(pdf_file__isnull=True)
        if options['championship']:
            qs = qs.filter(id=options['championship'])

        processed = skipped = failed = 0
        for champ in qs.order_by('id'):
            if not options['force'] and champ.results.filter(
                    original_rank__isnull=False).exists():
                skipped += 1
                continue
            try:
                path = champ.pdf_file.path
            except (ValueError, NotImplementedError):
                path = None
            import os
            if not path or not os.path.exists(path):
                self.stdout.write(f'  [{champ.id}] {champ.name}: PDF missing on disk, skipped')
                skipped += 1
                continue

            try:
                previews = parse_file(file_path=path)
            except Exception as e:  # noqa: BLE001 — one bad PDF must not stop the run
                self.stdout.write(self.style.WARNING(
                    f'  [{champ.id}] {champ.name}: parse failed ({e})'))
                failed += 1
                continue
            if isinstance(previews, list):
                # Multi-meet Excel file: pick the sheet matching this meet
                match = [p for p in previews
                         if (p.get('meet', {}).get('name') or '').strip().casefold()
                         == champ.name.strip().casefold()]
                if len(match) != 1:
                    self.stdout.write(f'  [{champ.id}] {champ.name}: ambiguous multi-meet file, skipped')
                    skipped += 1
                    continue
                preview = match[0]
            else:
                preview = previews

            event_cache = {e.name.upper(): e for e in Event.objects.all()}
            updated = 0
            for event_data in preview.get('events', []):
                db_event = _find_event(event_data, event_cache)
                if not db_event:
                    continue
                round_type = event_data.get('round_type', '') or ''
                for result_data in event_data.get('results', []):
                    rank = source_rank(result_data.get('rank'))
                    if not rank:
                        continue
                    category = (result_data.get('category', '')
                                or event_data.get('age_group', '') or '')
                    updated += Result.objects.filter(
                        championship=champ,
                        event=db_event,
                        round_type=round_type,
                        category=category,
                        time_centiseconds=result_data.get('time_centiseconds') or 0,
                        original_rank__isnull=True,
                    ).update(original_rank=rank)
            if updated:
                recompute_medals(champ)
            self.stdout.write(f'  [{champ.id}] {champ.name}: {updated} ranks recovered')
            processed += 1

        self.stdout.write(self.style.SUCCESS(
            f'Done — {processed} processed, {skipped} skipped, {failed} failed'))
