"""Emit a normalized structural fingerprint of a meet, from either a source
file (parse it) or a championship (query the DB), so the two can be diffed.

Purpose: quality-audit every imported meet by comparing what the parser
extracts from the original file against what actually landed in the database.
A mismatch means the import stage lost or mangled results (a missing gender,
a dropped event, a relay that didn't store, split coverage gone).

    # what the file parses to:
    python manage.py meet_structure --file "/path/RESULTS.pdf"
    # what the DB holds:
    python manage.py meet_structure --champ 326

Both print JSON with the same shape:
  { meta: {...},
    events: { "<dist>|<stroke>|<relay>|<gender>": count, ... },
    totals: {results, relays, with_splits} }

The event key is deliberately round-agnostic and name-agnostic: it is built
from (distance, normalized stroke, relay flag, gender) so the two sides line
up even when event titles are spelled differently. Diff the two JSON blobs to
see exactly which (event, gender) buckets differ in count.
"""
import json

from django.core.management.base import BaseCommand, CommandError


def _stroke_key(name):
    from importer.parsers.base import normalize_stroke
    return (normalize_stroke(name or '') or '').lower().strip()


def _bucket_from_file(path):
    from importer.parsers.detector import detect_and_parse
    from importer.parsers.base import (
        extract_distance, is_relay_event, normalize_stroke)

    result = detect_and_parse(path)
    meets = result if isinstance(result, list) else [result]

    out = []
    for meet in meets:
        events = {}
        n_results = n_relays = n_splits = 0
        for ev in meet.events:
            dist = ev.distance or extract_distance(ev.event_name)
            stroke = (normalize_stroke(ev.stroke or ev.event_name) or '').lower().strip()
            relay = is_relay_event(ev.event_name)
            valid = [r for r in ev.results if r.status in ('OK', 'TLD')]
            for r in valid:
                g = (r.gender or ev.gender or '?')
                key = f'{dist}|{stroke}|{int(bool(relay))}|{g}'
                events[key] = events.get(key, 0) + 1
                n_results += 1
                if relay:
                    n_relays += 1
                if r.split_times:
                    n_splits += 1
        out.append({
            'meta': {
                'source': 'file',
                'name': meet.meet_name,
                'date': meet.date_text,
                'date_end': getattr(meet, 'date_end', ''),
                'pool': meet.pool,
                'format': meet.source_format,
                'events': len(meet.events),
            },
            'events': dict(sorted(events.items())),
            'totals': {'results': n_results, 'relays': n_relays,
                       'with_splits': n_splits},
        })
    return out


def _bucket_from_champ(champ_id):
    from championships.models import Championship
    from importer.parsers.base import (
        extract_distance, is_relay_event, normalize_stroke)

    champ = Championship.objects.get(id=champ_id)
    events = {}
    event_ids = set()
    n_results = n_relays = n_splits = 0
    qs = (champ.results.select_related('event', 'swimmer'))
    for r in qs:
        ev_name = r.event.name if r.event_id else ''
        dist = extract_distance(ev_name)
        stroke = (normalize_stroke(ev_name) or '').lower().strip()
        relay = is_relay_event(ev_name) or (r.swimmer.is_relay_team if r.swimmer_id else False)
        g = r.swimmer.sex if (r.swimmer_id and not relay) else 'X' if relay else '?'
        if relay and 'mixed' in ev_name.lower():
            g = 'X'
        key = f'{dist}|{stroke}|{int(bool(relay))}|{g}'
        events[key] = events.get(key, 0) + 1
        event_ids.add(r.event_id)
        n_results += 1
        if relay:
            n_relays += 1
        if r.splits or r.relay_swimmers:
            n_splits += 1
    return [{
        'meta': {
            'source': 'db',
            'champ_id': champ.id,
            'name': champ.name,
            'date': str(champ.date),
            'events': len(event_ids),
            'program_items': champ.program_items.count(),
        },
        'events': dict(sorted(events.items())),
        'totals': {'results': n_results, 'relays': n_relays,
                   'with_splits': n_splits},
    }]


class Command(BaseCommand):
    help = 'Emit a structural fingerprint of a meet (from --file or --champ).'

    def add_arguments(self, parser):
        parser.add_argument('--file', help='Source results file to parse.')
        parser.add_argument('--champ', type=int, help='Championship id in DB.')

    def handle(self, *args, **opts):
        if bool(opts['file']) == bool(opts['champ']):
            raise CommandError('Pass exactly one of --file or --champ.')
        if opts['file']:
            data = _bucket_from_file(opts['file'])
        else:
            data = _bucket_from_champ(opts['champ'])
        self.stdout.write(json.dumps(data, ensure_ascii=False, indent=2))
