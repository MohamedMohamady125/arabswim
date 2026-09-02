"""Seed the British home nations as distinct countries.

British domestic meets (e.g. the AP Race London International) enter
swimmers under "Team England" / "Team Wales" / "Team Scotland" rather
than a single "Great Britain". Those never resolved to a Country, so
the swimmers rendered with no flag. Add them as OTHER-region countries
with codes that map to the flag-icons GB subdivision flags
(gb-eng / gb-wls / gb-sct / gb-nir) on the frontend.

Idempotent: skips any nation whose code or name already exists.
"""
from django.db import migrations

HOME_NATIONS = [
    ('ENG', 'England'),
    ('WAL', 'Wales'),
    ('SCO', 'Scotland'),
    ('NIR', 'Northern Ireland'),
]


def add_home_nations(apps, schema_editor):
    Country = apps.get_model('core', 'Country')
    for code, name in HOME_NATIONS:
        if Country.objects.filter(code=code).exists():
            continue
        if Country.objects.filter(name=name).exists():
            continue
        Country.objects.create(code=code, name=name, region='OTHER')


def remove_home_nations(apps, schema_editor):
    Country = apps.get_model('core', 'Country')
    Country.objects.filter(code__in=[c for c, _ in HOME_NATIONS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_photo_request'),
    ]

    operations = [
        migrations.RunPython(add_home_nations, remove_home_nations),
    ]
