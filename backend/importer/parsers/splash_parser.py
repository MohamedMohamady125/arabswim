"""
Parser for Splash Meet Manager PDF format.
Used by: Algeria national/international championships.
Identified by: "Splash Meet Manager" in footer text.

Format:
  Event header: "Epreuve 11 Messieurs, 50m Libre Cat. générale"
  Columns: Rang AN Temps Pts [50m 100m 150m 200m]
  Result line: "1. BENBARA, MEHDI NAZIM 98 MC ALGER 22.67 703"
  International adds country codes: "1. ALZAMIL, ALI 02 KUW 25.71 793 Q"
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, detect_gender,
    extract_distance, normalize_name, is_relay_event, normalize_event_name,
)


# Matches event header lines
EVENT_HEADER = re.compile(
    r'Epreuve\s+\d+\s+'
    r'(Messieurs|Dames|Garçons|Filles|Garcons|Mixte)',
    re.IGNORECASE
)

# Matches the event description: "50m Libre", "200m 4 nages", "4 x 100m Libre"
EVENT_DESC = re.compile(
    r'(?:\d+\s*x\s*)?(\d+)m\s+(.+?)(?:\s+Cat\.\s*|$)',
    re.IGNORECASE
)

# Age group headers
AGE_GROUP_PATTERN = re.compile(
    r'^(\d{1,2}\s*-\s*\d{1,2}\s*ans|'
    r'\d{1,2}\s*ans\s*et\s*plus|'
    r'Cat\.\s*g[ée]n[ée]rale)$',
    re.IGNORECASE
)

# Result line: rank. NAME, FIRST 99 CLUB/COUNTRY time points [qualifier]
# National format: "1. BENBARA, MEHDI NAZIM 98 MC ALGER 22.67 703"
# International: "1. ALZAMIL, ALI 02 KUW 25.71 793 Q"
RESULT_LINE = re.compile(
    r'^\s*(\d+)\.\s+'         # rank
    r'(.+?)\s+'               # name (greedy until we hit birth year)
    r'(\d{2})\s+'             # birth year (2 digits)
    r'(.+?)\s+'               # club or country
    r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*'  # time
    r'(\d+)?'                 # fina points (optional)
)

# Disqualification/forfeit lines
DQ_LINE = re.compile(
    r'^\s*(disq|forf|dsq)\.\s+(.+)',
    re.IGNORECASE
)

# Relay team result line: "1. ALG ALG 3:39.22 839" or "1. EGY EGY 4:15.31 734"
RELAY_TEAM_LINE = re.compile(
    r'^\s*(\d+)\.\s+'                    # rank
    r'([A-Z]{3})\s+'                     # country code
    r'(\S+)\s+'                          # team name
    r'(\d{1,2}:\d{2}\.\d{2})\s*'        # time
    r'(\d+)?'                            # points (optional)
)

# Relay DQ/forfeit line: "disq. KUW KUW" or "forf.déc. JOR JOR"
RELAY_DQ_LINE = re.compile(
    r'^\s*(disq|forf[.\w]*)\.\s+([A-Z]{3})\s+',
    re.IGNORECASE
)

# International country codes (3 letter uppercase)
COUNTRY_CODE = re.compile(r'^[A-Z]{3}$')

# Round type detection
ROUND_PATTERNS = {
    'Finals': re.compile(r'Finale', re.IGNORECASE),
    'Heats': re.compile(r'Eliminatoire', re.IGNORECASE),
}


def normalize_name_splash(name):
    """Normalize name for Splash format where comma means LAST, First."""
    return normalize_name(name, comma_order='last_first')


def detect_format(text):
    """Check if this text is from Splash Meet Manager."""
    return 'splash meet manager' in text.lower()


def parse(text):
    """Parse Splash Meet Manager format text into ParsedMeet."""
    from .base import extract_date_and_location

    lines = text.split('\n')
    meet = ParsedMeet(source_format='splash')

    # Extract meet info from first non-empty, non-event lines
    header_lines = []
    for line in lines[:10]:
        line = line.strip()
        if not line or line.startswith('Epreuve') or 'splash meet' in line.lower():
            continue
        if 'FINA' in line or line.startswith('Rang') or line.startswith('Points'):
            continue
        header_lines.append(line)
        if len(header_lines) >= 2:
            break

    if header_lines:
        meet.meet_name = header_lines[0]
    if len(header_lines) >= 2:
        # Second line usually has location + dates: "EL BEZ SETIF, 19 - 22/1/2022"
        start_date, end_date, location = extract_date_and_location(header_lines[1])
        meet.date_text = start_date
        if end_date:
            meet.date_end = end_date
        meet.location = location

    current_event = None
    current_gender = ''
    current_age_group = ''
    current_round = ''
    is_international = _detect_international(text)

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check for event header
        header_match = EVENT_HEADER.search(line)
        if header_match:
            gender_word = header_match.group(1).lower()
            if gender_word == 'mixte':
                current_gender = 'X'
            else:
                current_gender = detect_gender(line)

            # Extract event description
            desc_match = EVENT_DESC.search(line)
            if desc_match:
                distance = int(desc_match.group(1))
                stroke_raw = desc_match.group(2).strip()
                stroke = normalize_stroke(stroke_raw)
                relay = is_relay_event(line)

                event_name = normalize_event_name(distance, stroke, relay)

                # For relay events, include gender in the event name
                # to differentiate Men's, Women's, and Mixed relays
                if relay and current_gender:
                    gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(current_gender, '')
                    if gender_label:
                        event_name = f'{event_name} {gender_label}'

                # Detect round type
                current_round = ''
                for rtype, pattern in ROUND_PATTERNS.items():
                    if pattern.search(line):
                        current_round = rtype
                        break

                current_event = ParsedEvent(
                    event_name=event_name,
                    distance=distance,
                    stroke=stroke,
                    gender=current_gender,
                    round_type=current_round,
                    age_group=current_age_group,
                )
                meet.events.append(current_event)
            continue

        # Check for round type on standalone line
        for rtype, pattern in ROUND_PATTERNS.items():
            if pattern.search(line) and 'résultats' in line.lower():
                current_round = rtype
                if current_event:
                    current_event.round_type = current_round
                break

        # Check for age group
        ag_match = AGE_GROUP_PATTERN.match(line)
        if ag_match:
            current_age_group = ag_match.group(1).strip()
            if current_event:
                current_event.age_group = current_age_group
            continue

        # Check for result line
        if current_event:
            event_is_relay = _is_relay(current_event.event_name)

            if event_is_relay:
                # Try relay team result line
                relay_match = RELAY_TEAM_LINE.match(line)
                if relay_match:
                    rank = int(relay_match.group(1))
                    nat_code = relay_match.group(2)
                    team_name = relay_match.group(3)
                    time_text = relay_match.group(4)
                    fina = int(relay_match.group(5)) if relay_match.group(5) else 0
                    time_cs = parse_time_to_centiseconds(time_text)

                    current_relay_result = ParsedResult(
                        swimmer_name=f'{nat_code} {team_name}',
                        time_text=time_text,
                        time_centiseconds=time_cs,
                        event_name=current_event.event_name,
                        event_distance=current_event.distance,
                        event_stroke=current_event.stroke,
                        gender=current_event.gender,
                        rank=rank,
                        nationality_code=nat_code,
                        club=f'{nat_code} {team_name}',
                        fina_points=fina,
                        round_type=current_event.round_type,
                        age_group=current_event.age_group,
                    )
                    current_event.results.append(current_relay_result)
                    continue

                # Relay swimmer detail lines (names with splits)
                # Format: "NAME +reaction split split NAME +reaction split split"
                if current_event.results and not RELAY_DQ_LINE.match(line):
                    # Extract swimmer names from relay detail line
                    swimmer_splits = _parse_relay_swimmers(line)
                    if swimmer_splits:
                        last_result = current_event.results[-1]
                        last_result.split_times.extend(swimmer_splits)
                        continue

                # Relay DQ
                if RELAY_DQ_LINE.match(line):
                    continue
            else:
                result = _parse_result_line(line, current_event, is_international)
                if result:
                    current_event.results.append(result)
                    continue

            # Check for DQ (individual)
            dq_match = DQ_LINE.match(line)
            if dq_match:
                name = normalize_name_splash(dq_match.group(2).split('  ')[0])
                if name:
                    result = ParsedResult(
                        swimmer_name=name,
                        time_text='',
                        status='DQ',
                        gender=current_event.gender,
                        event_name=current_event.event_name,
                        event_distance=current_event.distance,
                        event_stroke=current_event.stroke,
                    )
                    current_event.results.append(result)

    return meet


def _is_relay(event_name):
    """Check if event name indicates a relay."""
    t = event_name.lower()
    return 'relay' in t or '4x' in t or '4×' in t or '4 x' in t


def _parse_relay_swimmers(line):
    """Extract swimmer names and split times from a relay detail line.

    Format: "ARDJOUNE, ABDELLAH +0,57 26.66 55.39 SYOUD, JAOUAD +0,29 24.32 52.16"
    Returns list of "Name split_time" strings.
    """
    # Skip page headers/footers that might appear mid-results
    skip_words = ['splash', 'meet manager', 'registered', 'page', 'arab championship',
                  'complex', 'epreuve', 'points:', 'rang', 'liste']
    if any(kw in line.lower() for kw in skip_words):
        return []
    # Split by the reaction time pattern (+digit,digit) which separates swimmers
    parts = re.split(r'(?<=\d{2}\.\d{2})\s+(?=[A-Z])', line)
    results = []

    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Try to extract name and the last split time
        # Pattern: NAME +reaction split... final_split
        m = re.match(r'^(.+?)\s+\+[\d,]+\s+(.+)$', part)
        if m:
            name_raw = m.group(1)
            splits_text = m.group(2)
            name = normalize_name_splash(name_raw)
            # Get the last time value as the split
            times = re.findall(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})', splits_text)
            split_time = times[-1] if times else ''
            if name:
                results.append(f'{name} {split_time}')
        else:
            # Try without reaction time
            name_match = re.match(r'^([A-Z][A-Za-z\s,\'-]+?)\s+(\d)', part)
            if name_match:
                name = normalize_name_splash(name_match.group(1))
                times = re.findall(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})', part)
                split_time = times[-1] if times else ''
                if name:
                    results.append(f'{name} {split_time}')

    return results


def _detect_international(text):
    """Detect if this is an international meet (has country codes instead of clubs)."""
    # Count 3-letter uppercase codes that look like countries
    codes = re.findall(r'\b([A-Z]{3})\b', text)
    known_countries = {'ALG', 'EGY', 'TUN', 'MAR', 'JOR', 'KUW', 'KSA', 'QAT',
                       'OMA', 'BHR', 'IRQ', 'SYR', 'LBN', 'UAE', 'SUD', 'YEM',
                       'LBY', 'PLE', 'FRA', 'USA', 'GBR', 'GER', 'ITA', 'ESP'}
    country_count = sum(1 for c in codes if c in known_countries)
    return country_count > 5


def _parse_result_line(line, event, is_international):
    """Try to parse a single result line."""
    match = RESULT_LINE.match(line)
    if not match:
        return None

    rank = int(match.group(1))
    remaining = line[match.start(2):]

    # Parse based on format
    # Split by multiple spaces to find fields
    parts = re.split(r'\s{2,}', remaining.strip())
    if not parts:
        return None

    # Try to extract using the time as an anchor
    time_pattern = re.compile(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})')
    time_match = time_pattern.search(remaining)
    if not time_match:
        return None

    time_text = time_match.group(1)
    before_time = remaining[:time_match.start()].strip()
    after_time = remaining[time_match.end():].strip()

    # Extract FINA points from after time
    fina_points = 0
    pts_match = re.match(r'(\d{2,4})', after_time)
    if pts_match:
        fina_points = int(pts_match.group(1))

    # Parse before-time section: NAME BIRTHYEAR CLUB/COUNTRY
    # Find birth year (2-digit number near the end)
    by_match = re.search(r'\b(\d{2})\s+(\S+.*?)$', before_time)
    if by_match:
        name_part = before_time[:by_match.start()].strip()
        birth_year_2d = int(by_match.group(1))
        club_or_country = by_match.group(2).strip()
    else:
        # Fallback: just take everything as name
        name_part = before_time
        birth_year_2d = None
        club_or_country = ''

    # Convert 2-digit year to 4-digit
    # birth_year_2d can be 0 (meaning born in 2000), so check for None not falsiness
    birth_year = 0
    if birth_year_2d is not None:
        birth_year = 2000 + birth_year_2d if birth_year_2d < 30 else 1900 + birth_year_2d

    # Determine if club_or_country is a country code
    nationality = ''
    club = club_or_country
    if is_international:
        # First token might be country code
        tokens = club_or_country.split()
        if tokens and COUNTRY_CODE.match(tokens[0]):
            nationality = tokens[0]
            club = ' '.join(tokens[1:]) if len(tokens) > 1 else ''

    name = normalize_name_splash(name_part)
    time_cs = parse_time_to_centiseconds(time_text)

    # Extract split times if present
    splits = []
    split_matches = re.findall(r'(\d{1,2}\.\d{2})', after_time)
    if len(split_matches) > 1:
        splits = split_matches[1:]  # first is usually fina points pattern

    return ParsedResult(
        swimmer_name=name,
        time_text=time_text,
        time_centiseconds=time_cs,
        event_name=event.event_name,
        event_distance=event.distance,
        event_stroke=event.stroke,
        gender=event.gender,
        rank=rank,
        birth_year=birth_year,
        nationality_code=nationality,
        club=club,
        fina_points=fina_points,
        round_type=event.round_type,
        age_group=event.age_group,
        split_times=splits,
    )
