"""Backfill FINA points for results that are missing them.

Older imports left fina_points empty for events without a base time in
their pool's table (100 IM at LCM, 4x50 relays at LCM) and for event
name variants the lookup didn't recognise. calculate_points now handles
all of these, so recompute every result that has a time but no points.
"""
from django.db import migrations
from django.db.models import Q


def backfill_fina_points(apps, schema_editor):
    from importer.points import calculate_points

    Result = apps.get_model('championships', 'Result')

    qs = Result.objects.filter(
        Q(fina_points__isnull=True) | Q(fina_points=0),
        time_centiseconds__gt=0,
    ).select_related('event', 'championship', 'swimmer')

    updated = []
    for result in qs.iterator():
        if not result.event or not result.championship:
            continue
        gender = (result.swimmer.sex if result.swimmer_id else '') or 'M'
        pts = calculate_points(
            result.time_centiseconds,
            result.event.name,
            gender,
            result.championship.pool or 'LCM',
        )
        if pts and pts > 0:
            result.fina_points = pts
            updated.append(result)
            if len(updated) >= 500:
                Result.objects.bulk_update(updated, ['fina_points'])
                updated = []
    if updated:
        Result.objects.bulk_update(updated, ['fina_points'])


class Migration(migrations.Migration):

    dependencies = [
        ('championships', '0015_result_is_manual'),
        ('swimmers', '0005_swimmer_facebook_url_swimmer_instagram_url'),
        ('core', '0002_cleanup_junk_events'),
    ]

    operations = [
        migrations.RunPython(backfill_fina_points, migrations.RunPython.noop),
    ]
