from django.db import migrations


def backfill(apps, schema_editor):
    Result = apps.get_model('championships', 'Result')
    NationalityChange = apps.get_model('swimmers', 'NationalityChange')

    # 1) Everyone: stamp with the swimmer's current nationality (single SQL).
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(
            'UPDATE championships_result r SET nationality_id = s.nationality_id '
            'FROM swimmers_swimmer s WHERE r.swimmer_id = s.id AND r.nationality_id IS NULL'
        )
    else:
        schema_editor.execute(
            'UPDATE championships_result SET nationality_id = ('
            'SELECT nationality_id FROM swimmers_swimmer '
            'WHERE swimmers_swimmer.id = championships_result.swimmer_id) '
            'WHERE nationality_id IS NULL'
        )

    # 2) Swimmers with a recorded nationality change: rebuild the timeline so
    #    results from meets BEFORE each effective date keep the older country.
    changes_by_swimmer = {}
    for ch in NationalityChange.objects.order_by('effective_date', 'id'):
        changes_by_swimmer.setdefault(ch.swimmer_id, []).append(ch)

    for swimmer_id, changes in changes_by_swimmer.items():
        results = Result.objects.filter(swimmer_id=swimmer_id).select_related('championship')
        for r in results:
            meet_date = r.championship.date
            if meet_date is None:
                continue
            # nationality at meet_date: country before the first change whose
            # effective_date is after the meet; else the last change's to_country
            country_id = None
            for ch in changes:
                if meet_date < ch.effective_date:
                    country_id = ch.from_country_id
                    break
                country_id = ch.to_country_id
            if country_id and r.nationality_id != country_id:
                r.nationality_id = country_id
                r.save(update_fields=['nationality_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('championships', '0026_result_nationality'),
        ('swimmers', '0004_nationalitychange'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
