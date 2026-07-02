"""
Parser for FRMN (Fédération Royale Marocaine de Natation) PDF format.
Used by: Morocco championships.
Identified by: "F.R.M.N" in footer.

Format:
  Event header: "1. 200 m 4 NAGES DAMES"
  Relay header: "5. 4 x 100 m NAGE LIBRE DAMES"
  Columns: Rg Nom Nat Lic Club Tps Pts
  Result line: "1.Malak MEQDAR MAR 2007 RAJA NAT 2:25.94 664455"
  TLD prefix = time limit exceeded but valid
  NC = not classified / DSQ
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, detect_gender,
    is_relay_event, normalize_event_name, extract_distance,
    normalize_category, to_iso_date,
)


def _frmn_normalize_name(name):
    """Normalize FRMN name format: 'Firstname LASTNAME' → 'Firstname LASTNAME'
    Last name stays UPPER, first name becomes Title Case."""
    import re
    name = name.strip()
    name = name.replace('\xa0', ' ')
    name = re.sub(r'\s+', ' ', name).strip()
    if not name:
        return name

    # FRMN names: "Malak MEQDAR" or "Romayssae Imane MOUISSA"
    # Last name is the UPPERCASE word(s) at the end
    words = name.split()
    last_parts = []
    first_parts = []

    # Walk from the end, collect uppercase words as last name
    for word in reversed(words):
        if word.isupper() and len(word) > 1:
            last_parts.insert(0, word)
        else:
            first_parts = words[:words.index(word) + 1]
            break

    if last_parts and first_parts:
        last = ' '.join(last_parts).upper()
        first = ' '.join(first_parts).title()
        return f'{first} {last}'
    else:
        return name.upper()


# Event header: "1. 200 m 4 NAGES DAMES" or "2. 200 m 4 NAGES MESSIEURS"
EVENT_HEADER = re.compile(
    r'^\d+\.\s+(\d+)\s*m\s+(.+?)\s+(DAMES|MESSIEURS|FILLES|GARCONS)\s*$',
    re.IGNORECASE
)

# Relay header: "5. 4 x 100 m NAGE LIBRE DAMES" or "5. 4 x 50 m 4 NAGES MESSIEURS"
RELAY_HEADER = re.compile(
    r'^\d+\.\s+(\d+)\s*x\s*(\d+)\s*m\s+(.+?)\s+(DAMES|MESSIEURS|FILLES|GARCONS|MIXTE)\s*$',
    re.IGNORECASE
)

# Result line variations:
# "1.Malak MEQDAR MAR 2007 RAJA NAT 2:25.94 664455"
# "TLD.Safa EL ABOUDI MAR 2011 USCM 2:41.18 447799"
# "NC.Bayane BOULAFRAH MAR 2011 USCM Dsq VI 0"
# Club can be any number of words (e.g. Spanish "CLUB NATACIO SANT ANDREU"),
# so anchor on NAT+year before it and the time after it instead of counting words.
RESULT_LINE = re.compile(
    r'^(?:(\d+)|TLD|Frf)\.\s*'  # rank or TLD/Frf
    r'(.+?)\s+'                  # name
    r'([A-Z]{3})\s+'             # nationality
    r'(\d{4})\s+'                # birth year (4 digits)
    r'(.+?)\s+'                  # club (any number of words)
    r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})'  # time
    r'(?:\s+(\d+))?'             # points (optional)
    r'(?:\s+\d+)?\s*$'           # trailing reaction/obs field (optional)
)

# Relay result line: "1. CLUB NAME 3:39.22 839"
RELAY_RESULT_LINE = re.compile(
    r'^(\d+)\.\s*'                  # rank
    r'(.+?)\s+'                     # team name
    r'(\d{1,2}:\d{2}\.\d{2})\s*'   # time
    r'(\d+)?'                       # points (optional)
)

# NC/DSQ line
NC_LINE = re.compile(
    r'^NC\.\s*(.+?)\s+([A-Z]{3})\s+(\d{4})\s+(.+?)\s+(Dsq|Frf)',
    re.IGNORECASE
)

# Category marker — the age classements a FRMN event is split into.
CATEGORY = re.compile(
    r'^(OPEN|POUSSINS?|MINIMES?|CADETS?|JUNIORS?|SENIORS?|BENJAMINS?)\s*$',
    re.IGNORECASE
)

# Also detect "SENIORS/JUNIORS" combined
CATEGORY_COMBINED = re.compile(
    r'^(SENIORS?\s*/\s*JUNIORS?)\s*$',
    re.IGNORECASE
)


def _sibling_event(event, category):
    """Create a new ParsedEvent that shares an event's identity but a new category."""
    return ParsedEvent(
        event_name=event.event_name,
        distance=event.distance,
        stroke=event.stroke,
        gender=event.gender,
        age_group=category,
    )


def detect_format(text):
    """Check if this text is from FRMN format."""
    return 'f.r.m.n' in text.lower() or 'frmn' in text.lower()


def parse(text):
    """Parse FRMN format text into ParsedMeet."""
    from .base import extract_date_and_location

    lines = text.split('\n')
    meet = ParsedMeet(source_format='frmn')

    # FRMN format first lines:
    # "10/05/2026 16:08:58"
    # "COUPE DU TRONE DE NATATION - 10/05/2026 - MARRAKECH - Petit bassin"
    for line in lines[:5]:
        line = line.strip()
        if not line:
            continue
        # Skip timestamp-only lines
        if re.match(r'^\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}', line):
            continue
        # This is the main title line: either it carries a known keyword or it
        # embeds a date (e.g. "TANGIER INTERNATIONAL SWIMMING MEETING - 28/06/2026 - TANGER - Grand bassin")
        keywords = ('coupe', 'championnat', 'natation', 'meeting', 'swimming')
        if any(kw in line.lower() for kw in keywords) or re.search(r'\d{1,2}/\d{1,2}/\d{4}', line):
            parts = [p.strip() for p in re.split(r'\s*-\s*', line) if p.strip()]

            name_parts = []
            location_parts = []
            for part in parts:
                part_lower = part.lower()
                if 'petit bassin' in part_lower or 'grand bassin' in part_lower:
                    continue
                if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', part.strip()):
                    continue
                if part.isupper() and len(part) < 30 and not any(c.isdigit() for c in part) and not any(kw in part_lower for kw in ['coupe', 'championnat', 'natation', 'trone']):
                    location_parts.append(part)
                else:
                    name_parts.append(part)

            meet.meet_name = ' - '.join(name_parts) if name_parts else line
            meet.location = ', '.join(location_parts) if location_parts else ''

            start_date, end_date, _ = extract_date_and_location(line)
            meet.date_text = start_date
            if end_date:
                meet.date_end = end_date
            break

    current_event = None

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('F.R.M.N') or stripped.startswith('Page'):
            continue

        # Skip column headers
        if stripped.startswith('Rg') and 'Nom' in stripped:
            continue

        # Check for timestamp lines
        if re.match(r'^\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}', stripped):
            if not meet.date_text:
                meet.date_text = to_iso_date(stripped.split()[0])
            continue

        # Check for relay event header FIRST (before individual)
        relay_match = RELAY_HEADER.match(stripped)
        if relay_match:
            teams = int(relay_match.group(1))
            leg_dist = int(relay_match.group(2))
            distance = teams * leg_dist
            stroke_raw = relay_match.group(3).strip()
            gender_raw = relay_match.group(4)

            stroke = normalize_stroke(stroke_raw)
            gender_word = gender_raw.upper()
            if gender_word == 'MIXTE':
                gender = 'X'
            elif gender_word in ('DAMES', 'FILLES'):
                gender = 'F'
            else:
                gender = 'M'

            event_name = normalize_event_name(distance, stroke, is_relay=True)
            # Add gender label to differentiate relay events
            gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(gender, '')
            if gender_label:
                event_name = f'{event_name} {gender_label}'

            # A page break repeats the event header; don't start a fresh event.
            if current_event and current_event.event_name == event_name and current_event.gender == gender:
                continue

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                age_group='',
            )
            meet.events.append(current_event)
            continue

        # Check for individual event header
        header_match = EVENT_HEADER.match(stripped)
        if header_match:
            distance = int(header_match.group(1))
            stroke_raw = header_match.group(2).strip()
            gender_raw = header_match.group(3)

            stroke = normalize_stroke(stroke_raw)
            gender = 'F' if gender_raw.upper() in ('DAMES', 'FILLES') else 'M'
            relay = is_relay_event(stripped)
            event_name = normalize_event_name(distance, stroke, relay)

            # A page break repeats the event header; don't start a fresh event.
            if current_event and current_event.event_name == event_name and current_event.gender == gender:
                continue

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                age_group='',
            )
            meet.events.append(current_event)
            continue

        # Check for an age-category sub-header (SENIORS/JUNIORS, CADETS, MINIMES,
        # BENJAMINS, POUSSINS). Each FRMN event is split into these classements,
        # every one with its own ranking. The first category reuses the event
        # created by the title (still empty); each subsequent category opens a
        # fresh sibling event so every classement keeps its own results.
        cat_match = CATEGORY.match(stripped) or CATEGORY_COMBINED.match(stripped)
        if cat_match:
            category = normalize_category(cat_match.group(1))
            if current_event:
                # A page break repeats the current category header; it's a
                # continuation of the same classement, not a new one.
                if current_event.age_group == category:
                    continue
                if current_event.results:
                    current_event = _sibling_event(current_event, category)
                    meet.events.append(current_event)
                else:
                    current_event.age_group = category
            continue

        if not current_event:
            continue

        # Check if current event is a relay
        event_is_relay = 'relay' in current_event.event_name.lower() or '4x' in current_event.event_name.lower()

        if event_is_relay:
            # FRMN relay format: same as individual lines but grouped under relay event
            # "1.Mohamed Zouhir MOUFADDAL MAR 2008 FUS 4:01.10 0 0" = team result (club=team)
            # "Louay ELJABRI MAR 2010 FUS 0" = relay swimmer detail (no rank)
            result = _parse_result_line(stripped, current_event)
            if result and result.rank > 0:
                # The rank line carries the leadoff swimmer's name; the following
                # three detail lines carry swimmers 2-4. Capture the leadoff into
                # split_times before we overwrite swimmer_name with the club/team,
                # otherwise the first relay swimmer is lost (only 3 would show).
                leadoff = result.swimmer_name
                team_name = result.club or result.swimmer_name
                if leadoff and leadoff != team_name:
                    result.split_times.append(leadoff)
                result.swimmer_name = team_name
                current_event.results.append(result)
                continue
            # Try to capture relay swimmer detail lines (no rank, for split info)
            if current_event.results:
                swimmer_detail = _parse_relay_swimmer_detail(stripped)
                if swimmer_detail:
                    last = current_event.results[-1]
                    last.split_times.append(swimmer_detail)
                continue
        else:
            # Try to parse individual result line
            result = _parse_result_line(stripped, current_event)
            if result:
                current_event.results.append(result)
                continue

        # Check NC/DSQ
        nc_match = NC_LINE.match(stripped)
        if nc_match:
            name = _frmn_normalize_name(nc_match.group(1))
            result = ParsedResult(
                swimmer_name=name,
                time_text='',
                nationality_code=nc_match.group(2),
                birth_year=int(nc_match.group(3)),
                club=nc_match.group(4),
                status='DQ',
                gender=current_event.gender,
                event_name=current_event.event_name,
                event_distance=current_event.distance,
                event_stroke=current_event.stroke,
            )
            current_event.results.append(result)

    return meet


def _parse_relay_swimmer_detail(line):
    """Parse a relay swimmer detail line (no rank, no time).
    Format: 'Louay ELJABRI MAR 2010 FUS 0'
    Returns swimmer name string or None."""
    # Must NOT start with a rank number followed by "."
    if re.match(r'^\d+\.', line):
        return None
    # Should have a name followed by NAT YEAR CLUB pattern
    m = re.match(r'^(.+?)\s+([A-Z]{3})\s+(\d{4})\s+(\S+)', line)
    if m:
        name = _frmn_normalize_name(m.group(1))
        return name
    return None


def _parse_relay_result_line(line, event):
    """Parse a FRMN relay result line."""
    match = RELAY_RESULT_LINE.match(line)
    if not match:
        return None

    rank = int(match.group(1))
    team_name = match.group(2).strip()
    time_text = match.group(3)
    pts_raw = match.group(4) or '0'
    pts = _fix_frmn_points(pts_raw)
    time_cs = parse_time_to_centiseconds(time_text)

    if time_cs <= 0:
        return None

    return ParsedResult(
        swimmer_name=team_name,
        time_text=time_text,
        time_centiseconds=time_cs,
        event_name=event.event_name,
        event_distance=event.distance,
        event_stroke=event.stroke,
        gender=event.gender,
        rank=rank,
        club=team_name,
        fina_points=pts,
        age_group=event.age_group,
    )


def _parse_result_line(line, event):
    """Parse a FRMN individual result line."""
    # Check for TLD prefix first
    tld_match = re.match(
        r'^TLD\.\s*(.+?)\s+([A-Z]{3})\s+(\d{4})\s+(.+?)\s+'
        r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*(\d+)?',
        line
    )
    if tld_match:
        name = _frmn_normalize_name(tld_match.group(1))
        time_text = tld_match.group(5)
        time_cs = parse_time_to_centiseconds(time_text)
        pts_raw = tld_match.group(6) or '0'
        pts = _fix_frmn_points(pts_raw)

        return ParsedResult(
            swimmer_name=name,
            time_text=time_text,
            time_centiseconds=time_cs,
            event_name=event.event_name,
            event_distance=event.distance,
            event_stroke=event.stroke,
            gender=event.gender,
            rank=0,
            status='TLD',
            nationality_code=tld_match.group(2),
            birth_year=int(tld_match.group(3)),
            club=tld_match.group(4),
            fina_points=pts,
            age_group=event.age_group,
        )

    match = RESULT_LINE.match(line)
    if not match:
        return None

    rank = int(match.group(1)) if match.group(1) else 0
    name = _frmn_normalize_name(match.group(2))
    nationality = match.group(3)
    birth_year = int(match.group(4))
    club = match.group(5)
    time_text = match.group(6)
    pts_raw = match.group(7) or '0'
    pts = _fix_frmn_points(pts_raw)

    time_cs = parse_time_to_centiseconds(time_text)

    return ParsedResult(
        swimmer_name=name,
        time_text=time_text,
        time_centiseconds=time_cs,
        event_name=event.event_name,
        event_distance=event.distance,
        event_stroke=event.stroke,
        gender=event.gender,
        rank=rank,
        nationality_code=nationality,
        birth_year=birth_year,
        club=club,
        fina_points=pts,
        age_group=event.age_group,
    )


def _fix_frmn_points(pts_str):
    """Fix FRMN points which are sometimes doubled in PDF extraction.
    e.g. '664455' should be '645', '557766' should be '576'.
    The PDF sometimes merges characters."""
    pts_str = pts_str.strip()
    if not pts_str or not pts_str.isdigit():
        return 0
    val = int(pts_str)
    if val > 1200 and len(pts_str) == 6:
        # Likely doubled chars: take every other char
        fixed = int(pts_str[0] + pts_str[2] + pts_str[4])
        if 1 <= fixed <= 1100:
            return fixed
    if val > 1200:
        return 0  # Invalid FINA points
    return val
