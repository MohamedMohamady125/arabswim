from django.db import migrations, models


def add_is_retired_if_missing(apps, schema_editor):
    """Add is_retired column only if it doesn't already exist."""
    connection = schema_editor.connection
    columns = [col.name for col in connection.introspection.get_table_description(connection.cursor(), 'swimmers_swimmer')]
    if 'is_retired' not in columns:
        schema_editor.execute('ALTER TABLE swimmers_swimmer ADD COLUMN is_retired boolean DEFAULT false NOT NULL')


class Migration(migrations.Migration):

    dependencies = [
        ('swimmers', '0002_swimmer_is_relay_team'),
    ]

    operations = [
        migrations.RunPython(add_is_retired_if_missing, migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='swimmer',
                    name='is_retired',
                    field=models.BooleanField(default=False),
                ),
            ],
            database_operations=[],
        ),
    ]
