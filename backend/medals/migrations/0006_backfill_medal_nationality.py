from django.db import migrations


def backfill(apps, schema_editor):
    # From the awarding result's stamped nationality when available,
    # otherwise the swimmer's current nationality.
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(
            'UPDATE medals_medal m SET nationality_id = r.nationality_id '
            'FROM championships_result r '
            'WHERE m.result_id = r.id AND r.nationality_id IS NOT NULL'
        )
        schema_editor.execute(
            'UPDATE medals_medal m SET nationality_id = s.nationality_id '
            'FROM swimmers_swimmer s '
            'WHERE m.swimmer_id = s.id AND m.nationality_id IS NULL'
        )
    else:
        schema_editor.execute(
            'UPDATE medals_medal SET nationality_id = ('
            'SELECT nationality_id FROM championships_result '
            'WHERE championships_result.id = medals_medal.result_id) '
            'WHERE result_id IS NOT NULL'
        )
        schema_editor.execute(
            'UPDATE medals_medal SET nationality_id = ('
            'SELECT nationality_id FROM swimmers_swimmer '
            'WHERE swimmers_swimmer.id = medals_medal.swimmer_id) '
            'WHERE nationality_id IS NULL'
        )


class Migration(migrations.Migration):
    dependencies = [
        ('medals', '0005_medal_nationality'),
        ('championships', '0027_backfill_result_nationality'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
