"""
Fix swimmer names that were imported without an uppercase surname.

Site convention is "Given SURNAME". Older imports title-cased names that
arrived without a caps surname ("Dora Buklu"), so the frontend can't tell
given name from surname. This renames them to "Dora BUKLU" using the same
uppercase_surname() rule new imports now apply.

Usage:
    python manage.py fix_surname_caps --dry-run   # preview
    python manage.py fix_surname_caps             # apply
"""
from django.core.management.base import BaseCommand
from swimmers.models import Swimmer
from importer.services import uppercase_surname


class Command(BaseCommand):
    help = 'Uppercase the surname of swimmers imported without one'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Only report what would change')

    def handle(self, *args, **options):
        dry = options['dry_run']
        renamed = 0
        dupes = []

        qs = Swimmer.objects.filter(is_relay_team=False).order_by('id')
        for swimmer in qs.iterator():
            name = (swimmer.name or '').strip()
            words = name.split()
            if len(words) < 2:
                continue
            # Already has an uppercase surname word — leave it alone.
            if any(w.isupper() and len(w) > 1 for w in words):
                continue
            new_name = uppercase_surname(name)
            if new_name == name:
                continue

            # Same person may already exist under the correct casing —
            # renaming makes the duplication visible; report it for a
            # manual merge via the swimmer merge wizard.
            twin = (Swimmer.objects
                    .filter(name__iexact=new_name, is_relay_team=False)
                    .exclude(id=swimmer.id).first())
            if twin:
                dupes.append((swimmer.id, twin.id, new_name))

            self.stdout.write(f'{swimmer.id}: "{name}" -> "{new_name}"')
            if not dry:
                swimmer.name = new_name
                swimmer.save(update_fields=['name'])
            renamed += 1

        verb = 'Would rename' if dry else 'Renamed'
        self.stdout.write(self.style.SUCCESS(f'{verb} {renamed} swimmers'))
        if dupes:
            self.stdout.write(self.style.WARNING(
                f'{len(dupes)} renamed swimmers collide with an existing '
                'profile — merge them in the Swimmers merge wizard:'))
            for sid, tid, name in dupes:
                self.stdout.write(f'  {name}: swimmer {sid} vs {tid}')
