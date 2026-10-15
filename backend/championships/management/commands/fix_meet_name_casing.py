"""Repair title()-mangled casing in stored meet names.

The importer title-cased meet names, which turns ordinals and acronyms
into "12Th Gcc" instead of "12th GCC". The importer is fixed going
forward; this backfills names already in the database. Only the specific
broken tokens are rewritten — names are not fully re-title-cased — so
nothing else about a name changes.
"""
import re
from django.core.management.base import BaseCommand
from championships.models import Championship

ORDINAL_RE = re.compile(r'(\d)(St|Nd|Rd|Th)\b')
ACRONYMS = ('GCC', 'UAE', 'KSA', 'FINA', 'MENA', 'CANA')


def fix_casing(text):
    if not text:
        return text
    fixed = ORDINAL_RE.sub(lambda m: m.group(1) + m.group(2).lower(), text)
    for acro in ACRONYMS:
        fixed = re.sub(r'\b' + acro.title() + r'\b', acro, fixed)
    return fixed


class Command(BaseCommand):
    help = 'Fix ordinal/acronym casing in existing meet names and locations.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Write changes (default is a dry run).')

    def handle(self, *args, **opts):
        apply = opts['apply']
        changed = 0
        for champ in Championship.objects.all().only('id', 'name', 'location'):
            new_name = fix_casing(champ.name)
            new_loc = fix_casing(champ.location)
            if new_name == champ.name and new_loc == champ.location:
                continue
            changed += 1
            if new_name != champ.name:
                self.stdout.write(f'  name: {champ.name!r} -> {new_name!r}')
            if new_loc != champ.location:
                self.stdout.write(f'  loc : {champ.location!r} -> {new_loc!r}')
            if apply:
                champ.name = new_name
                champ.location = new_loc
                champ.save(update_fields=['name', 'location'])
        verb = 'Updated' if apply else 'Would update'
        self.stdout.write(self.style.SUCCESS(f'{verb} {changed} meet(s).'))
