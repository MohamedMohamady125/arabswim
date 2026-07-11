"""
Utility functions for auto-creating and syncing teams from swimmer/result data.
"""
import re

from django.db.models import Count, Q
from .models import Team
from swimmers.models import Swimmer
from core.models import Country

# Trailing squad number on club names ("BAHIA NAUTIQUE 2") — Algerian
# meets number each club's relay squads; we store only the club name.
_SQUAD_NUMBER_RE = re.compile(r'\s+\d{1,2}$')
# Trailing single squad letter: " A", " B", " C" etc.
_SQUAD_LETTER_RE = re.compile(r'\s+[A-Z]$')
# HyTek region suffix: "-AD", "-DU", etc.
_REGION_SUFFIX_RE = re.compile(r'-[A-Z]{1,4}$')


def strip_squad_number(name):
    """Remove a trailing standalone squad number from a team/club name."""
    return _SQUAD_NUMBER_RE.sub('', (name or '').strip())


def clean_relay_team_name(name):
    """Clean relay team placeholder name for consistent matching.

    Strips trailing squad letters (A/B), 'National Team', region codes (-AD).
    """
    if not name:
        return name
    cleaned = name.strip()
    # Strip trailing squad letter first (before other cleaning)
    cleaned = _SQUAD_LETTER_RE.sub('', cleaned).strip()
    # Strip trailing squad number
    cleaned = _SQUAD_NUMBER_RE.sub('', cleaned).strip()
    # Strip "National Team" suffix
    cleaned = re.sub(r'\s+National\s+Team$', '', cleaned, flags=re.IGNORECASE).strip()
    # Strip region suffix like "-AD", "-DU"
    cleaned = _REGION_SUFFIX_RE.sub('', cleaned).strip()
    return cleaned or name.strip()


# A whole name that is just a swim time, e.g. "3:37.01", "07:58.87", "58.31"
_TIME_NAME_RE = re.compile(r'^\d{0,2}:?\d{1,2}[:.,]\d{2}([.,]\d{1,2})?$')
# A swim time embedded anywhere in the name, e.g. "CLUB X 3:40.68"
_EMBEDDED_TIME_RE = re.compile(r'\d{1,2}[:.]\d{2}[.,]\d{2}')


def is_valid_team_name(name):
    """
    Reject junk "team" names produced by relay/result parsing glitches:
    pure numbers, swim times, or club names with time digits interleaved
    into the letters (PDF text-extraction corruption).
    """
    if not name:
        return False
    name = name.strip()
    if len(name) < 2:
        return False
    # Must contain at least two letters — kills "1875", "3:37.01", "58.31"
    if sum(c.isalpha() for c in name) < 2:
        return False
    if _TIME_NAME_RE.match(name):
        return False
    if _EMBEDDED_TIME_RE.search(name):
        return False
    # Real club names never contain a colon — it always comes from a swim
    # time getting merged into the name ("Said1a:", "Eu1l:m0a").
    if ':' in name:
        return False
    # Digits sandwiched inside a word ("Sta1if2ia") = time digits interleaved
    # into letters by broken PDF extraction. Trailing/leading digits are fine
    # ("BAHIA NAUTIQUE 2", "4LSA").
    if re.search(r'[A-Za-z]\d+[A-Za-z]', name):
        return False
    # Corruption like "Wo5s8t.a68 446": many separate digit groups scattered
    # through the name. Real clubs rarely have 3+.
    if len(re.findall(r'\d+', name)) >= 3:
        return False
    return True


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
        if not club or club in skip_names or not is_valid_team_name(club):
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
    if club_name in skip_names or not is_valid_team_name(club_name):
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
