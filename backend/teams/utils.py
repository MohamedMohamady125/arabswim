"""
Utility functions for auto-creating and syncing teams from swimmer/result data.
"""
from django.db.models import Count, Q
from .models import Team
from swimmers.models import Swimmer
from core.models import Country


def auto_create_teams():
    """
    Scan all swimmers and create Team entries for any club names
    that don't already have a Team record.
    Skips relay placeholder names and country names.
    Returns count of teams created.
    """
    # Collect unique club names with their most common nationality
    club_data = {}
    swimmers = Swimmer.objects.select_related('nationality').exclude(
        Q(club='') | Q(club__isnull=True)
    )

    skip_names = _get_skip_names()

    for swimmer in swimmers:
        club = swimmer.club.strip()
        if not club or club in skip_names:
            continue

        if club not in club_data:
            club_data[club] = {'count': 0, 'nationalities': {}}
        club_data[club]['count'] += 1

        nat_code = swimmer.nationality.code if swimmer.nationality else ''
        if nat_code:
            club_data[club]['nationalities'][nat_code] = \
                club_data[club]['nationalities'].get(nat_code, 0) + 1

    created = 0
    for club_name, data in club_data.items():
        # Skip if team already exists (case-insensitive)
        if Team.objects.filter(name__iexact=club_name).exists():
            continue

        # Determine country from most common nationality
        country = None
        if data['nationalities']:
            top_code = max(data['nationalities'], key=data['nationalities'].get)
            try:
                country = Country.objects.get(code=top_code)
            except Country.DoesNotExist:
                pass

        if not country:
            country = Country.objects.first()

        if country:
            Team.objects.create(
                name=club_name,
                country=country,
            )
            created += 1

    return created


def ensure_team_exists(club_name, country=None):
    """
    Ensure a Team exists for the given club name.
    Creates one if it doesn't exist. Returns the Team.
    """
    if not club_name or not club_name.strip():
        return None

    club_name = club_name.strip()
    skip_names = _get_skip_names()
    if club_name in skip_names:
        return None

    team = Team.objects.filter(name__iexact=club_name).first()
    if team:
        return team

    if not country:
        country = Country.objects.first()

    if country:
        team = Team.objects.create(
            name=club_name,
            country=country,
        )
        return team

    return None


def _get_skip_names():
    """Names to skip when auto-creating teams."""
    skip = set()

    # Country names and relay placeholders
    for c in Country.objects.all():
        skip.add(c.name)
        skip.add(c.code)
        skip.add(f'{c.code} {c.code}')
        skip.add(f'{c.code} {c.name}')
        skip.add(f'{c.name} National Team')
        skip.add(f'{c.code} National Team')

    return skip
