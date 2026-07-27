"""Retroactively fix club countries using meet sub-classifications.

For every meet classified as National/Other, the sub-classification names
the country the meet belongs to — so every club that swam in it gets that
country. Uses the live apply_subclassification_country() helper, which is
idempotent and skips national teams.
"""
from django.db import migrations


def fix_club_countries(apps, schema_editor):
    from championships.models import Championship
    from teams.utils import apply_subclassification_country

    qs = Championship.objects.filter(
        classification__name__in=('National', 'Other'),
        sub_classification__isnull=False,
        results__isnull=False,
    ).distinct()
    for championship in qs:
        apply_subclassification_country(championship)


class Migration(migrations.Migration):

    dependencies = [
        ('teams', '0001_initial'),
        ('championships', '0015_result_is_manual'),
        ('core', '0002_cleanup_junk_events'),
    ]

    operations = [
        migrations.RunPython(fix_club_countries, migrations.RunPython.noop),
    ]
