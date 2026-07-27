"""One-off cleanup requested 2026-07-28: wipe every Team record.

Results and swimmers keep their club names (plain text fields), so no
competition data is lost. Teams re-appear automatically as future meet
imports run auto_create_teams().
"""
from django.db import migrations


def delete_all_teams(apps, schema_editor):
    Team = apps.get_model('teams', 'Team')
    Team.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('teams', '0002_fix_club_countries_from_subclassification'),
    ]

    operations = [
        migrations.RunPython(delete_all_teams, migrations.RunPython.noop),
    ]
