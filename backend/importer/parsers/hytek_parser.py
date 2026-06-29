"""
Parser for HY-TEK Meet Manager PDF format.
Used by: Hamilton Aquatics, Lebanon championships, and many international meets.
Identified by: "HY-TEK" or "MEET MANAGER" in text.

Format varies but generally:
  Event header: "Event 1 Boys 12-13 800 SC Meter Freestyle" or
                "Girls 8-11 50 SC Meter Freestyle"
  Columns: Name Age Team Finals Time [LEN]
  Result line: "1 Josselin, Holly 11 EXCW-SW 29.70"
  Lebanon adds: record info, meet qualifying, split times on separate lines
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, detect_gender,
    normalize_name, is_relay_event, normalize_event_name,
)


# ---- EVENT HEADER PATTERNS ----

# Full: "Event 1 Boys 12-13 800 SC Meter Freestyle"
# Also: "Event 1 Girls 8-11 50 LC Meter Backstroke"
# Also: "Event 1 Men Open 1500 SC Meter Freestyle"
# Also: "Event 1 Boys 8 & Under 50 SC Meter Freestyle"
EVENT_HEADER = re.compile(
    r'(?:Event\s+\d+\s+)?'
    r'(Boys|Girls|Men|Women|Mixed)\s+'
    r'((?:\d+(?:\s*[-&]\s*(?:\d+|Over|Under))?|Open))\s+'
    r'(\d+)\s+'
    r'(?:SC|LC)\s+Met(?:er|re)s?\s+'
    r'(.+)',
    re.IGNORECASE
)

# Relay header: "Event 1 Boys 12-13 4x100 SC Meter Freestyle Relay"
RELAY_HEADER = re.compile(
    r'(?:Event\s+\d+\s+)?'
    r'(Boys|Girls|Men|Women|Mixed)\s+'
    r'((?:\d+(?:\s*[-&]\s*(?:\d+|Over|Under))?|Open))\s+'
    r'(\d+)x(\d+)\s+'
    r'(?:SC|LC)\s+Met(?:er|re)s?\s+'
    r'(.+)',
    re.IGNORECASE
)

# ---- SKIP PATTERNS (lines to ignore) ----
SKIP_PATTERNS = [
    re.compile(r'hy-tek', re.IGNORECASE),
    re.compile(r'meet manager', re.IGNORECASE),
    re.compile(r'^\s*Page\s+\d', re.IGNORECASE),
    re.compile(r'^\s*Record:', re.IGNORECASE),
    re.compile(r'Meet Qualifying', re.IGNORECASE),
    re.compile(r'^\s*Name\s+Age\s+Team', re.IGNORECASE),
    re.compile(r'^\s*Name\s+Ag\s*e\s+Team', re.IGNORECASE),
    re.compile(r'^\s*[-=]+\s*$'),
    re.compile(r'^\s*Results$', re.IGNORECASE),
    re.compile(r'^\s*Preliminaries$', re.IGNORECASE),
    re.compile(r'^\s*Finals$', re.IGNORECASE),
    re.compile(r'^\s*Consolation', re.IGNORECASE),
    re.compile(r'^\s*Seed\s+Time', re.IGNORECASE),
    re.compile(r'^\s*(?:Finals|Prelim)\s+Time', re.IGNORECASE),
    re.compile(r'^\s*LEN\s+Points', re.IGNORECASE),
]

# ---- RESULT LINE PATTERNS ----

# Standard: "1 Fakhreddine, Youssef 15 NSSC-LB 1:12.66"
# With points: "2 Al Khatib, Omar 14 OLY-LB 1:15.34 456"
# Tie: "*3 Saad, Ali 16 NSSC-LB 59.85"
# No comma: "1 Youssef Fakhreddine 15 NSSC-LB 1:12.66"
#
# Strategy: use TIME as anchor, then parse backwards from it
TIME_PATTERN = re.compile(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2})')

# DQ/NS/DNF patterns
DQ_LINE = re.compile(
    r'^\s*---\s+(.+?)\s+(\d{1,2})\s+(\S+)\s+(DQ|NS|DFS|DNF|SCR|DSQ)',
    re.IGNORECASE
)

# Rank at start of a result line
RANK_PREFIX = re.compile(r'^\s*\*?(\d{1,3})\s+')

# Round type markers
ROUND_KEYWORDS = {
    'Finals': re.compile(r'\bFinals?\b', re.IGNORECASE),
    'Prelims': re.compile(r'\bPrelim', re.IGNORECASE),
    'Consolation': re.compile(r'\bConsol', re.IGNORECASE),
}


def detect_format(text):
    """Check if this text is from HY-TEK Meet Manager."""
    t = text.lower()
    return 'hy-tek' in t or 'meet manager' in t


def parse(text):
    """Parse HY-TEK Meet Manager format text into ParsedMeet."""
    from .base import extract_date_and_location

    lines = text.split('\n')
    meet = ParsedMeet(source_format='hytek')

    # ---- EXTRACT HEADER INFO ----
    header_lines = []
    for line in lines[:20]:
        line = line.strip()
        if not line:
            continue
        if 'results' == line.lower():
            continue
        if re.match(r'^\d+\s+\w+,', line):  # skip result lines
            continue
        if any(p.search(line) for p in SKIP_PATTERNS):
            continue
        header_lines.append(line)
        if len(header_lines) >= 5:
            break

    # Find meet name (first line without hy-tek/meet manager)
    for line in header_lines:
        if 'hy-tek' in line.lower() or 'meet manager' in line.lower():
            continue
        if not meet.meet_name:
            meet.meet_name = line

    # Extract dates
    combined_header = ' '.join(header_lines)
    start_date, end_date, location = extract_date_and_location(combined_header)
    meet.date_text = start_date
    if end_date:
        meet.date_end = end_date

    # Clean dates from meet name
    if meet.meet_name:
        clean_name = meet.meet_name
        clean_name = re.sub(r'\d{1,2}/\d{1,2}/\d{4}', '', clean_name)
        clean_name = re.sub(r'\b(to|¤)\b', '', clean_name)
        clean_name = re.sub(r'\s*[-–]\s*$', '', clean_name)
        clean_name = re.sub(r'^\s*[-–]\s*', '', clean_name)
        clean_name = re.sub(r'\s+', ' ', clean_name).strip()
        meet.meet_name = clean_name

    # Pool detection
    text_lower = text.lower()
    if ' sc ' in text_lower or 'short course' in text_lower or 'sc meter' in text_lower:
        meet.pool = 'SCM'
    elif ' lc ' in text_lower or 'long course' in text_lower or 'lc meter' in text_lower:
        meet.pool = 'LCM'

    # Detect comma order for names:
    # Lebanon local meets use "First, Last" (e.g. "Adam, Hmedeh")
    # All other HY-TEK meets use "LAST, First" (international standard)
    header_text = combined_header.lower()
    is_lebanon_local = any(kw in header_text for kw in [
        'liban', 'lebanese', 'lebanon', 'championnat du liban',
    ])
    comma_order = 'first_last' if is_lebanon_local else 'last_first'

    # ---- PARSE EVENTS AND RESULTS ----
    current_event = None
    current_round = ''

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Skip known non-data lines
        if _should_skip(stripped):
            # Check for round type ONLY on standalone round markers
            # NOT on column headers like "Name Age Team Finals Time"
            if not re.search(r'Name\s+Ag', stripped, re.IGNORECASE):
                for rtype, pattern in ROUND_KEYWORDS.items():
                    if pattern.search(stripped):
                        current_round = rtype
            continue

        # Check for relay event header
        relay_match = RELAY_HEADER.search(stripped)
        if relay_match:
            gender_text = relay_match.group(1)
            age_group = relay_match.group(2).strip()
            legs = int(relay_match.group(3))
            leg_dist = int(relay_match.group(4))
            stroke_raw = relay_match.group(5).strip()

            gender = 'F' if gender_text.lower() in ('girls', 'women') else 'M'
            stroke = normalize_stroke(stroke_raw)
            distance = legs * leg_dist
            event_name = normalize_event_name(distance, stroke, True)

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=current_round,
                age_group=age_group,
            )
            meet.events.append(current_event)
            current_round = ''
            continue

        # Check for individual event header
        header_match = EVENT_HEADER.search(stripped)
        if header_match:
            gender_text = header_match.group(1)
            age_group = header_match.group(2).strip()
            distance = int(header_match.group(3))
            stroke_raw = header_match.group(4).strip()

            gender = 'F' if gender_text.lower() in ('girls', 'women') else 'M'
            stroke = normalize_stroke(stroke_raw)
            relay = is_relay_event(stroke_raw)
            event_name = normalize_event_name(distance, stroke, relay)

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=current_round,
                age_group=age_group,
            )
            meet.events.append(current_event)
            current_round = ''
            continue

        if not current_event:
            continue

        # Skip split time lines (e.g. "28.54  1:02.80  1:41.80  2:19.05")
        if _is_split_line(stripped):
            continue

        # Check for DQ/NS/DNF lines
        dq_match = DQ_LINE.match(stripped)
        if dq_match:
            name = normalize_name(dq_match.group(1), comma_order=comma_order)
            age = int(dq_match.group(2))
            status_raw = dq_match.group(4).upper()
            status_map = {'DQ': 'DQ', 'DSQ': 'DQ', 'NS': 'DNS', 'DFS': 'DNS', 'DNF': 'DNF', 'SCR': 'DNS'}
            result = ParsedResult(
                swimmer_name=name,
                time_text='',
                age=age,
                club=dq_match.group(3),
                status=status_map.get(status_raw, 'DQ'),
                gender=current_event.gender,
                event_name=current_event.event_name,
                event_distance=current_event.distance,
                event_stroke=current_event.stroke,
            )
            current_event.results.append(result)
            continue

        # Try to parse as result line
        result = _parse_result_line(stripped, current_event, comma_order)
        if result:
            # Sanity check: reject times that are impossibly fast for the event distance
            # This catches interleaved two-column PDF results from adjacent events
            if not _time_plausible(result.time_centiseconds, current_event.distance):
                continue
            current_event.results.append(result)

    return meet


def _should_skip(line):
    """Check if a line should be skipped (headers, footers, column labels)."""
    for pattern in SKIP_PATTERNS:
        if pattern.search(line):
            return True
    return False


def _time_plausible(time_cs, distance):
    """Check if a time is plausible for a given distance.
    Rejects impossibly fast times that come from interleaved PDF columns."""
    if distance <= 0 or time_cs <= 0:
        return True
    # Minimum possible times (centiseconds) — generous but catches column interleaving
    min_times = {
        200: 10000,    # 1:40.00 — WR is ~1:51, age group ~2:00+
        400: 22000,    # 3:40.00 — WR is ~3:40
        800: 45000,    # 7:30.00 — WR is ~7:32
        1500: 85000,   # 14:10.00 — WR is ~14:06
    }
    for dist_threshold, min_time in sorted(min_times.items()):
        if distance >= dist_threshold and time_cs < min_time:
            return False
    return True


def _is_split_line(line):
    """Detect split time lines like '28.54   1:02.80   1:41.80   2:19.05'.
    These have multiple times but no rank, name, age, or team."""
    stripped = line.strip()
    if not stripped:
        return False
    # Count time patterns in the line
    times = TIME_PATTERN.findall(stripped)
    if len(times) >= 2:
        # Multiple times = almost certainly a split line
        # Remove all times and see what's left
        remaining = TIME_PATTERN.sub('', stripped).strip()
        # Split lines have only whitespace/punctuation between times
        # Real result lines have names, ages, teams
        if not remaining or all(c in ' \t.,-+()rR' for c in remaining):
            return True
    # Single time on a line with no alphabetic characters (just numbers/spaces) = split
    if len(times) == 1:
        remaining = TIME_PATTERN.sub('', stripped).strip()
        # If what remains is only digits, spaces, or reaction times (+0.XX)
        if remaining and not any(c.isalpha() for c in remaining):
            return True
    return False


def _parse_result_line(line, event, comma_order='last_first'):
    """
    Parse a HY-TEK result line using TIME as anchor.

    Strategy:
    1. Find the time pattern in the line
    2. Everything before time = rank + name + age + team
    3. Everything after time = optional FINA points
    4. Parse the before-time section by working backwards from the time:
       - Token before time = team code
       - Token before team = age (1-2 digit number)
       - Everything before age = name (after rank)
    """
    # Must have a time somewhere in the line
    time_match = TIME_PATTERN.search(line)
    if not time_match:
        return None

    time_text = time_match.group(1)
    time_cs = parse_time_to_centiseconds(time_text)
    if time_cs <= 0:
        return None

    before_time = line[:time_match.start()].strip()
    after_time = line[time_match.end():].strip()

    # ---- Parse AFTER time: FINA points ----
    fina_points = 0
    pts_match = re.match(r'\s*(\d{1,4})\b', after_time)
    if pts_match:
        val = int(pts_match.group(1))
        if 1 <= val <= 1200:  # reasonable FINA points range
            fina_points = val

    # ---- Parse BEFORE time: rank, name, age, team ----
    # Remove rank prefix
    rank = 0
    rank_match = RANK_PREFIX.match(before_time)
    if rank_match:
        rank = int(rank_match.group(1))
        before_time = before_time[rank_match.end():]
    else:
        # No rank — might not be a result line
        # Check if the line at least has enough structure
        if not before_time:
            return None

    # Now before_time should be: "Name, First Age Team" or "Name First Age Team"
    # Work backwards: split into tokens
    tokens = before_time.split()
    if len(tokens) < 3:
        return None

    # Find age and team by scanning from the right
    # Team is the last token (e.g., "NSSC-LB", "OLY-LB", "EXCW-SW")
    # Age is the second-to-last token (1-2 digit number)
    team = ''
    age = 0
    name_end_idx = len(tokens)

    # Scan from right to find: team_code age_number
    # Team codes are alphanumeric (often with dash): [A-Z0-9]+-?[A-Z0-9]*
    # Age is 1-2 digits between 5 and 99
    for i in range(len(tokens) - 1, 0, -1):
        token = tokens[i]
        prev_token = tokens[i - 1]

        # Check if prev_token is age (1-2 digit number, 5-99)
        if re.match(r'^\d{1,2}$', prev_token):
            possible_age = int(prev_token)
            if 5 <= possible_age <= 99:
                # Check if current token looks like a team code
                if re.match(r'^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)?$', token):
                    team = token
                    age = possible_age
                    name_end_idx = i - 1
                    break

    if age == 0:
        # Could not find age+team pattern — try without team
        # Some formats might not have a team code
        for i in range(len(tokens) - 1, 0, -1):
            if re.match(r'^\d{1,2}$', tokens[i]):
                possible_age = int(tokens[i])
                if 5 <= possible_age <= 99:
                    age = possible_age
                    name_end_idx = i
                    # The token after might be team
                    if i + 1 < len(tokens):
                        team = tokens[i + 1]
                        # But we already captured it — skip
                    break

    if name_end_idx <= 0:
        return None

    # Reconstruct name from remaining tokens
    name_raw = ' '.join(tokens[:name_end_idx])
    name = normalize_name(name_raw, comma_order=comma_order)

    if not name or len(name) < 2:
        return None

    # birth_year will be computed later using the meet date, not today's date
    # Store age only; services.py will calculate birth_year from meet year

    return ParsedResult(
        swimmer_name=name,
        time_text=time_text,
        time_centiseconds=time_cs,
        event_name=event.event_name,
        event_distance=event.distance,
        event_stroke=event.stroke,
        gender=event.gender,
        rank=rank,
        age=age,
        club=team,
        fina_points=fina_points,
        round_type=event.round_type,
        age_group=event.age_group,
    )
