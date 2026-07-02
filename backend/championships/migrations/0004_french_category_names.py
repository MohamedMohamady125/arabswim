# Rename result age categories back to their French federation names
# (Seniors/Juniors, Cadets, Minimes, Benjamins...), per FRMN request.
# The English tier names below only ever came from translating these French
# labels, so the reverse mapping is unambiguous for existing data.
from django.db import migrations

FORWARD = {
    'Senior/Junior': 'Seniors/Juniors',
    'Junior/Senior': 'Seniors/Juniors',
    'Senior': 'Seniors',
    # Standalone 'Junior' came from CADETS headers (JUNIORS only ever
    # appeared combined with SENIORS in imported meets).
    'Junior': 'Cadets',
    'Intermediate': 'Minimes',
    'Youth': 'Benjamins',
    'Under 11': 'Poussins',
    'All Ages': 'Toutes Catégories',
}


def rename_categories(apps, schema_editor):
    Result = apps.get_model('championships', 'Result')
    for old, new in FORWARD.items():
        Result.objects.filter(category=old).update(category=new)


def reverse_categories(apps, schema_editor):
    Result = apps.get_model('championships', 'Result')
    reverse = {
        'Seniors/Juniors': 'Senior/Junior',
        'Seniors': 'Senior',
        'Cadets': 'Junior',
        'Minimes': 'Intermediate',
        'Benjamins': 'Youth',
        'Poussins': 'Under 11',
        'Toutes Catégories': 'All Ages',
    }
    for old, new in reverse.items():
        Result.objects.filter(category=old).update(category=new)


class Migration(migrations.Migration):

    dependencies = [
        ('championships', '0003_alter_result_unique_together_result_category_and_more'),
    ]

    operations = [
        migrations.RunPython(rename_categories, reverse_categories),
    ]
