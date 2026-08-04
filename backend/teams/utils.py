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


# Punctuation that varies between meet files for the same club
# ("Al-Ahly" / "Al Ahly" / "AL.AHLY" / "- Al Ahly").
_PUNCT_RE = re.compile(r"[-_.,/\\'’`´&()]+")


def normalize_team_key(name):
    """Canonical matching key for a team name.

    Case-, punctuation- and squad-suffix-insensitive so all import
    variants of the same club collapse to one key. Display names are
    never changed — this is only used for matching.
    """
    if not name:
        return ''
    key = _PUNCT_RE.sub(' ', str(name)).casefold()
    key = re.sub(r'\s+', ' ', key).strip()
    prev = None
    while prev != key:
        prev = key
        key = re.sub(r'\s+national team$', '', key).strip()
        key = re.sub(r'\s+team\s+[a-d]$', '', key).strip()
        key = re.sub(r'\s+team$', '', key).strip()
        # Trailing squad letter/number ("mc alger b", "bahia nautique 2")
        key = re.sub(r'\s+[a-d]$', '', key).strip()
        key = re.sub(r'\s+\d{1,2}$', '', key).strip()
    return key


def national_team_country(name):
    """Return the Country if this team name is a national-team variant
    ("Bahrain", "Bahrain Team A", "BRN Bahrain", "Bahrain National Team")."""
    key = normalize_team_key(name)
    if not key:
        return None
    for c in Country.objects.all():
        ckey = normalize_team_key(c.name)
        code = c.code.casefold()
        if key in {ckey, code, f'{code} {ckey}', f'{ckey} {code}'}:
            return c
    return None


def merge_team_records(keep, remove):
    """Transfer everything from `remove` into `keep` and delete `remove`.

    Shared by the manual merge endpoint and the auto-dedupe tool.
    """
    from teams.models import Trophy
    from championships.models import Result

    results_updated = Result.objects.filter(team__iexact=remove.name).update(team=keep.name)
    swimmers_updated = Swimmer.objects.filter(club__iexact=remove.name).update(club=keep.name)
    trophies_transferred = Trophy.objects.filter(team=remove).update(team=keep)

    for field in ['logo', 'banner', 'founded_year', 'website', 'address', 'email', 'phone']:
        if not getattr(keep, field) and getattr(remove, field):
            setattr(keep, field, getattr(remove, field))
    if not keep.is_national_team and remove.is_national_team:
        keep.is_national_team = True
    keep.save()
    remove.delete()

    return {
        'results_updated': results_updated,
        'swimmers_updated': swimmers_updated,
        'trophies_transferred': trophies_transferred,
    }


def rename_team(team, new_name):
    """Rename a team and keep Result/Swimmer club strings in sync."""
    from championships.models import Result
    old_name = team.name
    if old_name == new_name:
        return
    Result.objects.filter(team__iexact=old_name).update(team=new_name)
    Swimmer.objects.filter(club__iexact=old_name).update(club=new_name)
    team.name = new_name
    team.save()


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
        # National-team variants never become club teams
        if normalize_team_key(club) in skip_names:
            continue

        # Dedupe club variants within this scan by normalized key
        club_key = normalize_team_key(club)
        if club_key not in club_data:
            club_data[club_key] = {'name': club, 'count': 0, 'nationalities': {}}
        club_data[club_key]['count'] += 1

        nat_code = swimmer.nationality.code if swimmer.nationality else ''
        if nat_code:
            club_data[club_key]['nationalities'][nat_code] = \
                club_data[club_key]['nationalities'].get(nat_code, 0) + 1

    # Also scan result team names: a swimmer who changed clubs keeps their
    # current club on the profile, so the club they swam for in a given meet
    # may exist only on Result rows (e.g. EST in the Tunisian summer champs).
    from championships.models import Result
    from django.db.models import Count as _Count
    result_rows = (Result.objects
                   .exclude(Q(team='') | Q(team__isnull=True))
                   .values('team', 'championship__country__code')
                   .annotate(n=_Count('id')))
    for row in result_rows:
        club = strip_squad_number((row['team'] or '')).strip()
        if not club or club == 'LP' or club in skip_names or not is_valid_team_name(club):
            continue
        if normalize_team_key(club) in skip_names:
            continue
        club_key = normalize_team_key(club)
        if club_key not in club_data:
            club_data[club_key] = {'name': club, 'count': 0, 'nationalities': {}}
        club_data[club_key]['count'] += row['n']
        # Vote the meet's host country — clubs swim mostly in their own
        # national championships, and apply_subclassification_country
        # corrects national meets afterwards anyway.
        code = row['championship__country__code']
        if code:
            club_data[club_key]['nationalities'][code] = \
                club_data[club_key]['nationalities'].get(code, 0) + row['n']

    # Existing teams indexed by normalized key so import variants
    # ("Al-Ahly", "AL AHLY 2") match instead of creating duplicates
    existing_keys = {normalize_team_key(t.name) for t in Team.objects.all()}

    created = 0
    for club_key, data in club_data.items():
        club_name = data['name']
        if club_key in existing_keys:
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


def cleanup_orphan_teams():
    """Delete auto-created teams whose club no longer has any swimmer or
    result — e.g. after non-Arab swimmers are removed from an imported
    meet, their clubs must not linger as empty teams.

    Teams with any manually curated data (logo, banner, contact info,
    founded year, trophies) or marked as national teams are never touched.
    Returns the number of teams deleted.
    """
    from championships.models import Result

    used_keys = set()
    club_names = (Swimmer.objects.exclude(club='').exclude(club__isnull=True)
                  .values_list('club', flat=True).distinct())
    team_names = (Result.objects.exclude(team='').exclude(team__isnull=True)
                  .values_list('team', flat=True).distinct())
    for name in list(club_names) + list(team_names):
        name = (name or '').strip()
        if name:
            used_keys.add(normalize_team_key(name) or name.casefold())

    candidates = (
        Team.objects.filter(is_national_team=False, founded_year__isnull=True,
                            website='', address='', email='', phone='')
        .filter(Q(logo='') | Q(logo__isnull=True))
        .filter(Q(banner='') | Q(banner__isnull=True))
        .annotate(trophy_count=Count('trophies'))
        .filter(trophy_count=0)
    )
    deleted = 0
    for team in candidates:
        key = normalize_team_key(team.name) or team.name.casefold()
        if key not in used_keys:
            team.delete()
            deleted += 1
    return deleted


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
    if normalize_team_key(club_name) in skip_names:
        return None

    club_key = normalize_team_key(club_name)
    for t in Team.objects.all():
        if normalize_team_key(t.name) == club_key:
            return t

    if not country:
        country = Country.objects.first()

    if country:
        team = Team.objects.create(
            name=club_name,
            country=country,
        )
        return team

    return None


def apply_subclassification_country(championship):
    """
    For meets classified as National/Other the sub-classification names the
    country the meet belongs to (e.g. classification=Other, sub=France means
    a French national-level meet). Every club that swam in such a meet is
    from that country, so force the matching Team records onto it.

    Fixes clubs whose country was mis-inferred from swimmer nationalities
    (e.g. a French club tagged as Belgian). Returns count of teams updated.
    """
    from importer.matcher import resolve_country

    classification = championship.classification
    sub = championship.sub_classification
    if not classification or not sub:
        return 0
    if classification.name not in ('National', 'Other'):
        return 0

    country = resolve_country(sub.name)
    if not country:
        country = Country.objects.filter(name__iexact=sub.name.strip()).first()
    if not country:
        return 0

    club_names = set(
        championship.results.exclude(team='').values_list('team', flat=True))
    club_names |= set(
        championship.results.exclude(swimmer__club='')
        .exclude(swimmer__club__isnull=True)
        .values_list('swimmer__club', flat=True))
    keys = {normalize_team_key(n) for n in club_names if n and n.strip()}
    if not keys:
        return 0

    updated = 0
    for team in Team.objects.filter(is_national_team=False).exclude(country=country):
        if normalize_team_key(team.name) in keys:
            team.country = country
            team.save(update_fields=['country'])
            updated += 1

    # Relay-team placeholder swimmers carry a nationality too (shown as the
    # flag next to relay squads). Source PDFs sometimes tag them with a wrong
    # code (e.g. extranat prints FRA), so force them onto the meet country.
    from swimmers.models import Swimmer
    relay_ids = (championship.results
                 .filter(swimmer__is_relay_team=True)
                 .values_list('swimmer_id', flat=True).distinct())
    updated += (Swimmer.objects.filter(id__in=relay_ids)
                .exclude(nationality=country)
                .update(nationality=country))
    return updated


def _get_skip_names():
    """Names to skip when auto-creating teams (raw + normalized keys)."""
    skip = set()

    # Country names and relay placeholders
    for c in Country.objects.all():
        variants = [
            c.name, c.code,
            f'{c.code} {c.code}', f'{c.code} {c.name}', f'{c.name} {c.code}',
            f'{c.name} National Team', f'{c.code} National Team',
        ]
        for v in variants:
            skip.add(v)
            skip.add(normalize_team_key(v))

    return skip
