from django.core.management.base import BaseCommand
from core.models import Country


class Command(BaseCommand):
    help = 'Seed Arab and GCC countries'

    def handle(self, *args, **kwargs):
        countries = [
            # GCC countries (also Arab)
            {'name': 'Saudi Arabia', 'code': 'KSA', 'region': 'GCC'},
            {'name': 'UAE', 'code': 'UAE', 'region': 'GCC'},
            {'name': 'Qatar', 'code': 'QAT', 'region': 'GCC'},
            {'name': 'Kuwait', 'code': 'KWT', 'region': 'GCC'},
            {'name': 'Bahrain', 'code': 'BHR', 'region': 'GCC'},
            {'name': 'Oman', 'code': 'OMA', 'region': 'GCC'},
            # Other Arab countries
            {'name': 'Egypt', 'code': 'EGY', 'region': 'ARAB'},
            {'name': 'Jordan', 'code': 'JOR', 'region': 'ARAB'},
            {'name': 'Lebanon', 'code': 'LBN', 'region': 'ARAB'},
            {'name': 'Syria', 'code': 'SYR', 'region': 'ARAB'},
            {'name': 'Iraq', 'code': 'IRQ', 'region': 'ARAB'},
            {'name': 'Palestine', 'code': 'PLE', 'region': 'ARAB'},
            {'name': 'Yemen', 'code': 'YEM', 'region': 'ARAB'},
            {'name': 'Libya', 'code': 'LBY', 'region': 'ARAB'},
            {'name': 'Tunisia', 'code': 'TUN', 'region': 'ARAB'},
            {'name': 'Algeria', 'code': 'ALG', 'region': 'ARAB'},
            {'name': 'Morocco', 'code': 'MAR', 'region': 'ARAB'},
            {'name': 'Sudan', 'code': 'SUD', 'region': 'ARAB'},
            {'name': 'Somalia', 'code': 'SOM', 'region': 'ARAB'},
            {'name': 'Mauritania', 'code': 'MTN', 'region': 'ARAB'},
            {'name': 'Djibouti', 'code': 'DJI', 'region': 'ARAB'},
            {'name': 'Comoros', 'code': 'COM', 'region': 'ARAB'},
        ]
        for c in countries:
            Country.objects.update_or_create(
                code=c['code'],
                defaults={'name': c['name'], 'region': c['region']}
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(countries)} countries'))
