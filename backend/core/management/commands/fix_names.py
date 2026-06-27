from django.core.management.base import BaseCommand
from swimmers.models import Swimmer


class Command(BaseCommand):
    help = 'Fix swimmer names to "Firstname LASTNAME" format'

    def handle(self, *args, **kwargs):
        updated = 0
        for s in Swimmer.objects.all():
            new_name = s.name

            # Fix comma format: "Abbas, Jaber" → "Abbas JABER"
            if ',' in new_name:
                parts = new_name.split(',', 1)
                first = parts[0].strip().title()
                last = parts[1].strip().upper()
                new_name = f'{first} {last}'

            # Fix wrongly swapped Lebanon names: "Jaber ABBAS" → "Abbas JABER"
            # Detect: if first word(s) are Title case and last word(s) are UPPER,
            # AND the swimmer is Lebanese, they were swapped wrong
            if new_name == s.name:
                words = new_name.split()
                if len(words) >= 2 and hasattr(s, 'nationality') and s.nationality and s.nationality.code == 'LBN':
                    upper_words = [w for w in words if w.isupper() and len(w) > 1]
                    title_words = [w for w in words if not w.isupper() or len(w) <= 1]
                    if upper_words and title_words:
                        first = ' '.join(w.title() for w in upper_words)
                        last = ' '.join(w.upper() for w in title_words)
                        new_name = f'{first} {last}'

            if new_name != s.name:
                s.name = new_name
                s.save(update_fields=['name'])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f'Fixed {updated} swimmer names'))
