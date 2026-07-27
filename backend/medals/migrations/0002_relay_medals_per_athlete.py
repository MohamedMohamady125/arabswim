"""Recompute medals for every championship so relay medals are awarded to
each athlete on the squad (in addition to the relay-team placeholder row).

Uses the live recompute_medals() helper: it only touches result-backed
medals, preserves manually assigned medals, and skips manual/HC results,
so re-running it is safe and idempotent.
"""
from django.db import migrations


def recompute_all(apps, schema_editor):
    from championships.models import Championship
    from medals.utils import recompute_medals

    for championship in Championship.objects.filter(results__isnull=False).distinct():
        recompute_medals(championship)


class Migration(migrations.Migration):

    dependencies = [
        ('medals', '0001_initial'),
        ('championships', '0015_result_is_manual'),
        ('swimmers', '0005_swimmer_facebook_url_swimmer_instagram_url'),
        ('core', '0002_cleanup_junk_events'),
    ]

    operations = [
        migrations.RunPython(recompute_all, migrations.RunPython.noop),
    ]
