"""
Parser for Microplus (www.microplustiming.com) swimming result PDFs.

Identified by: "Microplus" or "microplustiming" in the text.

Format: each page contains one event + one round.
  Header:
    Swimming Stadium - Torre d'Ayala     (venue)
    SWIMMING                             (sport)
    Men 50m Freestyle                    (event name)
    Preliminaries                        (round)
    Results
    RANK HEAT LANE SURNAME & NAME ...    (column header)
  Body:
    Event 29
    25 AUG 2026 - 10:21                  (date)
    WR / WJ / CR lines                  (records)
    [result rows]
    NOT CLASSIFIED
    [DNS/DQ rows]
  Footer:
    Issued: ...
    SWMM50MFR---... Data Processing and Timing by Microplus
"""
import re
from .base import (
    ParsedMeet, ParsedEvent, ParsedResult,
    detect_gender, normalize_stroke, extract_distance,
    normalize_event_name, is_relay_event,
    parse_time_to_centiseconds,
)

# --- Detection ---

def detect_format(text):
    t = text[:8000].lower()
    return 'microplus' in t or 'microplustiming' in t


# --- Month map for "25 AUG 2026" style dates ---

_MONTHS = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
    'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12,
}

# Birth date: "07 JUN 2006"
_BORN_RE = re.compile(r'(\d{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})')

# Session date line: "25 AUG 2026 - 10:21"
_SESSION_DATE_RE = re.compile(
    r'(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})\s*-\s*\d{1,2}:\d{2}'
)

# Event number: "Event 29"
_EVENT_NUM_RE = re.compile(r'^Event\s+(\d+)', re.IGNORECASE)

# Time: "22.02", "1:49.13", "48.77"
_TIME_RE = re.compile(r'^(\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2})$')

# Rank: leading integer
_RANK_RE = re.compile(r'^(\d{1,3})$')

# NAT code: exactly 3 uppercase letters
_NAT_RE = re.compile(r'^[A-Z]{3}$')

# Round keywords in page header
_ROUND_MAP = {
    'PRELIMINARIES': 'Prelims',
    'PRELIMINARY': 'Prelims',
    'HEATS': 'Heats',
    'HEAT': 'Heats',
    'SEMI-FINAL': 'Semis',
    'SEMIFINAL': 'Semis',
    'SEMI-FINALS': 'Semis',
    'SEMIFINALS': 'Semis',
    'FINAL': 'Finals',
    'FINALS': 'Finals',
}

# Qualification marker: q, R1, R2, R?, DNS, DQ, DNF, DSQ
_QUAL_RE = re.compile(r'^(q|R\d|R\?|DNS|DQ|DNF|DSQ|NS|EXH)$', re.IGNORECASE)

# Status markers
_STATUS_MAP = {
    'DNS': 'DNS', 'DQ': 'DQ', 'DSQ': 'DQ', 'DNF': 'DNF', 'NS': 'DNS',
}

# Skip lines
_SKIP_RE = re.compile(
    r'^(WR|WJ|CR|MR|ER|AR|NR|OR)\b|^Issued:|^SWIM|^Report Created|^Data Processing|'
    r'^RANK\b|^PTS$|^Page\s|^Results$|^NOT CLASSIFIED|'
    r'^Institutional|^International Committee|^In collaboration',
    re.IGNORECASE,
)


def _parse_born(text):
    """Extract birth year from "07 JUN 2006"."""
    m = _BORN_RE.search(text)
    return int(m.group(3)) if m else 0


def _parse_session_date(line):
    """Parse "25 AUG 2026 - 10:21" into YYYY-MM-DD."""
    m = _SESSION_DATE_RE.search(line)
    if m:
        day, mon, year = int(m.group(1)), _MONTHS.get(m.group(2), 0), int(m.group(3))
        if mon:
            return f'{year:04d}-{mon:02d}-{day:02d}'
    return ''


def _detect_event_and_round(lines):
    """From the first ~10 lines of a page section, extract event name, gender,
    round, and venue. Returns (event_text, round_text, gender, venue)."""
    event_text = ''
    round_text = ''
    gender = ''
    venue = ''
    for i, line in enumerate(lines[:12]):
        stripped = line.strip()
        upper = stripped.upper()
        if upper == 'SWIMMING':
            if i > 0:
                venue = lines[i - 1].strip()
            continue
        if upper == 'RESULTS':
            continue
        if upper in _ROUND_MAP:
            round_text = _ROUND_MAP[upper]
            continue
        # "Men 50m Freestyle" or "Women 200m Individual Medley"
        if re.match(r'(?:Men|Women|Mixed|Boys|Girls)\b', stripped, re.IGNORECASE):
            event_text = stripped
            gender = detect_gender(stripped)
            continue
        if stripped.upper().startswith('RANK'):
            break
    return event_text, round_text, gender, venue


def _parse_event_text(event_text):
    """Parse "Men 50m Freestyle" into (distance, stroke, is_relay)."""
    # Strip gender prefix
    clean = re.sub(r'^(?:Men|Women|Mixed|Boys|Girls)[\'s]*\s+', '', event_text, flags=re.IGNORECASE)
    relay = is_relay_event(clean)
    distance = extract_distance(clean)
    stroke = normalize_stroke(clean)
    return distance, stroke, relay


def parse(text):
    """Parse a Microplus PDF's full text into a ParsedMeet."""
    lines = text.split('\n')

    meet = ParsedMeet(source_format='microplus')
    events_map = {}  # (event_name, gender, round) -> ParsedEvent
    event_order = []

    # Collect meet name from the TARANTO 2026 / Mediterranean Games header.
    # The header appears on every page as the venue, but the overall meet
    # name is detected from prominent text like "XX MEDITERRANEAN GAMES"
    # or "GIOCHI DEL MEDITERRANEO".
    venue = ''
    all_dates = set()

    # --- Page-boundary parsing ---
    # Each page starts with venue / SWIMMING / event / round / Results.
    # We detect page boundaries by the repeated "SWIMMING" line.

    current_event_text = ''
    current_round = ''
    current_gender = ''
    current_event_num = ''
    current_date = ''
    current_event = None
    in_not_classified = False

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            continue

        upper = line.upper()

        # --- Page header detection ---
        if upper == 'SWIMMING':
            # New page — extract event info from the next few lines
            header_lines = lines[max(0, i - 2):min(len(lines), i + 10)]
            ev_text, rnd, gnd, ven = _detect_event_and_round(header_lines)
            if ev_text:
                current_event_text = ev_text
                current_round = rnd
                current_gender = gnd
            if ven and not venue:
                venue = ven
            in_not_classified = False

            # Create or find the ParsedEvent for this page
            if current_event_text:
                dist, stroke, relay = _parse_event_text(current_event_text)
                ev_name = normalize_event_name(dist, stroke, relay)
                key = (ev_name, current_gender, current_round)
                if key not in events_map:
                    pe = ParsedEvent(
                        event_name=ev_name, distance=dist, stroke=stroke,
                        gender=current_gender, round_type=current_round,
                    )
                    events_map[key] = pe
                    event_order.append(pe)
                current_event = events_map[key]
            continue

        # --- Event number ---
        em = _EVENT_NUM_RE.match(line)
        if em:
            current_event_num = em.group(1)
            continue

        # --- Session date ---
        sd = _parse_session_date(line)
        if sd:
            current_date = sd
            all_dates.add(sd)
            if current_event and not current_event.date_text:
                current_event.date_text = sd
            continue

        # --- Skip non-data lines ---
        if _SKIP_RE.match(line):
            if 'NOT CLASSIFIED' in upper:
                in_not_classified = True
            continue

        # Sub-heading "Final" that appears inside finals pages — skip
        if upper in _ROUND_MAP:
            continue

        # --- Result row parsing ---
        if not current_event:
            continue

        # Tokenize the line
        tokens = line.split()
        if len(tokens) < 4:
            continue

        # Check if this is a split-time continuation line (all numbers, short)
        if all(re.match(r'^\d{1,2}\.\d{2}$', t) for t in tokens):
            # Splits for the previous result
            if current_event.results:
                prev = current_event.results[-1]
                prev.split_times.extend(tokens)
            continue

        # Try to parse as a result row
        result = _try_parse_row(tokens, current_gender, current_round, in_not_classified)
        if result:
            current_event.results.append(result)

    # --- Assemble the meet ---
    meet.events = event_order
    meet.location = venue

    # Try to find meet name from header text (look for Mediterranean/GIOCHI etc.)
    for line in lines[:50]:
        stripped = line.strip()
        if re.search(r'Mediterranean|GIOCHI|JEUX|JUEGOS|المتوسطي', stripped, re.IGNORECASE):
            if not meet.meet_name or len(stripped) > len(meet.meet_name):
                meet.meet_name = stripped
            break

    # If no meet name found, try early lines (skip noise like "PTS", event headers)
    _NOISE = {'PTS', 'SWIMMING', 'RESULTS', 'RANK', 'EVENT'}
    if not meet.meet_name:
        for line in lines[:30]:
            stripped = line.strip()
            if not stripped or len(stripped) < 4:
                continue
            upper = stripped.upper()
            if upper in _NOISE or upper in _ROUND_MAP:
                continue
            if stripped == venue:
                continue
            if re.match(r'^(?:Men|Women|Mixed|Boys|Girls)\b', stripped, re.IGNORECASE):
                continue
            if re.match(r'^RANK\b|^Event\s+\d|^WR\b|^WJ\b|^CR\b|^\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)', stripped, re.IGNORECASE):
                continue
            if re.match(r'^\d', stripped):  # result rows start with rank
                continue
            if stripped.startswith('SWIM') or stripped.startswith('Issued'):
                continue
            meet.meet_name = stripped
            break

    if not meet.meet_name:
        meet.meet_name = venue

    # Set date from collected session dates
    if all_dates:
        sorted_dates = sorted(all_dates)
        meet.date_text = sorted_dates[0]

    return meet


def _try_parse_row(tokens, gender, round_type, in_not_classified):
    """Try to parse a token list as a result row.

    Prelim rows: RANK HEAT LANE NAME... NAT BORN R.T. TIME [GAP] [AQUA] [qual]
    Final rows:  RANK LANE NAME... NAT BORN R.T. TIME [GAP] [AQUA]

    Returns ParsedResult or None.
    """
    if not tokens:
        return None

    idx = 0

    # Rank
    if not _RANK_RE.match(tokens[idx]):
        return None
    rank = int(tokens[idx])
    idx += 1
    if idx >= len(tokens):
        return None

    # Heat (optional — present in prelims, absent in finals)
    # Heat and Lane are small integers. We need to figure out how many
    # positional integer fields precede the name.
    # Prelim: RANK HEAT LANE NAME... → 3 leading ints
    # Final:  RANK LANE NAME... → 2 leading ints
    # We consume all leading small-integer tokens (max 3 including rank)
    pos_ints = [rank]
    while idx < len(tokens) and tokens[idx].isdigit() and int(tokens[idx]) <= 20 and len(pos_ints) < 3:
        pos_ints.append(int(tokens[idx]))
        idx += 1

    if idx >= len(tokens):
        return None

    # Name tokens: everything from idx until we hit a 3-letter NAT code
    name_tokens = []
    while idx < len(tokens):
        if _NAT_RE.match(tokens[idx]) and idx + 1 < len(tokens):
            # Check the next token looks like a date or time (confirms this is NAT)
            next_tok = tokens[idx + 1]
            if _BORN_RE.search(' '.join(tokens[idx + 1:idx + 4])) or next_tok.upper() in _MONTHS:
                break
        name_tokens.append(tokens[idx])
        idx += 1

    if not name_tokens or idx >= len(tokens):
        return None

    swimmer_name = ' '.join(name_tokens)

    # NAT code
    nat_code = ''
    if idx < len(tokens) and _NAT_RE.match(tokens[idx]):
        nat_code = tokens[idx]
        idx += 1

    # Birth date: "07 JUN 2006" — 3 tokens
    birth_year = 0
    born_text = ' '.join(tokens[idx:idx + 3])
    bm = _BORN_RE.search(born_text)
    if bm:
        birth_year = int(bm.group(3))
        idx += 3

    # Remaining tokens: R.T., [splits], TIME, [GAP], [AQUA/PTS], [qual]
    remaining = tokens[idx:]

    # Find the time: the last token matching TIME_RE before qual markers
    time_text = ''
    status = 'OK'
    fina_points = 0

    # Check for DNS/DQ/DNF status
    for t in remaining:
        if t.upper() in _STATUS_MAP:
            status = _STATUS_MAP[t.upper()]
            return ParsedResult(
                swimmer_name=swimmer_name, time_text='', rank=rank,
                birth_year=birth_year, nationality_code=nat_code,
                gender=gender, round_type=round_type, status=status,
            )

    # Parse from remaining tokens: skip R.T. (0.65), find time, gap, AQUA
    # R.T. is a small decimal like "0.65" (reaction time)
    # Split times are small decimals like "23.80" (under 60)
    # Final time is the bolded large value
    # AQUA points is an integer
    # Gap is a decimal like "0.14"
    # Qual is "q", "R1", "R2", "R?"

    # Strategy: find all time-like values and the AQUA integer
    time_candidates = []
    for j, t in enumerate(remaining):
        if _TIME_RE.match(t):
            cs = parse_time_to_centiseconds(t)
            time_candidates.append((j, t, cs))
        elif _QUAL_RE.match(t):
            pass  # skip
        elif t.replace('.', '').isdigit():
            pass  # reaction time, gap, or AQUA points

    if not time_candidates:
        return None

    # The main time is the largest centiseconds value (cumulative > splits)
    time_candidates.sort(key=lambda x: x[2], reverse=True)
    best = time_candidates[0]
    time_text = best[1]
    time_cs = best[2]

    # Splits: all other time candidates with smaller values
    splits = [t[1] for t in time_candidates[1:] if t[2] < time_cs]
    # Reaction time is typically < 100 centiseconds — exclude from splits
    splits = [s for s in splits if parse_time_to_centiseconds(s) >= 100]

    # AQUA/FINA points: look for a bare integer > 100
    for t in remaining:
        if t.isdigit() and int(t) > 100:
            fina_points = int(t)
            break

    if in_not_classified and status == 'OK':
        # Swimmers in NOT CLASSIFIED without explicit status are DNS
        if not time_text:
            status = 'DNS'

    return ParsedResult(
        swimmer_name=swimmer_name,
        time_text=time_text,
        time_centiseconds=time_cs,
        rank=rank,
        birth_year=birth_year,
        nationality_code=nat_code,
        gender=gender,
        round_type=round_type,
        fina_points=fina_points,
        split_times=splits,
        status=status,
    )
