"""Seed a country row for World Aquatics neutral athletes.

Some meets enter athletes under "Neutral Athletes" / "AIN" / the "NAB"
(Neutral Athletes B) relay code rather than a national federation. Those
never resolved to a Country, so the swimmers rendered with no flag. Add a
single OTHER-region row with code ``AIN`` that the frontend renders with a
dedicated neutral badge (there is no national flag for neutral athletes).

Idempotent: skips if the code already exists.
"""
from django.db import migrations


def add_neutral(apps, schema_editor):
    Country = apps.get_model('core', 'Country')
    if not Country.objects.filter(code='AIN').exists():
        Country.objects.create(code='AIN', name='Neutral Athletes', region='OTHER')


def remove_neutral(apps, schema_editor):
    Country = apps.get_model('core', 'Country')
    Country.objects.filter(code='AIN').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_british_home_nations'),
    ]

    operations = [
        migrations.RunPython(add_neutral, remove_neutral),
    ]
