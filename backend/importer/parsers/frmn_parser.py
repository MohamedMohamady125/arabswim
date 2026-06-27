"""
Parser for FRMN (Fédération Royale Marocaine de Natation) PDF format.
Used by: Morocco championships.
Identified by: "F.R.M.N" in footer.

Format:
  Event header: "1. 200 m 4 NAGES DAMES"
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

# Result line variations:
# "1.Malak MEQDAR MAR 2007 RAJA NAT 2:25.94 664455"
# "TLD.Safa EL ABOUDI MAR 2011 USCM 2:41.18 447799"
# "NC.Bayane BOULAFRAH MAR 2011 USCM Dsq VI 0"
RESULT_LINE = re.compile(
    r'^(?:(\d+)|TLD|Frf)\.\s*'  # rank or TLD/Frf
    r'(.+?)\s+'                  # name
    r'([A-Z]{3})\s+'             # nationality
    r'(\d{4})\s+'                # birth year (4 digits)
    r'(\S+(?:\s+\S+)?)\s+'      # club (can be 2 words like "RAJA NAT")
    r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*'  # time
    r'(\d+)?'                    # points
)

# NC/DSQ line
NC_LINE = re.compile(
    r'^NC\.\s*(.+?)\s+([A-Z]{3})\s+(\d{4})\s+(\S+(?:\s+\S+)?)\s+(Dsq|Frf)',
    re.IGNORECASE
)

# Category marker
CATEGORY = re.compile(r'^(OPEN|MINIMES?|CADETS?|JUNIORS?|SENIORS?)\s*$', re.IGNORECASE)


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
    # Find the main title line (has the meet name, date, location, pool all in one)
    for line in lines[:5]:
        line = line.strip()
        if not line:
            continue
        # Skip timestamp-only lines
        if re.match(r'^\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}', line):
            continue
        # This is the main title line
        # Format: "COUPE DU TRONE DE NATATION - 10/05/2026 - MARRAKECH - Petit bassin"
        if 'coupe' in line.lower() or 'championnat' in line.lower() or 'natation' in line.lower():
            # Split by " - " and classify each part
            parts = [p.strip() for p in re.split(r'\s*-\s*', line) if p.strip()]

            name_parts = []
            location_parts = []
            for part in parts:
                part_lower = part.lower()
                # Skip pool info
                if 'petit bassin' in part_lower or 'grand bassin' in part_lower:
                    continue
                # Skip date parts
                if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', part.strip()):
                    continue
                # City names (short, uppercase, no digits) = location
                if part.isupper() and len(part) < 30 and not any(c.isdigit() for c in part) and not any(kw in part_lower for kw in ['coupe', 'championnat', 'natation', 'trone']):
                    location_parts.append(part)
                else:
                    name_parts.append(part)

            meet.meet_name = ' - '.join(name_parts) if name_parts else line
            meet.location = ', '.join(location_parts) if location_parts else ''

            # Extract dates from the full line
            start_date, end_date, _ = extract_date_and_location(line)
            meet.date_text = start_date
            if end_date:
                meet.date_end = end_date
            break

    current_event = None
    current_age_group = 'OPEN'

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
                meet.date_text = stripped.split()[0]
            continue

        # Check for event header
        header_match = EVENT_HEADER.match(stripped)
        if header_match:
            distance = int(header_match.group(1))
            stroke_raw = header_match.group(2).strip()
            gender_raw = header_match.group(3)

            stroke = normalize_stroke(stroke_raw)
            gender = 'F' if gender_raw.upper() in ('DAMES', 'FILLES') else 'M'
            relay = is_relay_event(stripped)
            event_name = normalize_event_name(distance, stroke, relay)

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                age_group=current_age_group,
            )
            meet.events.append(current_event)
            continue

        # Check for category
        cat_match = CATEGORY.match(stripped)
        if cat_match:
            current_age_group = cat_match.group(1).upper()
            if current_event:
                current_event.age_group = current_age_group
            continue

        if not current_event:
            continue

        # Try to parse result line
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


def _parse_result_line(line, event):
    """Parse a FRMN result line."""
    match = RESULT_LINE.match(line)
    if not match:
        # Try TLD prefix
        tld_match = re.match(
            r'^TLD\.\s*(.+?)\s+([A-Z]{3})\s+(\d{4})\s+(\S+(?:\s+\S+)?)\s+'
            r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*(\d+)?',
            line
        )
        if tld_match:
            name = _frmn_normalize_name(tld_match.group(1))
            time_text = tld_match.group(5)
            time_cs = parse_time_to_centiseconds(time_text)
            # Points in FRMN are sometimes concatenated oddly, extract properly
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
                nationality_code=tld_match.group(2),
                birth_year=int(tld_match.group(3)),
                club=tld_match.group(4),
                fina_points=pts,
            )
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
    if val > 2000 and len(pts_str) == 6:
        # Likely doubled chars: take every other char
        fixed = pts_str[0] + pts_str[2] + pts_str[4]
        return int(fixed)
    return val
