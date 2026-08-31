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
# Compound squad designator: "4B", "2A", "3C" — digit + letter (or letter
# + digit) used by some federations to label additional relay squads.
_SQUAD_COMPOUND_RE = re.compile(r'\s+\d[A-Z]$')
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
        # Trailing compound squad designator ("naj 4b", "mty 2a")
        key = re.sub(r'\s+\d[a-d]$', '', key).strip()
        # Trailing squad letter/number ("mc alger b", "bahia nautique 2")
        key = re.sub(r'\s+[a-d]$', '', key).strip()
        key = re.sub(r'\s+\d{1,2}$', '', key).strip()
    return key


# Trailing national-team marker: "Djibouti NT", "Bahrein N.T.", "Egypt N T".
_NT_SUFFIX_RE = re.compile(r'\s+n\.?\s*t\.?$', re.IGNORECASE)


def strip_nt_suffix(name):
    """Remove a trailing 'NT' / 'N.T.' national-team marker from a name."""
    return _NT_SUFFIX_RE.sub('', (name or '').strip()).strip()


def national_team_country(name):
    """Return the Country if this team name is a national-team variant
    ("Bahrain", "Bahrain Team A", "BRN Bahrain", "Bahrain National Team",
    "Djibouti NT", "Bahrein NT" — including alias spellings)."""
    if not name:
        return None
    raw = str(name).strip()
    nt = strip_nt_suffix(raw)
    key = normalize_team_key(nt)
    if not key:
        return None
    for c in Country.objects.all():
        ckey = normalize_team_key(c.name)
        code = c.code.casefold()
        if key in {ckey, code, f'{code} {ckey}', f'{ckey} {code}'}:
            return c
    # Alias spellings ("Bahrein NT", "Maroc NT") only when an explicit NT
    # marker was present — a bare club abbreviation ("EST") must never
    # resolve to a country here.
    if nt != raw:
        from importer.matcher import resolve_country
        return resolve_country(nt)
    return None


def nt_suffix_country(name):
    """Country for a name ending in an explicit 'NT'/'N.T.' national-team
    marker ("Djibouti NT", "Bahrein NT", "Maroc NT"), else None.

    Only the NT suffix triggers this — bare country names and relay
    placeholders keep their existing skip behavior."""
    if not name or not _NT_SUFFIX_RE.search(str(name).strip()):
        return None
    return national_team_country(name)


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

    Strips trailing squad letters (A/B), compound squad designators (4B),
    'National Team', region codes (-AD).
    """
    if not name:
        return name
    cleaned = name.strip()
    # Strip trailing compound squad designator first ("4B", "2A")
    cleaned = _SQUAD_COMPOUND_RE.sub('', cleaned).strip()
    # Strip trailing squad letter first (before other cleaning)
    cleaned = _SQUAD_LETTER_RE.sub('', cleaned).strip()
    # Strip trailing squad number
    cleaned = _SQUAD_NUMBER_RE.sub('', cleaned).strip()
    # Strip "National Team" suffix
    cleaned = re.sub(r'\s+National\s+Team$', '', cleaned, flags=re.IGNORECASE).strip()
    # Strip region suffix like "-AD", "-DU"
    cleaned = _REGION_SUFFIX_RE.sub('', cleaned).strip()
    return cleaned or name.strip()


# Federation-style suffixes on national relay teams: "Kuwait Swimming",
# "Uae Aquatics Federation", "Qatar Swimming Association"…
_FEDERATION_SUFFIX_RE = re.compile(
    r'\s+(swimming|aquatics?)?\s*(federation|association|team)?$'
    r'|\s+(swimming|aquatics)$',
    re.IGNORECASE)


def country_for_relay_team(name):
    """Resolve a national relay-team placeholder name to its Country.

    Handles the source-file artifacts that produce ugly names:
      'EGY EGY'                → Egypt   (code doubled by the parser)
      'Kuwait Swimming'        → Kuwait  (federation suffix)
      'Uae Aquatics Federation'→ United Arab Emirates

    Deliberately does NOT resolve bare 3-letter codes ('EST' is a
    Tunisian club, not Estonia) or anything else that could be a club,
    so national-meet relay squads keep their club names.
    """
    if not name:
        return None
    from importer.matcher import resolve_country
    cleaned = name.strip()
    tokens = cleaned.split()
    # Doubled identical tokens: "EGY EGY" -> "EGY"
    if len(tokens) >= 2 and len({t.upper() for t in tokens}) == 1:
        return resolve_country(tokens[0])
    # Exact country NAME match ("Egypt", "United Arab Emirates") — codes
    # excluded on purpose (club abbreviations collide with IOC codes).
    hit = Country.objects.filter(name__iexact=cleaned).first()
    if hit:
        return hit
    # Federation suffix: "Kuwait Swimming" -> "Kuwait"
    stripped = _FEDERATION_SUFFIX_RE.sub('', cleaned).strip()
    if stripped and stripped != cleaned:
        return resolve_country(stripped)
    return None


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
        nt_c = nt_suffix_country(club)
        if not nt_c:
            if not club or club in skip_names or not is_valid_team_name(club):
                continue
            # National-team variants never become club teams
            if normalize_team_key(club) in skip_names:
                continue

        # Dedupe club variants within this scan by normalized key
        club_key = normalize_team_key(club)
        if club_key not in club_data:
            club_data[club_key] = {'name': club, 'count': 0, 'nationalities': {}, 'nt_country': None}
        if nt_c:
            club_data[club_key]['nt_country'] = nt_c
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
                   .values('team', 'championship__country__code',
                           'championship__classification__name')
                   .annotate(n=_Count('id')))
    for row in result_rows:
        # Only read clubs from National/Other meets — international meets
        # have country names in the team column, not actual clubs
        classification = row['championship__classification__name'] or ''
        if classification not in ('National', 'Other'):
            continue
        club = strip_squad_number((row['team'] or '')).strip()
        nt_c = nt_suffix_country(club)
        if not nt_c:
            if not club or club == 'LP' or not is_valid_team_name(club):
                continue
            if club in skip_names or normalize_team_key(club) in skip_names:
                continue
        club_key = normalize_team_key(club)
        if club_key not in club_data:
            club_data[club_key] = {'name': club, 'count': 0, 'nationalities': {}, 'nt_country': None}
        if nt_c:
            club_data[club_key]['nt_country'] = nt_c
        club_data[club_key]['count'] += row['n']
        # Vote the meet's host country, but ONLY for National/Other meets
        # where every club genuinely belongs to that country.  At
        # international meets a club is a guest — voting the host country
        # would give EST (Tunisia) a Qatar flag just because the swimmer
        # once competed at a Qatari meet.
        classification = row['championship__classification__name'] or ''
        code = row['championship__country__code']
        if code and classification in ('National', 'Other'):
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

        # National team: use its resolved country and flag it, never the
        # host-country vote (which would misfile "Djibouti NT" under Morocco).
        if data.get('nt_country'):
            Team.objects.create(
                name=club_name, country=data['nt_country'],
                is_national_team=True)
            created += 1
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
    # A name ending in "NT" is a national team — it gets its OWN country
    # (resolved from the name) and is flagged, never a host-country club.
    nt_country = nt_suffix_country(club_name)
    if not nt_country:
        skip_names = _get_skip_names()
        if club_name in skip_names or not is_valid_team_name(club_name):
            return None
        if normalize_team_key(club_name) in skip_names:
            return None

    club_key = normalize_team_key(club_name)
    for t in Team.objects.all():
        if normalize_team_key(t.name) == club_key:
            # Repair a national team that was mis-tagged (wrong country or
            # not flagged) by an earlier import before this rule existed.
            if nt_country and (not t.is_national_team or t.country_id != nt_country.id):
                t.is_national_team = True
                t.country = nt_country
                t.save(update_fields=['is_national_team', 'country'])
            return t

    country = nt_country or country or Country.objects.first()

    if country:
        team = Team.objects.create(
            name=club_name,
            country=country,
            is_national_team=bool(nt_country),
        )
        return team

    return None


def foreign_guest_country(team_name, host_country):
    """If a club fields 3+ distinct swimmers who are dominantly (>=60%) of a
    single FOREIGN nationality, return that Country — it is a genuine guest
    club (e.g. Spanish HUELVA at an international meet held in Morocco) and
    must never be forced onto the host country.

    Single- or two-swimmer clubs are deliberately treated as ambiguous and
    return None: a real host-country club can end up with only its one
    foreign-tagged athlete kept, and forcing the host country on those is the
    intended behavior of apply_subclassification_country.
    """
    from championships.models import Result
    from collections import Counter
    rows = (Result.objects.filter(team__iexact=team_name)
            .exclude(swimmer__nationality__isnull=True)
            .values_list('swimmer_id', 'swimmer__nationality__code',
                         'swimmer__nationality_id'))
    by_swimmer = {sid: (code, cid) for sid, code, cid in rows}
    if len(by_swimmer) < 3:
        return None
    (top_code, top_cid), n = Counter(by_swimmer.values()).most_common(1)[0]
    if n < len(by_swimmer) * 0.6:
        return None
    if host_country and top_code == host_country.code:
        return None
    return Country.objects.filter(id=top_cid).first()


def apply_subclassification_country(championship):
    """
    For meets classified as National/Other the sub-classification names the
    country the meet belongs to (e.g. classification=Other, sub=France means
    a French national-level meet). Every club that swam in such a meet is
    from that country, so force the matching Team records onto it.

    Fixes clubs whose country was mis-inferred from swimmer nationalities
    (e.g. a French club tagged as Belgian). Genuine foreign guest clubs
    (detected by foreign_guest_country) are exempt and kept on / moved to
    their own country. Returns count of teams updated.
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

    from championships.models import Result
    updated = 0
    matched = [t for t in Team.objects.filter(is_national_team=False)
               if normalize_team_key(t.name) in keys]
    for team in matched:
        # A genuine foreign guest club is put on / kept on its own country,
        # never the host — this also un-does an earlier wrong host tag.
        guest = foreign_guest_country(team.name, country)
        if guest:
            if team.country_id != guest.id:
                team.country = guest
                team.save(update_fields=['country'])
                updated += 1
            continue
        if team.country_id == country.id:
            continue
        # Only reassign if the team has more results in this country's
        # meets than in other countries — avoids overwriting a Tunisian
        # club (EST) to French just because it appeared in a French meet.
        total = Result.objects.filter(team__iexact=team.name).count()
        in_country = Result.objects.filter(
            team__iexact=team.name,
            championship__country=country,
            championship__classification__name__in=['National', 'Other'],
        ).count()
        if total == 0 or in_country > total * 0.5:
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
