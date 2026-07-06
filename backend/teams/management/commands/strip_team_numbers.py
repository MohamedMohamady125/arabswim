"""Strip trailing squad numbers from Algerian team/club names.

Algerian meets number each club's relay squads ("BAHIA NAUTIQUE 1",
"BAHIA NAUTIQUE 2"). We store only the club name, so this command:
- renames or merges relay placeholder swimmers whose name ends in a number
  (result clashes resolved by keeping the better time),
- strips the number from swimmer clubs and result team fields,
- renames or merges numbered Team records.
Imports no longer store these numbers; this repairs existing data.
Idempotent.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from swimmers.models import Swimmer
from championships.models import Result
from teams.models import Team
from teams.utils import strip_squad_number
from importer.matcher import merge_swimmers

NUM_RE = r'\s[0-9]{1,2}$'


class Command(BaseCommand):
    help = 'Remove trailing squad numbers from team/club names everywhere'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would change without changing data')

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options['dry_run']

        if dry:
            self.stdout.write(self.style.SUCCESS(
                f'Would fix: {Swimmer.objects.filter(name__regex=NUM_RE).count()} swimmer name(s), '
                f'{Swimmer.objects.filter(club__regex=NUM_RE).count()} swimmer club(s), '
                f'{Result.objects.filter(team__regex=NUM_RE).count()} result team(s), '
                f'{Team.objects.filter(name__regex=NUM_RE).count()} team(s)'))
            return

        merged = renamed = 0
        # Relay placeholder swimmers named after numbered squads.
        for sw in Swimmer.objects.filter(name__regex=NUM_RE).order_by('name'):
            base = strip_squad_number(sw.name)
            keep = (Swimmer.objects.filter(name__iexact=base, sex=sw.sex)
                    .exclude(pk=sw.pk).first())
            if keep:
                # Two squads of the same club in the same race clash on the
                # result unique constraint — keep the better time.
                for r in Result.objects.filter(swimmer=sw):
                    clash = Result.objects.filter(
                        swimmer=keep, championship=r.championship, event=r.event,
                        round_type=r.round_type, category=r.category).first()
                    if clash:
                        if r.time_centiseconds < clash.time_centiseconds:
                            clash.time_centiseconds = r.time_centiseconds
                            clash.fina_points = r.fina_points
                            clash.relay_swimmers = r.relay_swimmers
                            clash.save()
                        r.delete()
                merge_swimmers(keep, sw)
                if keep.club and strip_squad_number(keep.club) != keep.club:
                    keep.club = strip_squad_number(keep.club)
                    keep.save(update_fields=['club'])
                merged += 1
            else:
                sw.name = base
                sw.club = strip_squad_number(sw.club)
                sw.save(update_fields=['name', 'club'])
                renamed += 1

        clubs = 0
        for sw in Swimmer.objects.filter(club__regex=NUM_RE):
            sw.club = strip_squad_number(sw.club)
            sw.save(update_fields=['club'])
            clubs += 1

        result_teams = 0
        for r in Result.objects.filter(team__regex=NUM_RE):
            r.team = strip_squad_number(r.team)
            r.save(update_fields=['team'])
            result_teams += 1

        teams_fixed = 0
        for t in Team.objects.filter(name__regex=NUM_RE).order_by('name'):
            base = strip_squad_number(t.name)
            existing = Team.objects.filter(name__iexact=base).exclude(pk=t.pk).first()
            if existing:
                t.trophies.update(team=existing)
                t.delete()
            else:
                t.name = base
                t.save(update_fields=['name'])
            teams_fixed += 1

        self.stdout.write(self.style.SUCCESS(
            f'Swimmers: {merged} merged, {renamed} renamed; '
            f'{clubs} club(s), {result_teams} result team(s), '
            f'{teams_fixed} team record(s) fixed'))
