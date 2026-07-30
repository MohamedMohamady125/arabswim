"""
Swap swimmer names imported in "Family GIVEN" order to the site convention
"Given FAMILY" (surname uppercase).

Some sources (e.g. Lebanese federation PDFs) list the family name first in
title case followed by the given name in caps: "Khoury MARIE". The site
convention is the reverse: "Marie KHOURY". This command repairs the swimmers
who have results in one championship, so a wrongly-ordered import can be
fixed without touching correctly-stored profiles elsewhere.

Usage:
    python manage.py swap_name_order 135 --dry-run   # preview
    python manage.py swap_name_order 135             # apply
"""
import re

from django.core.management.base import BaseCommand
from swimmers.models import Swimmer

# Leading title-case token(s) = family name, trailing all-caps token(s) = given
TITLE_TOKEN = r"[A-ZÀ-Þ][a-zà-þ'’\-]+"
CAPS_TOKEN = r"[A-ZÀ-Þ][A-ZÀ-Þ'’\-]+"
INVERTED = re.compile(
    rf"^((?:{TITLE_TOKEN} )+)((?:{CAPS_TOKEN})(?: {CAPS_TOKEN})*)$"
)


def swap(name):
    m = INVERTED.match(name.strip())
    if not m:
        return None
    family = m.group(1).strip()
    given = m.group(2).strip()
    given_tc = ' '.join(w.capitalize() for w in given.split())
    return f'{given_tc} {family.upper()}'


class Command(BaseCommand):
    help = 'Swap "Family GIVEN" swimmer names to "Given FAMILY" for one championship'

    def add_arguments(self, parser):
        parser.add_argument('championship_id', type=int)
        parser.add_argument('--dry-run', action='store_true',
                            help='Only report what would change')

    def handle(self, *args, **options):
        dry = options['dry_run']
        renamed = 0
        dupes = []

        qs = (Swimmer.objects
              .filter(is_relay_team=False,
                      results__championship_id=options['championship_id'])
              .distinct().order_by('id'))
        for swimmer in qs.iterator():
            name = (swimmer.name or '').strip()
            new_name = swap(name)
            if not new_name or new_name == name:
                continue

            # The same person may already exist under the correct order —
            # report the collision for a manual merge instead of renaming
            # into a duplicate.
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
