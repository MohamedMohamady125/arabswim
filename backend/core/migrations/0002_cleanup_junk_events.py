"""Merge junk Event records created by corrupted PDF imports into their
canonical events, then delete them.

Examples of junk seen in production:
  '50 M Butter(cid:976)ly'   -> '50 M Butterfly'    (PDF ligature artifact)
  '1500 M Li bre'            -> '1500 M Freestyle'  (French, broken spacing)
  '4x1025 M Freestyle Relay' -> '4x100 M Freestyle Relay' ('4 x 100' read as 4100)

All Result/Medal/Record/QualifyingTime rows are re-pointed at the
canonical event before the junk event is removed. Idempotent: repaired
names that already match their event are skipped.
"""
import re

from django.db import migrations

VALID_STROKES = {
    'Freestyle', 'Backstroke', 'Butterfly', 'Breaststroke',
    'Individual Medley', 'Medley Relay', 'Freestyle Relay',
}
VALID_INDIVIDUAL = {25, 50, 100, 200, 400, 800, 1500}
VALID_RELAY = {50, 100, 200, 400, 800}


def repair_stroke(stroke, is_relay=False):
    s = re.sub(r'\(cid:\d+\)', '', stroke or '')
    s = re.sub(r'[^A-Za-z ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if s in VALID_STROKES:
        return s
    key = s.replace(' ', '').lower()
    if 'relay' in key or is_relay:
        if 'medley' in key or 'nage' in key:
            return 'Medley Relay' if 'relay' in key else 'Individual Medley'
        if 'free' in key or 'libre' in key or key == 'nl':
            return 'Freestyle Relay' if 'relay' in key else 'Freestyle'
    if 'butter' in key or 'papillon' in key or key == 'fly':
        return 'Butterfly'
    if 'back' in key or 'dos' in key:
        return 'Backstroke'
    if 'breast' in key or 'brasse' in key:
        return 'Breaststroke'
    if 'medley' in key or 'nages' in key or key == 'im':
        return 'Individual Medley'
    if 'free' in key or 'libre' in key or key == 'nl':
        return 'Freestyle'
    return ''


def repair_distance(distance, is_relay=False):
    try:
        d = int(distance)
    except (TypeError, ValueError):
        return 0
    if not is_relay:
        return d if d in VALID_INDIVIDUAL else 0
    if d in VALID_RELAY:
        return d
    s = str(d)
    if s.startswith('4') and s[1:].isdigit() and int(s[1:]) in {50, 100, 200}:
        return 4 * int(s[1:])
    return 0


def canonical_name(distance, stroke, is_relay, mixed):
    if is_relay:
        leg = distance // 4 if distance >= 200 else distance
        relay_stroke = 'Medley' if stroke == 'Individual Medley' else stroke.replace(' Relay', '')
        name = f'4x{leg} M {relay_stroke} Relay'
        return f'{name} Mixed' if mixed else name
    return f'{distance} M {stroke}'


def cleanup_junk_events(apps, schema_editor):
    Event = apps.get_model('core', 'Event')
    Result = apps.get_model('championships', 'Result')
    Medal = apps.get_model('medals', 'Medal')
    Record = apps.get_model('records', 'Record')
    QualifyingTime = apps.get_model('qualifying_times', 'QualifyingTime')

    for event in list(Event.objects.all()):
        stroke = repair_stroke(event.stroke, event.is_relay)
        distance = repair_distance(event.distance, event.is_relay)
        if not stroke or not distance:
            # Try recovering identity from the name itself
            m = re.match(r'^\s*(?:4\s*[xX]\s*)?(\d+)', event.name)
            distance = distance or repair_distance(
                (4 * int(m.group(1))) if (m and event.is_relay) else (int(m.group(1)) if m else 0),
                event.is_relay)
            stroke = stroke or repair_stroke(event.name, event.is_relay)
        if not stroke or not distance:
            continue  # unrecoverable — leave untouched rather than guess

        mixed = event.name.strip().lower().endswith('mixed')
        target_name = canonical_name(distance, stroke, event.is_relay, mixed)
        needs_fix = (target_name != event.name or '(cid:' in event.name
                     or event.stroke != stroke or event.distance != distance)
        if not needs_fix:
            continue

        target = Event.objects.filter(name__iexact=target_name).exclude(id=event.id).first()
        if target:
            Result.objects.filter(event=event).update(event=target)
            Medal.objects.filter(event=event).update(event=target)
            Record.objects.filter(event=event).update(event=target)
            for qt in QualifyingTime.objects.filter(event=event):
                dup = QualifyingTime.objects.filter(
                    standard=qt.standard, event=target, gender=qt.gender,
                    cut=qt.cut, pool=qt.pool).exists()
                if dup:
                    qt.delete()
                else:
                    qt.event = target
                    qt.save()
            event.delete()
        else:
            event.name = target_name
            event.distance = distance
            event.stroke = stroke
            event.save()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('championships', '0015_result_is_manual'),
        ('medals', '0001_initial'),
        ('records', '0001_initial'),
        ('qualifying_times', '0002_add_pool_to_qualifyingtime'),
    ]

    operations = [
        migrations.RunPython(cleanup_junk_events, migrations.RunPython.noop),
    ]
