"""
Repair national teams that were mis-filed as host-country clubs.

A team name ending in "NT" ("Djibouti NT", "Bahrein NT") is a national team,
but before the NT rule existed these slipped through team auto-creation as
ordinary clubs and then got forced onto the host country of a meet they
appeared in (e.g. "Djibouti NT" tagged Morocco). This command finds every
NT-suffixed team, sets is_national_team=True and its resolved country, and
merges duplicate national teams for the same country.

Usage:
    python manage.py fix_national_teams
"""
from django.core.management.base import BaseCommand
from teams.models import Team
from teams.utils import nt_suffix_country, merge_team_records


class Command(BaseCommand):
    help = 'Fix country + national-team flag on NT-suffixed teams'

    def handle(self, *args, **options):
        fixed = 0
        # country_id -> the Team we keep as the canonical national team
        canonical = {}
        merged = 0
        for team in list(Team.objects.all()):
            country = nt_suffix_country(team.name)
            if not country:
                continue
            changed = False
            if not team.is_national_team:
                team.is_national_team = True
                changed = True
            if team.country_id != country.id:
                team.country = country
                changed = True
            if changed:
                team.save(update_fields=['is_national_team', 'country'])
                fixed += 1
                self.stdout.write(
                    f'{team.name}: -> {country.code} (national team)')

            keep = canonical.get(country.id)
            if keep is None:
                canonical[country.id] = team
            else:
                merge_team_records(keep, team)
                merged += 1
                self.stdout.write(
                    f'  merged "{team.name}" into "{keep.name}"')

        self.stdout.write(self.style.SUCCESS(
            f'Fixed {fixed} team(s), merged {merged} duplicate(s)'))
