from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('swimmers', '0003_add_is_retired'),
    ]

    operations = [
        migrations.CreateModel(
            name='NationalityChange',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('effective_date', models.DateField(help_text='Date the nationality change took effect')),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('from_country', models.ForeignKey(
                    blank=True, null=True,
                    help_text='Previous nationality (null if first known nationality)',
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='+',
                    to='core.country',
                )),
                ('to_country', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='+',
                    to='core.country',
                )),
                ('swimmer', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='nationality_changes',
                    to='swimmers.swimmer',
                )),
            ],
            options={
                'ordering': ['effective_date'],
            },
        ),
    ]
