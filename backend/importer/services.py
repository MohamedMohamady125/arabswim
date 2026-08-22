"""
Import service — orchestrates parsing, matching, and saving swim results.

Flow:
1. User uploads file
2. System parses and extracts structured data (preview)
3. System matches swimmers to existing DB entries
4. User reviews matches, confirms or adjusts
5. System saves confirmed data to DB
"""
import re
from datetime import date, timedelta
from django.db import transaction

from .parsers.detector import detect_and_parse, detect_and_parse_upload
from .matcher import match_all_results, find_matching_swimmer, resolve_country
from swimmers.models import Swimmer
from championships.models import Championship, Result
from core.models import Event, Country


# Map keywords in meet names to country codes
MEET_COUNTRY_KEYWORDS = {
    'liban': 'LBN', 'lebanon': 'LBN', 'lebanese': 'LBN',
    'algérie': 'ALG', 'algeria': 'ALG', 'algérien': 'ALG',
    'tunisie': 'TUN', 'tunisia': 'TUN', 'tunisien': 'TUN',
    'maroc': 'MAR', 'morocco': 'MAR', 'marocain': 'MAR', 'trone': 'MAR',
    'egypt': 'EGY', 'egypte': 'EGY', 'egyptian': 'EGY',
    'jordan': 'JOR', 'jordanie': 'JOR',
    'kuwait': 'KWT', 'koweït': 'KWT',
    'saudi': 'KSA', 'saoudite': 'KSA',
    'qatar': 'QAT',
    'bahrain': 'BHR', 'bahreïn': 'BHR',
    'oman': 'OMA',
    'emirates': 'UAE', 'émirats': 'UAE', 'dubai': 'UAE', 'hamilton': 'UAE',
    'iraq': 'IRQ', 'irak': 'IRQ',
    'syria': 'SYR', 'syrie': 'SYR',
    'palestine': 'PLE',
    'yemen': 'YEM', 'yémen': 'YEM',
    'libya': 'LBY', 'libye': 'LBY',
    'sudan': 'SUD', 'soudan': 'SUD',
    'oran': 'ALG', 'setif': 'ALG', 'alger': 'ALG',
    'rades': 'TUN', 'tunis': 'TUN',
    'marrakech': 'MAR', 'casablanca': 'MAR', 'rabat': 'MAR',
    'doha': 'QAT', 'manama': 'BHR',
}


def source_rank(value):
    """Coerce a parsed rank/place ('1', '1.', 'DSQ', '') to int or None."""
    try:
        rank = int(re.sub(r'[^\d]', '', str(value or '')) or 0)
    except (TypeError, ValueError):
        return None
    return rank or None


# Compound-surname particles: when one of these sits directly before the
# last word of a name, it belongs to the surname ("Maha Al Shehhi" ->
# surname "Al Shehhi", "Sara Ben Ali" -> surname "Ben Ali").
SURNAME_PARTICLES = {
    'AL', 'EL', 'BEN', 'BIN', 'BOU', 'ABOU', 'ABU', 'ABD', 'ABDEL',
    'ABDUL', 'OULD', 'VAN', 'DER', 'DE', 'DA', 'DI', 'DEL', 'LA', 'LE',
}


def uppercase_surname(name):
    """Uppercase the trailing surname of a "Given Surname" name.

    Site convention is "Given SURNAME". Some PDFs emit names without any
    uppercase surname ("Dora Buklu") — this fixes them to "Dora BUKLU".
    Compound particles directly before the last word are part of the
    surname; single-letter initials stay as given-name parts
    ("Saba A A H Sultan" -> "Saba A A H SULTAN"). Single-word names are
    left untouched (given/surname can't be told apart).
    """
    words = name.split()
    if len(words) < 2:
        return name
    start = len(words) - 1
    while start > 1 and words[start - 1].upper() in SURNAME_PARTICLES:
        start -= 1
    return ' '.join(words[:start] + [w.upper() for w in words[start:]])


def egyptian_name_format(name):
    """Format an Egyptian swimmer name: first name stays as-is, ALL
    subsequent words are uppercased.

    Egyptian swimmers typically have multi-part names (father, grandfather,
    family) and the site convention for Egypt is "Given REST ALL CAPS":
    "Ahmed MOHAMED HASSAN EL SAYED" not "Ahmed Mohamed Hassan EL SAYED".
    """
    words = name.split()
    if len(words) < 2:
        return name
    return words[0] + ' ' + ' '.join(w.upper() for w in words[1:])


def normalize_swimmer_name(text):
    """Normalize a swimmer name while preserving parser-formatted surnames.

    Parsers (FRMN, Nat2i, ...) already emit names as "First LASTNAME" with the
    surname in uppercase. Title-casing those would destroy the convention and
    leave the database with a mix of "Malak MEQDAR" (matched, kept as-is) and
    "Malak Meqdar" (newly created, title-cased). If the name already mixes an
    uppercase word with a non-uppercase word, keep the casing and only clean
    whitespace; otherwise fall back to normalize_name().
    """
    if not text or not isinstance(text, str):
        return text or ''
    # Strip rank/DQ/DNS prefixes that slipped through parsing
    text = re.sub(r'^-{2,}\s*', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return ''
    words = text.split()
    has_upper_word = any(w.isupper() and len(w) > 1 for w in words)
    has_mixed_word = any(not w.isupper() and any(c.isalpha() for c in w) for w in words)
    if has_upper_word and has_mixed_word:
        return text
    # No uppercase surname in the source ("Dora Buklu", "DORA BUKLU",
    # "dora buklu"): title-case, then uppercase the surname so every
    # import ends up on the "Given SURNAME" convention.
    return uppercase_surname(normalize_name(text))


def detect_and_fix_name_order(preview_data):
    """Smart name-order detection: when the parser can't tell if names are
    surname-first or given-first (e.g. all-caps Arab names), compare them
    against existing swimmers in the DB.

    If more existing swimmers match the flipped version than the original,
    flip all names in the preview. This runs once after parsing, before
    the user sees the preview.
    """
    from swimmers.models import Swimmer
    results = []
    for ev in preview_data.get('events', []):
        results.extend(ev.get('results', []))
    if not results:
        return preview_data

    # Collect names that are all-caps (ambiguous order)
    ambiguous = []
    for r in results:
        name = r.get('swimmer_name', '')
        if not name:
            continue
        words = name.split()
        if len(words) >= 2 and all(w == w.upper() for w in words if any(c.isalpha() for c in w)):
            ambiguous.append(name)

    if not ambiguous:
        return preview_data

    # Sample up to 30 ambiguous names — check if original or flipped matches more DB swimmers
    sample = list(set(ambiguous))[:30]
    original_hits = 0
    flipped_hits = 0
    for name in sample:
        words = name.split()
        flipped = ' '.join(words[1:] + words[:1])  # move first word to end
        if Swimmer.objects.filter(name__iexact=name, is_relay_team=False).exists():
            original_hits += 1
        if Swimmer.objects.filter(name__iexact=flipped, is_relay_team=False).exists():
            flipped_hits += 1

    if flipped_hits > original_hits and flipped_hits >= 2:
        # Flip all ambiguous names (all-caps multi-word)
        for ev in preview_data.get('events', []):
            for r in ev.get('results', []):
                name = r.get('swimmer_name', '')
                words = name.split()
                if len(words) >= 2 and all(w == w.upper() for w in words if any(c.isalpha() for c in w)):
                    r['swimmer_name'] = ' '.join(words[1:] + words[:1])

    return preview_data


def normalize_club_name(text):
    """Normalize a club/team name: clean whitespace, keep original casing.

    Club names must NOT be title-cased — many are acronyms or official
    all-caps names ('MC ALGER', 'ASPTT', 'CN Marseille'). Re-casing them
    created duplicate-looking clubs ('Mc Alger' vs 'MC ALGER'); matching
    is already case-insensitive (normalize_team_key / __iexact), so the
    original casing is safe to keep.
    """
    if not text or not isinstance(text, str):
        return text or ''
    return re.sub(r'\s+', ' ', text).strip()


def normalize_name(text):
    """Normalize text to title case for consistency.
    Handles ALL CAPS, all lower, and mixed cases.
    Preserves Roman numerals (II, III, IV, etc.) and common abbreviations.
    """
    if not text or not isinstance(text, str):
        return text or ''
    text = text.strip()
    if not text:
        return ''
    # Convert to title case
    result = text.title()
    # Fix common patterns that title() breaks:
    # Roman numerals
    for roman in ('Ii', 'Iii', 'Iv', 'Vi', 'Vii', 'Viii', 'Ix', 'Xi', 'Xii', 'Xiii', 'Xiv', 'Xv'):
        result = re.sub(r'\b' + roman + r'\b', roman.upper(), result)
    # Fix apostrophes (D'Alger -> D'Alger is fine, but d'Alger)
    result = re.sub(r"\b([A-Z])'([a-z])", lambda m: m.group(1) + "'" + m.group(2).upper(), result)
    # Fix "Mc" and "Al " prefixes
    result = re.sub(r'\bMc([a-z])', lambda m: 'Mc' + m.group(1).upper(), result)
    result = re.sub(r'\bAl ([a-z])', lambda m: 'Al ' + m.group(1).upper(), result)
    # Clean up extra whitespace
    result = re.sub(r'\s+', ' ', result).strip()
    return result


def _detect_country_from_meet(meet_name, location=''):
    """Detect the country from meet name and location text."""
    text = f'{meet_name} {location}'.lower()
    for keyword, code in MEET_COUNTRY_KEYWORDS.items():
        if keyword in text:
            return resolve_country(code)
    return None


def parse_file(file_path=None, uploaded_file=None, repair_index=None):
    """
    Step 1: Parse a file and return structured preview data.
    Returns a single preview dict, or a list of preview dicts for
    multi-meet Excel files.

    `repair_index` (egypt_names.NameRepairIndex, optional): full names
    extracted from the meet's companion PDFs, used to expand Hy-Tek
    15-char truncated Excel names before the preview is built.
    """
    if uploaded_file:
        parsed = detect_and_parse_upload(uploaded_file)
    elif file_path:
        parsed = detect_and_parse(file_path)
    else:
        raise ValueError('Must provide file_path or uploaded_file')

    meets = parsed if isinstance(parsed, list) else [parsed]
    if repair_index is not None and len(repair_index):
        for m in meets:
            repair_parsed_names(m, repair_index)

    if isinstance(parsed, list):
        return [_build_preview(m) for m in parsed]
    return _build_preview(parsed)


def repair_parsed_names(parsed_meet, repair_index):
    """Expand truncated swimmer names in a ParsedMeet in place.

    Uses a NameRepairIndex built from the meet's companion PDFs.  Only
    individual results whose name could be a Hy-Tek 15-char truncation
    are touched; ambiguous or unknown names are left as-is (never
    guessed).  Stats are stored on the meet as `_name_repair` so
    _build_preview can surface them in the upload response.
    """
    from .egypt_names import is_truncated_length
    stats = {'checked': 0, 'repaired': 0, 'ambiguous': 0, 'no_match': 0}
    memo = {}
    for ev in parsed_meet.events:
        low = ev.event_name.lower()
        if 'relay' in low or '4x' in low or '4×' in low:
            continue
        for r in ev.results:
            name = (r.swimmer_name or '').strip()
            if not name or not is_truncated_length(name):
                continue
            stats['checked'] += 1
            key = (name, r.age, r.club)
            if key not in memo:
                memo[key] = repair_index.repair(name, age=r.age, team=r.club)
            full, reason = memo[key]
            if full:
                r.swimmer_name = full
                stats['repaired'] += 1
            else:
                stats[reason] += 1
    parsed_meet._name_repair = stats
    return stats


def _letters_key(name):
    """Uppercase letters/digits only — spaces and punctuation dropped."""
    return re.sub(r'[^A-Z0-9À-ÖØ-Þ]', '', (name or '').upper())


def _edit_distance_le_1(a, b):
    """True when a and b differ by at most one insert/delete/substitute."""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la > lb:
        a, b, la, lb = b, a, lb, la
    # a is the shorter (or equal) string
    i = j = edits = 0
    while i < la and j < lb:
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if la == lb:
            i += 1  # substitution
        j += 1      # insertion in b
    edits += (la - i) + (lb - j)
    return edits <= 1


def canonicalize_parsed_clubs(parsed_meet):
    """Collapse club-name variants corrupted by PDF text overlap.

    Some PDFs (e.g. FFN) render record markers ('R', floating 'l'/'s'/'u')
    on top of the results line, so extraction yields variants like
    'RSTADE OLYMPIQUE CHAMBÉRY', 'STADE OLYMP IQUE CHAMBÉRY' or
    'OLYMPICs NICE NATATION' next to the real club. Each variant would
    become its own club/team. Merge them into the most frequent spelling:
    exact matches once spaces/punctuation are dropped, plus rare variants
    (≤2 results) one edit away from a clearly more frequent club.
    """
    from collections import Counter
    counts = Counter()
    for ev in parsed_meet.events:
        for r in ev.results:
            c = (r.club or '').strip()
            if c:
                counts[c] += 1
    if len(counts) < 2:
        return {}

    # Most frequent spelling per letters-only key
    by_key = {}
    for name, n in counts.items():
        k = _letters_key(name)
        if k and (k not in by_key or counts[by_key[k]] < n):
            by_key[k] = name

    mapping = {}
    for name, n in counts.items():
        k = _letters_key(name)
        canon = by_key.get(k)
        if canon and canon != name:
            mapping[name] = canon
            continue
        if n > 2:
            continue
        # Rare variant: absorb into a much more frequent near-identical club
        best = None
        for other, m in counts.items():
            if other == name or m < max(3, n * 3):
                continue
            ko = _letters_key(other)
            if _edit_distance_le_1(k, ko) and (best is None or m > counts[best]):
                best = other
        if best:
            mapping[name] = best

    if mapping:
        for ev in parsed_meet.events:
            for r in ev.results:
                c = (r.club or '').strip()
                if c in mapping:
                    r.club = mapping[c]
    return mapping


def _build_preview(parsed_meet):
    """Convert ParsedMeet to a JSON-serializable preview dict."""
    canonicalize_parsed_clubs(parsed_meet)
    events = []
    all_swimmers = {}  # unique swimmers by normalized name

    # Detect country from meet info
    inferred_country = _detect_country_from_meet(
        parsed_meet.meet_name, parsed_meet.location
    )
    inferred_country_code = inferred_country.code if inferred_country else ''

    # Detect international meet: majority of results carry nationality codes
    # from the parser. In domestic meets, clubs should stay as clubs — their
    # abbreviations (e.g. "EST") may collide with country codes.
    all_results = [r for ev in parsed_meet.events for r in ev.results]
    has_nat_count = sum(1 for r in all_results if r.nationality_code)
    is_international = has_nat_count > len(all_results) * 0.5

    # Fallback: some HyTek PDFs put full country names in the Team/club
    # column but never set nationality_code. If most clubs resolve as
    # countries, this is an international meet. Only consider clubs longer
    # than 3 chars to avoid IOC-code collisions with domestic club
    # abbreviations (e.g. "COL" the club vs Colombia the country).
    if not is_international and all_results:
        club_resolves = sum(
            1 for r in all_results
            if r.club and len(r.club) > 3 and resolve_country(r.club)
        )
        if club_resolves > len(all_results) * 0.5:
            is_international = True

    # Whether the file carries any nationality signal (codes or country-like
    # clubs). Code-less swimmers in such files get the meet country stamped
    # for the preview — except UAE meets, whose expat-heavy fields say
    # nothing about an athlete's nationality. (Files with no signal at all
    # leave the preview blank; confirm_import applies the host-country
    # fallback to newly created swimmers, again outside the UAE.)
    file_has_nationality = is_international or has_nat_count > 0

    # Determine meet year for birth_year calculation from age
    meet_year = 0
    if parsed_meet.date_text:
        m = re.search(r'(\d{4})', parsed_meet.date_text)
        if m:
            meet_year = int(m.group(1))
    if not meet_year:
        meet_year = date.today().year

    for event in parsed_meet.events:
        is_relay = 'relay' in event.event_name.lower() or '4x' in event.event_name.lower() or '4×' in event.event_name.lower()

        event_data = {
            'event_name': event.event_name,
            'distance': event.distance,
            'stroke': event.stroke,
            'gender': event.gender,
            'round_type': event.round_type,
            'age_group': event.age_group,
            'is_relay': is_relay,
            # Session date (YYYY-MM-DD) when the source file schedules the
            # event on a specific day — powers program auto-extraction.
            'session_date': getattr(event, 'date_text', '') or '',
            'results': [],
        }

        for r in event.results:
            if r.status not in ('OK', 'HC', 'TLD') or r.time_centiseconds <= 0:
                continue

            # Use club as nationality when it resolves to a country,
            # otherwise fall back to the meet's host country.
            # When the club IS a country (national-team meet), clear it
            # so it doesn't show redundantly alongside nationality.
            # Only try club→country in international meets (majority of
            # results already carry a nationality code from the parser);
            # in domestic meets, club abbreviations like "EST" collide
            # with country codes (Estonia) and produce wrong nationalities.
            nat_code = r.nationality_code
            club_is_country = False
            nat_inferred = False
            if not nat_code and r.club and is_international and len(r.club) > 3:
                club_country = resolve_country(r.club)
                if club_country:
                    nat_code = club_country.code
                    club_is_country = True
            if not nat_code and file_has_nationality and inferred_country_code != 'UAE':
                nat_code = inferred_country_code
                # Meet-country fallback, not an explicit code from the file —
                # must never trigger a nationality change on matched swimmers
                # (a Jordanian guest at the Hungarian nationals is not Hungarian).
                nat_inferred = True

            # Compute birth_year and age from each other when one is missing
            birth_year = r.birth_year
            age = r.age
            if not birth_year and age:
                birth_year = meet_year - age
            elif birth_year and not age:
                age = meet_year - birth_year

            # Always calculate FINA points from World Aquatics base times
            gender_for_event = r.gender or event.gender
            fina_points = 0
            if r.time_centiseconds > 0:
                from .points import calculate_points
                fina_points = calculate_points(
                    r.time_centiseconds,
                    event.event_name,
                    gender_for_event,
                    parsed_meet.pool,
                )

            display_name = r.swimmer_name
            if is_relay:
                from teams.utils import clean_relay_team_name
                display_name = clean_relay_team_name(r.swimmer_name)

            result_data = {
                'swimmer_name': display_name,
                'time_text': r.time_text,
                'time_centiseconds': r.time_centiseconds,
                'rank': r.rank,
                'birth_year': birth_year,
                'age': age,
                'nationality_code': nat_code,
                'nationality_inferred': nat_inferred,
                'club': '' if club_is_country else r.club,
                'fina_points': fina_points,
                'gender': gender_for_event,
                'is_relay': is_relay,
                'category': event.age_group or '',
                'status': r.status,
            }
            if r.split_times:
                result_data['split_times'] = r.split_times
            event_data['results'].append(result_data)

            # Track unique swimmers (skip relay team names)
            if not is_relay:
                key = r.swimmer_name.upper()
                if key not in all_swimmers:
                    all_swimmers[key] = {
                        'name': r.swimmer_name,
                        'birth_year': birth_year,
                        'nationality_code': nat_code,
                        'gender': r.gender or event.gender,
                        'club': r.club,
                        'age': r.age,
                        'results_count': 0,
                    }
                all_swimmers[key]['results_count'] += 1

        if event_data['results']:
            events.append(event_data)

    # Extra metadata from Excel files
    excel_meet_country = getattr(parsed_meet, '_excel_meet_country', '')
    excel_classification = getattr(parsed_meet, '_excel_classification', '')
    excel_sub_classification = getattr(parsed_meet, '_excel_sub_classification', '')

    # If no inferred country from meet name, try the Excel meet country column
    if not inferred_country_code and excel_meet_country:
        ec = _detect_country_from_meet(excel_meet_country)
        if ec:
            inferred_country_code = ec.code

    # Program summary: which events run on which day/session, extracted
    # from per-event session dates in the source file (when present).
    # Shown in the import wizard so the admin can QA it before confirm.
    program = []
    prog_seen = set()
    for event_data in events:
        sd = event_data.get('session_date')
        if not sd:
            continue
        session = ROUND_TO_SESSION.get(event_data.get('round_type') or '', '')
        ag = event_data.get('age_group') or ''
        if ag.upper() == 'OPEN':
            ag = ''
        key = (sd, event_data['event_name'], event_data['gender'], session, ag)
        if key in prog_seen:
            continue
        prog_seen.add(key)
        program.append({
            'date': sd,
            'event_name': event_data['event_name'],
            'gender': event_data['gender'],
            'session': session,
            'age_category': ag,
        })
    program.sort(key=lambda p: p['date'])

    preview = {
        'meet': {
            'name': parsed_meet.meet_name,
            'location': parsed_meet.location,
            'date': parsed_meet.date_text,
            'date_end': getattr(parsed_meet, 'date_end', ''),
            'pool': parsed_meet.pool,
            'format': parsed_meet.source_format,
            'inferred_country': inferred_country_code,
            'classification': excel_classification,
            'sub_classification': excel_sub_classification,
            'has_open_results': getattr(parsed_meet, '_has_open_results', False),
        },
        'stats': {
            'total_events': len(events),
            'total_results': sum(len(e['results']) for e in events),
            'total_swimmers': len(all_swimmers),
        },
        'events': events,
        'swimmers': list(all_swimmers.values()),
        'program': program,
        'name_repair': getattr(parsed_meet, '_name_repair', None),
    }
    # Smart name-order detection: if the parser left all-caps names
    # ambiguous, compare against the DB to decide whether to flip.
    return detect_and_fix_name_order(preview)


# Parsed round_type -> ProgramItem.session value
ROUND_TO_SESSION = {
    'Heats': 'HEATS',
    'Finals': 'FINALS',
    'Semifinals': 'SEMIS',
    'Semis': 'SEMIS',
}


# All codes (DB, IOC, ISO, legacy) that identify an Arab country.
# Keep in sync with matcher.COUNTRY_CODE_ALIASES.
ARAB_COUNTRY_CODES = {
    'ALG', 'DZA', 'BHR', 'BRN', 'BAH', 'COM', 'DJI', 'EGY', 'UAR',
    'IRQ', 'JOR', 'KWT', 'KUW', 'LBN', 'LIB', 'LBY', 'LBA',
    'MTN', 'MRT', 'MAR', 'MOR', 'OMA', 'OMN', 'PLE', 'PAL', 'PSE',
    'QAT', 'KSA', 'SAU', 'SOM', 'SUD', 'SDN', 'SYR', 'TUN',
    'UAE', 'ARE', 'YEM',
}


def match_swimmers_preview(preview_data):
    """
    Step 2: Match extracted swimmers against database.
    Returns enriched preview with match suggestions.
    Only shows Arab nationality swimmers for matching — other swimmers'
    results are kept but they don't need accounts created.
    """
    swimmers = preview_data.get('swimmers', [])
    matched = []

    from .parsers.base import ParsedResult

    for s in swimmers:
        # Skip non-Arab swimmers in matching (their results are still imported)
        nat_code = s.get('nationality_code', '').upper()
        if nat_code and nat_code not in ARAB_COUNTRY_CODES:
            continue
        # Create a minimal ParsedResult for matching
        pr = ParsedResult(
            swimmer_name=s['name'],
            time_text='',
            birth_year=s.get('birth_year', 0),
            nationality_code=s.get('nationality_code', ''),
            age=s.get('age', 0),
        )

        swimmer, confidence, match_type = find_matching_swimmer(pr, threshold=92)

        match_info = {
            'parsed_name': s['name'],
            'birth_year': s.get('birth_year', 0),
            'nationality_code': s.get('nationality_code', ''),
            'gender': s.get('gender', ''),
            'club': s.get('club', ''),
            'results_count': s.get('results_count', 0),
            'match_type': match_type,
            'confidence': confidence,
            'matched_swimmer': None,
        }

        if swimmer:
            match_info['matched_swimmer'] = {
                'id': swimmer.id,
                'name': swimmer.name,
                'nationality': swimmer.nationality.name if swimmer.nationality else '',
                'date_of_birth': str(swimmer.date_of_birth) if swimmer.date_of_birth else '',
                'sex': swimmer.sex,
            }

        matched.append(match_info)

    # Sort: new swimmers first, then by confidence ascending (least confident matches need review)
    matched.sort(key=lambda x: (x['match_type'] != 'new', x['confidence']))

    return matched


@transaction.atomic
def _find_same_meet(meet_name, champ_date, pool, country):
    """Find an existing championship that is the same physical meet.

    Same country + pool, near-identical name, and dates at most 45 days
    apart. Keeps annual editions separate (a year apart) while merging
    multi-file releases of one championship.
    """
    from thefuzz import fuzz
    meet_name = normalize_name(meet_name or '').strip()
    if not meet_name or not champ_date or not country:
        return None
    window = timedelta(days=45)
    candidates = (Championship.objects
                  .filter(country=country, pool=pool,
                          date__gte=champ_date - window,
                          date__lte=champ_date + window))
    for champ in candidates:
        if fuzz.token_sort_ratio(meet_name.upper(), champ.name.upper()) >= 90:
            return champ
    return None


def _extend_meet_dates(championship, new_date, new_end_date=None):
    """Widen the championship's date range to cover a newly imported file."""
    changed = []
    if new_date and championship.date and new_date < championship.date:
        championship.date = new_date
        changed.append('date')
    last = new_end_date or new_date
    current_end = championship.end_date or championship.date
    if last and current_end and last > current_end:
        championship.end_date = last
        changed.append('end_date')
    if changed:
        championship.save(update_fields=changed)


@transaction.atomic
def confirm_import(preview_data, swimmer_decisions, championship_id=None, championship_details=None,
                   progress_cb=None):
    """
    Step 3: Confirm and save the imported data.

    Args:
        preview_data: The preview from parse_file()
        swimmer_decisions: Dict mapping parsed_name -> {
            'action': 'match' | 'create' | 'skip',
            'swimmer_id': int (for 'match'),
        }
        championship_id: Existing championship to add results to (optional)
        championship_details: Dict from the user-editable form with:
            name, country, pool, date, end_date, location,
            classification_category, classification, sub_classification
        progress_cb: Optional callable(text) invoked with human-readable
            progress ("12000 / 66869 results…"). Called from inside the
            import transaction — it must not write through this thread's
            DB connection (background jobs copy the text to a shared dict
            that a separate thread persists).

    Returns: Summary of what was saved.
    """
    from .matcher import invalidate_norm_cache
    invalidate_norm_cache()

    def _progress(text):
        if progress_cb:
            try:
                progress_cb(text)
            except Exception:
                pass

    meet_info = preview_data['meet']

    # Resolve the country for swimmers fallback
    meet_country = None
    if championship_details and championship_details.get('country'):
        try:
            meet_country = Country.objects.get(id=int(championship_details['country']))
        except (Country.DoesNotExist, ValueError):
            pass
    if not meet_country:
        meet_country = _detect_country_from_meet(
            meet_info.get('name', ''), meet_info.get('location', '')
        )
    if not meet_country:
        meet_country = _most_common_country(preview_data)
    country_known = meet_country is not None
    if not meet_country:
        meet_country = Country.objects.first()

    # New swimmers with no nationality in the file inherit the meet's host
    # country ("National · Tunisia" ⇒ Tunisian) — except UAE meets, whose
    # expat-heavy fields must stay nationality-less rather than all be
    # stamped Emirati. Matched swimmers always keep their DB nationality
    # unless the file carries an explicit different code.
    swimmer_fallback = (
        meet_country if country_known and meet_country.code != 'UAE' else None)

    # Get or create championship
    if championship_id:
        championship = Championship.objects.get(id=championship_id)
        if championship.is_calendar_only:
            # Real results are being imported: promote from calendar-only
            championship.is_calendar_only = False
            championship.save(update_fields=['is_calendar_only'])
    elif (existing := _find_same_meet(
            (championship_details or {}).get('name') or meet_info.get('name', ''),
            _parse_date((championship_details or {}).get('date') or meet_info.get('date', '')),
            (championship_details or {}).get('pool') or meet_info.get('pool', 'LCM'),
            meet_country)):
        # Federations often release the same championship as several files
        # (e.g. Tunisia: one per age category plus a "TC" overall version,
        # each stamped with a different session date). Attach to the
        # existing meet instead of creating a duplicate.
        championship = existing
        _extend_meet_dates(
            championship,
            _parse_date((championship_details or {}).get('date') or meet_info.get('date', '')),
            _parse_date((championship_details or {}).get('end_date') or '') if (championship_details or {}).get('end_date') else None,
        )
        if championship.is_calendar_only:
            championship.is_calendar_only = False
            championship.save(update_fields=['is_calendar_only'])
    elif championship_details:
        # Use user-provided details from the form
        champ_date = _parse_date(championship_details.get('date', ''))
        champ_kwargs = {
            'name': normalize_name(championship_details.get('name') or meet_info.get('name', 'Imported Meet')),
            'date': champ_date,
            'pool': championship_details.get('pool') or meet_info.get('pool', 'LCM'),
            'country': meet_country,
            'location': normalize_name(championship_details.get('location', '')),
        }
        # Optional end date
        end_date_str = championship_details.get('end_date', '')
        if end_date_str:
            champ_kwargs['end_date'] = _parse_date(end_date_str)
        # Optional classification fields (2 levels only)
        for field in ('classification', 'sub_classification'):
            val = championship_details.get(field)
            if val:
                champ_kwargs[field + '_id'] = int(val)

        championship = Championship.objects.create(**champ_kwargs)
    else:
        championship_date = _parse_date(meet_info.get('date', ''))
        pool = meet_info.get('pool', 'LCM')

        championship = Championship.objects.create(
            name=normalize_name(meet_info.get('name', 'Imported Meet')),
            date=championship_date,
            pool=pool,
            country=meet_country,
            location=normalize_name(meet_info.get('location', '')),
        )

    # The source published an open classification alongside age groups
    # (Egyptian Hy-Tek 'Event 1O' duplicates, dropped at parse time):
    # award open-podium medals on top of the per-category podiums.
    if meet_info.get('has_open_results') and not championship.has_open_podium:
        championship.has_open_podium = True
        championship.save(update_fields=['has_open_podium'])

    # Build event cache
    event_cache = {}
    for db_event in Event.objects.all():
        event_cache[db_event.name.upper()] = db_event

    # Process results
    created_swimmers = 0
    matched_swimmers = 0
    nationality_changes = 0
    skipped_swimmers = 0
    created_results = 0
    skipped_results = 0
    skipped_details = []

    # Map swimmer identities to Swimmer objects. Two athletes can share a
    # name within one meet (e.g. two "Youssef Trabelsi"s, one Cadet, one
    # Minime) — so the identity is name + birth year when known, otherwise
    # name + exclusive age band.
    from .matcher import category_band, bands_conflict, clubs_equivalent
    swimmer_map = {}
    name_bands = {}  # NAME -> {band: identity_key} for birth-year-less rows
    # Result rows matched/updated/created during this run. Legacy merged
    # relay rows are updated in place — but never a row another squad
    # already claimed in this import.
    claimed_results = set()
    # Swimmers whose club field was already reconciled during this run
    club_synced = set()

    year_clubs = {}  # (NAME, 'Y', year) -> first club seen for that identity

    def individual_key(name_upper, band, birth_year, club=''):
        if birth_year:
            base = (name_upper, 'Y', birth_year)
            club_norm = (club or '').strip().upper()
            first_club = year_clubs.setdefault(base, club_norm)
            # Fuzzy club comparison: PDF extraction glitches ("GRENOBLE
            # ALP'38" vs "GRENOBsLE ALP'38") must not split one athlete
            # into two identities.
            if club_norm and first_club and not clubs_equivalent(club_norm, first_club):
                # Same name AND same birth year but different club — two
                # different athletes (e.g. two "Mohamed Amine DRIDI"
                # b.2010, clubs CA and OLYMPICA).
                return (name_upper, 'Y', birth_year, club_norm)
            return base
        bands = name_bands.setdefault(name_upper, {})
        if band in bands:
            return bands[band]
        if band:
            # A broad-only identity (seen in Open/TC lists) is the same
            # person unless another exclusive band already claimed it.
            if set(bands) == {''}:
                bands[band] = bands['']
                return bands[band]
        else:
            # Broad category: reuse the known identity when unambiguous;
            # with several same-named athletes we can't tell — use the first.
            if bands:
                bands[''] = next(iter(bands.values()))
                return bands['']
        key = (name_upper, 'B', band)
        bands[band] = key
        return key

    # Program entries extracted from per-event session dates in the source
    program_entries = []  # (date_iso, db_event, gender, session, age_cat)
    program_seen = set()

    total_planned = sum(len(ev.get('results', [])) for ev in preview_data['events'])
    processed = 0

    for event_data in preview_data['events']:
        processed += len(event_data.get('results', []))
        _progress(f'Saving results — {processed:,} / {total_planned:,}')
        # Find or create the event
        db_event = _find_event(event_data, event_cache)
        if not db_event:
            continue

        session_date = event_data.get('session_date') or ''
        if session_date:
            session = ROUND_TO_SESSION.get(event_data.get('round_type') or '', '')
            prog_ag = event_data.get('age_group') or ''
            if prog_ag.upper() == 'OPEN':
                prog_ag = ''
            prog_gender = event_data.get('gender') or 'X'
            prog_key = (session_date, db_event.id, prog_gender, session, prog_ag)
            if prog_key not in program_seen:
                program_seen.add(prog_key)
                program_entries.append((session_date, db_event, prog_gender, session, prog_ag))

        is_relay = event_data.get('is_relay', False)

        for result_data in event_data['results']:
            parsed_name = result_data['swimmer_name']
            if is_relay or result_data.get('is_relay', False):
                # Clean relay team names: strip squad numbers/letters,
                # "National Team" suffix, and region codes like "-AD"
                # so placeholder swimmers match existing teams consistently.
                from teams.utils import clean_relay_team_name, country_for_relay_team
                parsed_name = clean_relay_team_name(parsed_name)
                # National relay teams keep their country's proper name —
                # never source artifacts like "EGY EGY" or "Kuwait Swimming".
                team_country = country_for_relay_team(parsed_name)
                if team_country:
                    parsed_name = team_country.name
            squad_name = parsed_name.strip()
            name_upper = parsed_name.upper()

            relay_gender = result_data.get('gender', '') or event_data.get('gender', 'M') or 'M'
            relay_key = f"{name_upper}_{relay_gender}"

            # Non-Arab swimmers (region OTHER) are imported too — their
            # results appear in meets normally. Their swimmer rows exist
            # only to hold results and are hidden from the Swimmers section.

            if is_relay or result_data.get('is_relay', False):
                # Guard: a relay "swimmer" is a team name. If parsing glitched
                # and the name is a time/number, skip instead of creating a
                # junk placeholder swimmer (which then becomes a junk Team).
                from teams.utils import is_valid_team_name
                if not is_valid_team_name(parsed_name):
                    skipped_results += 1
                    skipped_details.append({
                        'swimmer': parsed_name,
                        'event': event_data.get('event_name', ''),
                        'reason': 'Invalid relay team name (looks like a time/number)',
                    })
                    continue
                if relay_key not in swimmer_map:
                    # Try to find existing placeholder with matching sex
                    existing_placeholder = Swimmer.objects.filter(name__iexact=parsed_name, sex=relay_gender).first()
                    if existing_placeholder:
                        if not existing_placeholder.is_relay_team:
                            existing_placeholder.is_relay_team = True
                            existing_placeholder.save(update_fields=['is_relay_team'])
                        swimmer_map[relay_key] = existing_placeholder
                    else:
                        # Resolve nationality for the team
                        nationality = team_country
                        nat_code = result_data.get('nationality_code', '')
                        if not nationality and nat_code:
                            nationality = resolve_country(nat_code)
                        if not nationality:
                            nationality = swimmer_fallback

                        swimmer_map[relay_key] = Swimmer.objects.create(
                            name=parsed_name if team_country else normalize_club_name(parsed_name),
                            date_of_birth=None,
                            birth_year=None,
                            nationality=nationality,
                            sex=relay_gender,
                            # Country teams are not clubs — leave club empty
                            club='' if team_country else normalize_club_name(parsed_name),
                            is_relay_team=True,
                        )
                        created_swimmers += 1
            else:
                # Individual: normal swimmer matching
                band = category_band(
                    result_data.get('category', '') or event_data.get('age_group', '') or '')
                ind_key = individual_key(
                    name_upper, band, result_data.get('birth_year', 0) or 0,
                    result_data.get('club', ''))
                if ind_key not in swimmer_map:
                    decision = swimmer_decisions.get(parsed_name, swimmer_decisions.get(name_upper, {}))
                    action = decision.get('action', 'auto')

                    if action == 'skip':
                        swimmer_map[ind_key] = None
                        skipped_swimmers += 1
                    elif action == 'match' and decision.get('swimmer_id'):
                        swimmer_map[ind_key] = Swimmer.objects.get(id=decision['swimmer_id'])
                        matched_swimmers += 1
                        if _maybe_record_nationality_change(
                                swimmer_map[ind_key], result_data, championship):
                            nationality_changes += 1
                    elif action == 'create':
                        swimmer_map[ind_key] = _create_swimmer(result_data, swimmer_fallback)
                        created_swimmers += 1
                    else:
                        # Auto: try to match, create if new
                        from .parsers.base import ParsedResult as PR
                        pr = PR(
                            swimmer_name=parsed_name,
                            time_text='',
                            birth_year=result_data.get('birth_year', 0),
                            nationality_code=result_data.get('nationality_code', ''),
                            age=result_data.get('age', 0),
                            club=result_data.get('club', ''),
                        )
                        swimmer, conf, mtype = find_matching_swimmer(
                            pr, threshold=92, category=band,
                            meet_date=championship.date)
                        # Never reuse a swimmer another identity in this
                        # import already claimed under a conflicting band
                        # or a different explicit birth year (two same-named
                        # athletes, e.g. Lina MAHI 2006 and Lina MAHI 2007 —
                        # the matcher's ±1-year tolerance would merge them).
                        if swimmer is not None:
                            for other_key, other_sw in swimmer_map.items():
                                if (other_sw is not None and other_sw.id == swimmer.id
                                        and other_key[0] == name_upper and other_key != ind_key):
                                    if (other_key[1] == 'B'
                                            and bands_conflict(other_key[2], band)):
                                        swimmer = None
                                        break
                                    # Two 'Y' identities with the same name
                                    # are distinct athletes: either different
                                    # birth years, or same year but different
                                    # clubs (club-suffixed keys).
                                    if other_key[1] == 'Y' and ind_key[1] == 'Y':
                                        swimmer = None
                                        break
                        if swimmer:
                            swimmer_map[ind_key] = swimmer
                            matched_swimmers += 1
                            if _maybe_record_nationality_change(
                                    swimmer, result_data, championship):
                                nationality_changes += 1
                        else:
                            swimmer_map[ind_key] = _create_swimmer(result_data, swimmer_fallback)
                            created_swimmers += 1

            lookup_key = relay_key if (is_relay or result_data.get('is_relay', False)) else ind_key
            swimmer = swimmer_map.get(lookup_key)
            if not swimmer:
                skipped_results += 1
                skipped_details.append({
                    'swimmer': parsed_name,
                    'event': event_data.get('event_name', ''),
                    'reason': 'Swimmer skipped by user',
                })
                continue

            # Create result (skip duplicates)
            time_cs = result_data['time_centiseconds']
            if time_cs <= 0:
                skipped_results += 1
                skipped_details.append({
                    'swimmer': parsed_name,
                    'event': event_data.get('event_name', ''),
                    'reason': 'Invalid time',
                })
                continue

            # Compute age at competition
            age_at_comp = result_data.get('age', 0)
            if not age_at_comp and swimmer.date_of_birth and championship.date:
                age_at_comp = championship.date.year - swimmer.date_of_birth.year

            # Determine team
            if is_relay or result_data.get('is_relay', False):
                # Use original swimmer_name (e.g. "MC ALGER 2") as team, not
                # the cleaned parsed_name which has the squad number stripped.
                team = normalize_club_name(result_data['swimmer_name'])
            else:
                from teams.utils import strip_squad_number
                raw_club = strip_squad_number(result_data.get('club', '')).strip()
                if raw_club.upper() == 'LP':
                    # "LP" (libre passage) = no club, swimmer is transferring.
                    # Keep the marker verbatim on the result; never treat it
                    # as a real club.
                    team = 'LP'
                else:
                    team = normalize_club_name(raw_club)

            # Keep swimmer's club current: set it when blank, and update it
            # when this meet is the swimmer's most recent one (athletes have
            # a single current club — the one they last competed for).
            if team and team != 'LP' and not (is_relay or result_data.get('is_relay', False)) \
                    and swimmer.id not in club_synced:
                from teams.utils import is_valid_team_name
                if is_valid_team_name(team):
                    new_club = normalize_club_name(team)
                    if not swimmer.club:
                        swimmer.club = new_club
                        swimmer.save(update_fields=['club'])
                    elif swimmer.club != new_club and championship.date:
                        latest = (Result.objects
                                  .filter(swimmer=swimmer, championship__date__isnull=False)
                                  .exclude(championship=championship)
                                  .order_by('-championship__date')
                                  .values_list('championship__date', flat=True)
                                  .first())
                        if not latest or championship.date >= latest:
                            swimmer.club = new_club
                            swimmer.save(update_fields=['club'])
                club_synced.add(swimmer.id)

            round_type = event_data.get('round_type', '') or ''
            category = result_data.get('category', '') or event_data.get('age_group', '') or ''

            if is_relay or result_data.get('is_relay', False):
                # A club can enter several squads in one relay event
                # ("MC ALGER 1", "MC ALGER 2") that share one placeholder
                # swimmer — dedupe by time so each squad keeps its row,
                # while re-imports of the same squad stay idempotent.
                existing = Result.objects.filter(
                    swimmer=swimmer,
                    championship=championship,
                    event=db_event,
                    round_type=round_type,
                    category=category,
                    time_centiseconds=time_cs,
                ).first()
                if not existing:
                    # TC and per-category files publish the same relay swim
                    # (identical club/round/time) with and without an age
                    # category — blank matches any category, like the
                    # individual dedupe below.
                    twin_qs = Result.objects.filter(
                        swimmer=swimmer,
                        championship=championship,
                        event=db_event,
                        round_type=round_type,
                        time_centiseconds=time_cs,
                    )
                    existing = (twin_qs.filter(category='') if category
                                else twin_qs.exclude(category='')).first()
                    if existing and category and not existing.category:
                        # Adopt the richer per-category label
                        existing.category = category
                        existing.save(update_fields=['category'])
                if existing:
                    claimed_results.add(existing.id)
                    # Refresh leg swimmers on re-import: earlier parser
                    # versions stored corrupted legs (merged names, stray
                    # "M13"/"W14" tokens from mixed relays) — a re-upload
                    # of the source file repairs them in place.
                    new_legs = _parse_relay_legs(
                        result_data.get('split_times', []) or [])
                    if new_legs and existing.relay_swimmers != new_legs:
                        existing.relay_swimmers = new_legs
                        existing.save(update_fields=['relay_swimmers'])
                    # Legacy rows stored the stripped club name; adopt the
                    # squad-numbered name so squads stay distinguishable.
                    if team and existing.team != team and not Result.objects.filter(
                            swimmer=swimmer, championship=championship,
                            event=db_event, round_type=round_type,
                            category=category, team__iexact=team,
                            time_centiseconds=time_cs).exists():
                        existing.team = team
                        existing.save(update_fields=['team'])
                    from .parsers.base import format_centiseconds
                    skipped_results += 1
                    skipped_details.append({
                        'swimmer': squad_name,
                        'event': event_data.get('event_name', ''),
                        'round': round_type,
                        'reason': f'Duplicate — same time {format_centiseconds(time_cs)} already exists',
                    })
                    continue
                # No same-time row. An unclaimed row with this exact team
                # name is a legacy merged row (old imports kept one "better
                # time" per club) — update it in place. Rows claimed by
                # other squads this run are never touched.
                same_team = Result.objects.filter(
                    swimmer=swimmer,
                    championship=championship,
                    event=db_event,
                    round_type=round_type,
                    category=category,
                    team__iexact=team,
                ).exclude(id__in=claimed_results).first()
                if same_team:
                    from .points import calculate_points
                    gender_code = result_data.get('gender', 'M') or 'M'
                    same_team.time_centiseconds = time_cs
                    same_team.original_rank = source_rank(result_data.get('rank'))
                    same_team.team = team  # normalize team name
                    same_team.relay_swimmers = _parse_relay_legs(
                        result_data.get('split_times', []) or []) or same_team.relay_swimmers
                    same_team.fina_points = calculate_points(
                        time_cs, event_data.get('event_name', db_event.name),
                        gender_code, championship.pool) or None
                    same_team.save()
                    claimed_results.add(same_team.id)
                    created_results += 1
                    continue
                existing = None
            else:
                existing = Result.objects.filter(
                    swimmer=swimmer,
                    championship=championship,
                    event=db_event,
                    round_type=round_type,
                    category=category,
                ).first()
                if not existing:
                    # Federations release the same meet both as a TC
                    # ("toutes catégories") file with blank categories and a
                    # per-category file. Both describe the same physical
                    # swims, so a blank category matches any category —
                    # otherwise importing both files duplicates every result.
                    twin_qs = Result.objects.filter(
                        swimmer=swimmer,
                        championship=championship,
                        event=db_event,
                        round_type=round_type,
                    )
                    existing = (twin_qs.filter(category='') if category
                                else twin_qs.exclude(category='')).first()
                    if existing and category and not existing.category:
                        # Adopt the richer per-category label
                        existing.category = category
                        existing.save(update_fields=['category'])

            if existing:
                # Keep the better time
                if time_cs < existing.time_centiseconds:
                    existing.time_centiseconds = time_cs
                    existing.original_rank = source_rank(result_data.get('rank'))
                    existing.fina_points = result_data.get('fina_points', 0) or existing.fina_points
                    existing.is_hc = (result_data.get('status') in ('HC', 'TLD'))
                    existing.hc_type = result_data.get('status') if result_data.get('status') in ('HC', 'TLD') else ''
                    if team:
                        existing.team = team
                    existing.save()
                    created_results += 1
                else:
                    from .parsers.base import format_centiseconds
                    skipped_results += 1
                    existing_time = format_centiseconds(existing.time_centiseconds)
                    new_time = format_centiseconds(time_cs)
                    if existing.time_centiseconds == time_cs:
                        reason = f'Duplicate — same time {existing_time} already exists'
                    else:
                        reason = f'Duplicate — existing time {existing_time} is better than {new_time}'
                    skipped_details.append({
                        'swimmer': parsed_name,
                        'event': event_data.get('event_name', ''),
                        'round': round_type,
                        'reason': reason,
                    })
            else:
                # Parse relay swimmer splits into structured data
                relay_swimmers = None
                splits = None
                if not (is_relay or result_data.get('is_relay', False)):
                    raw_splits = result_data.get('split_times', [])
                    if raw_splits:
                        import re as _re
                        splits = []
                        for split_str in raw_splits:
                            s = str(split_str).strip()
                            # "50m: 00:25.77" / "50m : 25.77" → labeled split
                            m = _re.match(r'^(\d{2,4})m\s*:?\s*(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})$', s)
                            # "25.77 (50m)" / "1:06.56 (100m)" → time-first labeled split
                            m2 = _re.match(r'^(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*\((\d{2,4})\s*m\)$', s)
                            if m:
                                dist, t = int(m.group(1)), m.group(2)
                            elif m2:
                                dist, t = int(m2.group(2)), m2.group(1)
                            elif _re.match(r'^(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})$', s):
                                dist, t = None, s
                            else:
                                continue
                            # Strip leading zero-minutes: "00:25.77" → "25.77"
                            t = _re.sub(r'^0?0:', '', t)
                            splits.append({'distance': dist, 'time': t})
                        # Infer distances when the source gave bare times
                        if splits and any(sp['distance'] is None for sp in splits):
                            ev_dist = event_data.get('event_distance') or getattr(db_event, 'distance', 0) or 0
                            if ev_dist and ev_dist % len(splits) == 0:
                                seg = ev_dist // len(splits)
                                for i, sp in enumerate(splits):
                                    if sp['distance'] is None:
                                        sp['distance'] = seg * (i + 1)
                        splits = splits or None
                if is_relay or result_data.get('is_relay', False):
                    relay_swimmers = _parse_relay_legs(
                        result_data.get('split_times', []) or []) or None

                # Always calculate FINA points from World Aquatics base times
                from .points import calculate_points
                gender_code = result_data.get('gender', 'M') or 'M'
                fina_pts = calculate_points(
                    time_cs,
                    event_data.get('event_name', db_event.name),
                    gender_code,
                    championship.pool,
                ) if time_cs > 0 else 0

                new_result = Result.objects.create(
                    swimmer=swimmer,
                    championship=championship,
                    event=db_event,
                    round_type=round_type,
                    category=category,
                    team=team,
                    time_centiseconds=time_cs,
                    original_rank=source_rank(result_data.get('rank')),
                    fina_points=fina_pts or None,
                    age_at_competition=age_at_comp or None,
                    relay_swimmers=relay_swimmers,
                    splits=splits,
                    is_hc=(result_data.get('status') in ('HC', 'TLD')),
                    hc_type=result_data.get('status') if result_data.get('status') in ('HC', 'TLD') else '',
                )
                claimed_results.add(new_result.id)
                created_results += 1

    # Auto-create teams from club names found in this import
    _progress('Creating teams…')
    from teams.utils import auto_create_teams, apply_subclassification_country
    teams_created = auto_create_teams()

    # National/Other meets: sub-classification names the meet's country,
    # so every club in this meet belongs to that country.
    apply_subclassification_country(championship)

    # TC source files publish some events without age categories: infer them
    # from the meet's own categorized results before awarding medals, so
    # every category keeps its own podium.
    from championships.categories import infer_blank_categories
    categories_inferred = infer_blank_categories(championship)

    # Re-award medals with Olympic tie rules
    _progress('Awarding medals…')
    from medals.utils import recompute_medals
    recompute_medals(championship)

    # Save the day-by-day program extracted from session dates (Day 1 =
    # championship.date). Existing manual entries are kept; new lines slot
    # in after them.
    program_items_created = 0
    if program_entries and championship.date:
        from championships.models import ProgramItem
        next_order = {}  # day -> next order value
        for pi in ProgramItem.objects.filter(championship=championship):
            next_order[pi.day] = max(next_order.get(pi.day, 0), pi.order + 1)
        for date_iso, db_event, prog_gender, session, prog_ag in sorted(
                program_entries, key=lambda e: e[0]):
            d = _parse_date(date_iso)
            if not d:
                continue
            day = (d - championship.date).days + 1
            if day < 1 or day > 30:
                continue
            _, created = ProgramItem.objects.get_or_create(
                championship=championship, day=day, event=db_event,
                gender=prog_gender, session=session, age_category=prog_ag,
                defaults={'order': next_order.get(day, 0)},
            )
            if created:
                next_order[day] = next_order.get(day, 0) + 1
                program_items_created += 1

    # Restamp per-result nationality for swimmers with nationality changes —
    # results just imported get the swimmer's current nationality, but swims
    # at meets before a nationality change should carry the old country.
    from swimmers.models import restamp_result_nationalities
    changed_swimmers = set()
    for r in championship.results.select_related('swimmer'):
        if r.swimmer_id not in changed_swimmers and r.swimmer.nationality_changes.exists():
            restamp_result_nationalities(r.swimmer)
            changed_swimmers.add(r.swimmer_id)

    return {
        'championship_id': championship.id,
        'championship_name': championship.name,
        'created_swimmers': created_swimmers,
        'matched_swimmers': matched_swimmers,
        'nationality_changes': nationality_changes,
        'skipped_swimmers': skipped_swimmers,
        'created_results': created_results,
        'skipped_results': skipped_results,
        'skipped_details': skipped_details,
        'teams_created': teams_created,
        'categories_inferred': categories_inferred,
        'program_items_created': program_items_created,
    }


def _maybe_record_nationality_change(swimmer, result_data, championship):
    """When a matched swimmer shows up under a new country, keep the same
    profile but switch their current nationality and record the transfer.

    Only fires when the result carries an explicit nationality code (never
    the meet-country fallback), and only when this meet is at least as
    recent as everything already known about the swimmer — importing an
    old historical meet must not revert a nationality.
    """
    if swimmer is None or swimmer.is_relay_team or not championship.date:
        return False
    if result_data.get('nationality_inferred'):
        return False
    nat_code = (result_data.get('nationality_code') or '').strip()
    if not nat_code:
        return False
    new_country = resolve_country(nat_code)
    if not new_country or new_country.id == swimmer.nationality_id:
        return False

    from django.db.models import Max
    latest_result_date = Result.objects.filter(swimmer=swimmer).aggregate(
        d=Max('championship__date'))['d']
    if latest_result_date and championship.date < latest_result_date:
        return False
    last_change = swimmer.nationality_changes.order_by('-effective_date').first()
    if last_change and championship.date < last_change.effective_date:
        return False

    from swimmers.models import NationalityChange
    NationalityChange.objects.create(
        swimmer=swimmer,
        from_country=swimmer.nationality,
        to_country=new_country,
        effective_date=championship.date,
        notes=f'Auto-detected during import of {championship.name}',
    )
    swimmer.nationality = new_country
    swimmer.save(update_fields=['nationality'])
    return True


def _parse_relay_legs(raw_splits):
    """Turn parsed relay leg strings ("Ali TAMER SAYED 0:50.38" or just a
    name) into structured {name, split_time} dicts."""
    legs = []
    for split_str in raw_splits:
        m = re.search(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})$', split_str.strip())
        if m:
            legs.append({'name': split_str[:m.start()].strip(),
                         'split_time': m.group(1)})
        else:
            legs.append({'name': split_str.strip(), 'split_time': ''})
    return legs


def _create_swimmer(result_data, fallback_country=None):
    """Create a new swimmer from parsed result data."""
    birth_year = result_data.get('birth_year', 0) or None

    gender = result_data.get('gender', 'M')
    if gender not in ('M', 'F'):
        gender = 'M'

    # Resolve nationality: explicit code > fallback from meet
    nationality = None
    nat_code = result_data.get('nationality_code', '')
    if nat_code:
        nationality = resolve_country(nat_code)
    if not nationality:
        nationality = fallback_country

    from teams.utils import is_valid_team_name
    club = result_data.get('club', '').strip()
    if club and (club.upper() == 'LP' or not is_valid_team_name(club)):
        club = ''

    name = normalize_swimmer_name(result_data['swimmer_name'])
    # Egyptian names: first name as-is, all subsequent words UPPERCASE
    if nationality and getattr(nationality, 'code', '') == 'EGY':
        name = egyptian_name_format(name)

    swimmer = Swimmer.objects.create(
        name=name,
        date_of_birth=None,
        birth_year=birth_year,
        nationality=nationality,
        sex=gender,
        club=normalize_club_name(club),
    )

    return swimmer


def _most_common_country(preview_data):
    """Find the most common nationality code in the parsed data."""
    from collections import Counter
    codes = Counter()
    for s in preview_data.get('swimmers', []):
        code = s.get('nationality_code', '')
        if code:
            codes[code] += 1
    if codes:
        most_common_code = codes.most_common(1)[0][0]
        return resolve_country(most_common_code)
    return None


_RELAY_GENDER_RE = re.compile(
    r'\b(men|women|boys|girls|messieurs|dames|garcons|garçons|filles|hommes|femmes)\b',
    re.IGNORECASE)
_RELAY_MIXED_RE = re.compile(r'\b(mixed|mixtes?)\b', re.IGNORECASE)


def canonical_relay_name(event_name, distance=0, stroke='', gender=''):
    """One canonical name per relay event, never gendered.

    The UI derives Men/Women from the team's sex, so relay Event names
    must not carry gender words — otherwise the same relay is stored as
    two events ('4x100 M Freestyle Relay' vs '... Relay Men'). 'Mixed'
    stays in the name because a team's sex field can't express it.
    """
    mixed = gender == 'X' or bool(_RELAY_MIXED_RE.search(event_name))
    if distance and stroke:
        from .parsers.base import normalize_event_name
        base = normalize_event_name(distance, stroke, is_relay=True)
    else:
        base = _RELAY_MIXED_RE.sub(' ', _RELAY_GENDER_RE.sub(' ', event_name))
        base = re.sub(r'\s+', ' ', base.replace('×', 'x')).strip()
    return f'{base} Mixed' if mixed else base


STROKE_ORDER = {
    'Freestyle': 10000,
    'Backstroke': 20000,
    'Breaststroke': 30000,
    'Butterfly': 40000,
    'Individual Medley': 50000,
    'Freestyle Relay': 60000,
    'Medley Relay': 70000,
}


def _compute_sort_order(stroke, distance, is_relay=False):
    """Compute a sort order that produces standard swimming program order."""
    base = STROKE_ORDER.get(stroke, 80000)
    if is_relay:
        base = max(base, 60000)
    # Within each stroke, sort by distance
    return base + distance


_VALID_STROKES = {
    'Freestyle', 'Backstroke', 'Butterfly', 'Breaststroke',
    'Individual Medley', 'Medley Relay', 'Freestyle Relay',
}
_VALID_INDIVIDUAL_DISTANCES = {25, 50, 100, 200, 400, 800, 1500}
_VALID_RELAY_DISTANCES = {50, 100, 200, 400, 800}


def repair_stroke(stroke, is_relay=False):
    """Repair corrupted stroke text from PDF extraction / French sources.

    Handles ligature artifacts ('Butter(cid:976)ly'), broken spacing
    ('Li bre') and French stroke names. Returns a valid stroke or ''.
    """
    s = re.sub(r'\(cid:\d+\)', '', stroke or '')
    s = re.sub(r'[^A-Za-z ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if s in _VALID_STROKES:
        return s
    key = s.replace(' ', '').lower()
    if 'relay' in key or is_relay:
        if 'medley' in key or 'nage' in key:
            return 'Medley Relay' if 'relay' in key else 'Individual Medley'
        if 'free' in key or 'libre' in key or 'nl' == key:
            return 'Freestyle Relay' if 'relay' in key else 'Freestyle'
    if 'butter' in key or 'papillon' in key or key == 'fly':
        return 'Butterfly'
    if 'back' in key or 'dos' in key:
        return 'Backstroke'
    if 'breast' in key or 'brasse' in key:
        return 'Breaststroke'
    if 'medley' in key or 'nages' in key or key == 'im':
        return 'Individual Medley'
    if 'free' in key or 'libre' in key or key == 'nl':
        return 'Freestyle'
    return ''


def repair_distance(distance, is_relay=False):
    """Sanity-check a parsed event distance; repair known glitches.

    '4 x 100' sometimes gets read as the number 4100 (→ leg 100).
    Returns a valid distance or 0.
    """
    try:
        d = int(distance)
    except (TypeError, ValueError):
        return 0
    if not is_relay:
        return d if d in _VALID_INDIVIDUAL_DISTANCES else 0
    if d in _VALID_RELAY_DISTANCES:
        return d
    # "4100" / "450" / "4200" = '4' + leg distance glued together
    s = str(d)
    if s.startswith('4') and s[1:].isdigit() and int(s[1:]) in {50, 100, 200}:
        return 4 * int(s[1:])
    return 0


def _find_event(event_data, event_cache):
    """Find a matching Event in the database."""
    event_name = event_data.get('event_name', '')
    is_relay = event_data.get('is_relay', False) or 'relay' in event_name.lower() or '4x' in event_name.lower() or '4×' in event_name.lower()

    # Repair corrupted stroke/distance so we never create junk events
    # like '100 M Butter(cid:976)ly' or '4x1025 M Freestyle Relay'.
    distance = repair_distance(event_data.get('distance', 0), is_relay)
    stroke = repair_stroke(event_data.get('stroke', ''), is_relay)

    if is_relay:
        event_name = canonical_relay_name(
            event_name, distance, stroke, event_data.get('gender', ''))

    # For individual events, try canonical name first
    if distance and stroke and not is_relay:
        standard_name = f'{distance} M {stroke}'
        if standard_name.upper() in event_cache:
            return event_cache[standard_name.upper()]

    # Try exact match on parsed name
    if event_name.upper() in event_cache:
        return event_cache[event_name.upper()]

    # Try partial match (but don't match relay to individual or vice versa)
    # Skip partial matching for relay events — they need exact name match
    # because Mixed relays are a different event from single-sex ones
    if not is_relay and distance and stroke:
        for db_name, db_event in event_cache.items():
            if str(distance) in db_name and stroke.upper() in db_name:
                if not db_event.is_relay:
                    return db_event

    # Create new event if not found
    if distance and stroke:
        if is_relay:
            final_name = event_name  # canonical name built above
        else:
            # Always use canonical format for individual events
            final_name = f'{distance} M {stroke}'
        event = Event.objects.create(
            name=final_name,
            distance=distance,
            stroke=stroke,
            is_relay=is_relay,
            sort_order=_compute_sort_order(stroke, distance, is_relay),
        )
        event_cache[event.name.upper()] = event
        return event

    return None


def _parse_date(date_text):
    """Try to parse a date from various formats."""
    if not date_text:
        return date.today()

    # Skip non-date text
    if 'qualifying' in date_text.lower() or 'record' in date_text.lower():
        return date.today()

    # Try DD/MM/YYYY or D/M/YYYY
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', date_text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass

    # Try DD-MM-YYYY
    m = re.search(r'(\d{1,2})-(\d{1,2})-(\d{4})', date_text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass

    # Try YYYY-MM-DD
    m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', date_text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    # Try to extract just a year
    m = re.search(r'(\d{4})', date_text)
    if m:
        return date(int(m.group(1)), 1, 1)

    return date.today()
