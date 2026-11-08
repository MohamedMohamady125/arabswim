# Team.country becomes nullable so ONE special row can exist: the virtual
# "Arab Swimming Federation" national team (country=None). It powers the
# Board tab on the pan-Arab federation page exactly like any country's
# national team. Country-filtered team lists never match it (country is null),
# so club/team pages stay unaffected.
from django.db import migrations, models
import django.db.models.deletion


def create_arab_federation_team(apps, schema_editor):
    Team = apps.get_model('teams', 'Team')
    Team.objects.get_or_create(
        name='Arab Swimming Federation',
        defaults={'country': None, 'is_national_team': True,
                  'country_manually_set': True},
    )


def remove_arab_federation_team(apps, schema_editor):
    Team = apps.get_model('teams', 'Team')
    Team.objects.filter(name='Arab Swimming Federation', country__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('teams', '0007_team_country_manually_set'),
    ]

    operations = [
        migrations.AlterField(
            model_name='team',
            name='country',
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.PROTECT,
                                    related_name='teams', to='core.country'),
        ),
        migrations.RunPython(create_arab_federation_team, remove_arab_federation_team),
    ]
