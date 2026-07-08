"""
Parser for HY-TEK Meet Manager PDF format.
Used by: Hamilton Aquatics, Lebanon championships, Jordan, and many international meets.
Identified by: "HY-TEK" or "MEET MANAGER" in text.

Format varies but generally:
  Event header: "Event 1 Boys 12-13 800 SC Meter Freestyle" or
                "Girls 8-11 50 SC Meter Freestyle"
  Continuation: "(Event 5 Boys 12-13 50 SC Meter Backstroke)" after page breaks,
                sometimes prefixed with "Preliminaries ..." on the same line
  Round markers come AFTER the event header:
    column header "Name Age Team Prelim Time" / "... Finals Time"
    standalone "Preliminaries" / "Finals" lines
  Result line: "1 Josselin, Holly 11 EXCW-SW 29.70"
  Relay section:
    header: "Event 69 Boys 12-13 200 SC Meter Freestyle Relay"
    team:   "1 NAJ A 2:00.88 354"   /  DQ: "--- MTY A NS"
    legs:   "1) Ghassan, Zein 12 2) Mohamad, Chahrour 13"
    splits: "29.93 32.67 29.35 28.93"  (paired with legs in order)
  Individual splits appear on their own lines after the result line.
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke,
    normalize_name, is_relay_event, normalize_event_name,
    merge_duplicate_events,
)


# ---- EVENT HEADER PATTERNS ----

# Full: "Event 1 Boys 12-13 800 SC Meter Freestyle"
# Also: "Event 1 Girls 8-11 50 LC Meter Backstroke"
# Also: "Event 1 Men Open 1500 SC Meter Freestyle"
# Also: "Event 1 Boys 8 & Under 50 SC Meter Freestyle"
EVENT_HEADER = re.compile(
    r'(?:Event\s+\d+\s+)?'
    r'(Boys|Girls|Men|Women|Mixed)\s+'
    r'(?:((?:\d+(?:\s*[-&\s]\s*(?:\d+|Over|Under|Year\s*Olds?))?|Open))\s+)?'
    r'(\d+)\s+'
    r'(?:SC|LC)\s+Met(?:er|re)s?\s+'
    r'(.+)',
    re.IGNORECASE
)

# Relay header with explicit legs: "Event 1 Boys 12-13 4x100 SC Meter Freestyle Relay"
RELAY_HEADER = re.compile(
    r'(?:Event\s+\d+\s+)?'
    r'(Boys|Girls|Men|Women|Mixed)\s+'
    r'(?:((?:\d+(?:\s*[-&\s]\s*(?:\d+|Over|Under|Year\s*Olds?))?|Open))\s+)?'
    r'(\d+)\s*x\s*(\d+)\s+'
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
    re.compile(r'Age\s*G\s*Record', re.IGNORECASE),
    re.compile(r'Jor\s*Record', re.IGNORECASE),
    re.compile(r'National\s+Team', re.IGNORECASE),
    re.compile(r'High\s+Performance', re.IGNORECASE),
    re.compile(r'Meet Qualifying', re.IGNORECASE),
    re.compile(r'^\s*[-=]+\s*$'),
    re.compile(r'^\s*Results$', re.IGNORECASE),
    re.compile(r'^\s*Consolation', re.IGNORECASE),
    re.compile(r'^\s*Seed\s+Time', re.IGNORECASE),
    re.compile(r'^\s*LEN\s+Points', re.IGNORECASE),
]

# Column headers carry the round: "Name Ag e Team Prelim Time LEN",
# "Name Age Team Finals Time", "Team R elay Finals Time LEN",
# Jordan: "ID# Name Age Team Seed Time Finals Time FINA"
COLUMN_HEADER = re.compile(
    r'^\s*(?:ID#?\s+)?(?:Name\s+Ag\s*e?\s+Team|Team\s+R\s*elay)\b', re.IGNORECASE
)
COLUMN_ROUND = re.compile(r'(Prelim\w*|Finals?)\s+Time', re.IGNORECASE)
COLUMN_SEED = re.compile(r'Seed\s+Time', re.IGNORECASE)

# Standalone round marker lines
ROUND_MARKER = re.compile(r'^\s*(Preliminaries|Finals|Swim-?offs?)\s*$', re.IGNORECASE)

# Round keywords for lines that combine marker + event reference
ROUND_KEYWORDS = {
    'Finals': re.compile(r'\bFinals?\b', re.IGNORECASE),
    'Prelims': re.compile(r'\bPrelim', re.IGNORECASE),
}

# ---- RESULT LINE PATTERNS ----

TIME_PATTERN = re.compile(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2})')

# Individual DQ/NS/DNF: "--- Fakhreddine, Youssef 15 NSSC-LB DQ"
# Jordan variant carries an ID and a seed time before the status:
# "--- 20011367 Masarweh, Assiel 13 ORTH 3:16.31 DQ"
DQ_LINE = re.compile(
    r'^\s*---\s+(?:\d{6,10}\s+)?(.+?)\s+(\d{1,2})\s+(\S+)\s+'
    r'(?:(?:NT|\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2})\s+)?'
    r'(DQ|NS|DFS|DNF|SCR|DSQ)',
    re.IGNORECASE
)

# A result line must never end in a status word (DQ row with a seed time)
STATUS_TAIL = re.compile(r'\b(DQ|NS|DFS|DNF|SCR|DSQ)\s*$', re.IGNORECASE)

# Relay team result/DQ patterns are now handled flexibly inside
# _parse_relay_line() using TIME_PATTERN anchoring (no rigid regex).
_TIME_PAT = r'(?:\d{1,2}:\d{2}\.\d{2}|\d{2,3}\.\d{2})'

# Relay team DQ: "--- MTY A NS"  or  "--- Iran DQ"  or  "--- Malaysia 3:33.08 DQ"
RELAY_DQ_LINE = re.compile(
    r'^\s*---\s+'
    r'([A-Z][A-Za-z0-9\'\.\- ]+?)\s+'          # team name
    r'(?:([A-Z])\s+)?'                          # optional relay letter
    r'(?:(?:NT|' + _TIME_PAT + r')\s+)?'        # optional seed/prelim time or NT
    r'(DQ|NS|DFS|DNF|SCR|DSQ)',
    re.IGNORECASE
)

# Relay leg swimmers: "1) Ghassan, Zein 12 2) Mohamad, Chahrour 13"
RELAY_SWIMMER_MARK = re.compile(r'\d\)\s')
RELAY_SWIMMER_PART = re.compile(r'(\d)\)\s*(.+?)(?=\s+\d\)|\s*$)')

# Rank at start of a result line
RANK_PREFIX = re.compile(r'^\s*\*?(\d{1,3})\s+')

STATUS_MAP = {'DQ': 'DQ', 'DSQ': 'DQ', 'NS': 'DNS', 'DFS': 'DNS', 'DNF': 'DNF', 'SCR': 'DNS'}


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
    # Collect only the true header: meet name, date, location.
    # Stop before Event lines, Record lines, or column headers.
    header_lines = []
    for line in lines[:20]:
        line = line.strip()
        if not line:
            continue
        if 'results' == line.lower():
            continue
        if re.match(r'^\d+\s+\w+,', line):  # result lines
            break
        if any(p.search(line) for p in SKIP_PATTERNS):
            continue
        if re.match(r'^Event\s+\d', line, re.IGNORECASE):
            break
        if re.search(r'Record:', line, re.IGNORECASE):
            break
        if re.match(r'^(Name|ID#)\s+(Age|Team)', line, re.IGNORECASE):
            break
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

    # Name comma order:
    #   Most HY-TEK meets print "LAST, First" (Hamilton, Jordan).
    #   Lebanese federation files print "First, LAST" ("Jude, Aoun" = Jude AOUN).
    sniff = (meet.meet_name + ' ' + ' '.join(header_lines)).lower()
    comma_order = 'first_last' if ('leban' in sniff or 'liban' in sniff) else 'last_first'

    # ---- PARSE EVENTS AND RESULTS ----
    current_event = None
    current_key = None  # (event_name, gender, age_group)
    # True when the column header has two time columns (e.g. "Seed Time
    # Prelim Time" or "Prelim Time Finals Time") — the actual swim time
    # for the current round is the LAST time on each result line.
    take_last_time = False

    def switch_round(round_type):
        """Point current_event at the (event, round) classement, creating a
        sibling event when the current one already holds other-round results."""
        nonlocal current_event
        if current_event is None or not round_type:
            return
        if current_event.round_type == round_type:
            return
        if not current_event.results:
            current_event.round_type = round_type
            return
        sibling = ParsedEvent(
            event_name=current_event.event_name,
            distance=current_event.distance,
            stroke=current_event.stroke,
            gender=current_event.gender,
            round_type=round_type,
            age_group=current_event.age_group,
        )
        meet.events.append(sibling)
        current_event = sibling

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Strip stray single lowercase letters that column-cropped extraction
        # sometimes prepends ("e 2 Thompson, Anna 14 Hamilton 9:11.28")
        stripped = re.sub(r'^[a-z]\s+(?=\S)', '', stripped)
        if len(stripped) <= 1:
            continue

        # Round in this line, if any (used by headers and markers below)
        line_round = ''
        for rtype, pattern in ROUND_KEYWORDS.items():
            if pattern.search(stripped):
                line_round = rtype
                break

        # ---- Event headers (incl. "(Event N ...)" page-break continuations) ----
        relay_match = RELAY_HEADER.search(stripped)
        header_match = None if relay_match else EVENT_HEADER.search(stripped)

        if relay_match or header_match:
            m = relay_match or header_match
            gender_text = m.group(1)
            age_group = (m.group(2) or '').strip()
            if relay_match:
                legs = int(m.group(3))
                leg_dist = int(m.group(4))
                distance = legs * leg_dist
                stroke_raw = m.group(5).strip()
                relay = True
            else:
                distance = int(m.group(3))
                stroke_raw = m.group(4).strip()
                relay = is_relay_event(stroke_raw)

            gl = gender_text.lower()
            if gl == 'mixed':
                gender = 'X'
            elif gl in ('girls', 'women'):
                gender = 'F'
            else:
                gender = 'M'
            stroke = normalize_stroke(stroke_raw)
            event_name = normalize_event_name(distance, stroke, relay)
            if relay:
                gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(gender, '')
                if gender_label:
                    event_name = f'{event_name} {gender_label}'

            key = (event_name, gender, age_group)
            if key == current_key and current_event is not None:
                # Page-break continuation of the same event
                if line_round:
                    switch_round(line_round)
                continue

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=line_round,
                age_group=age_group,
            )
            meet.events.append(current_event)
            current_key = key
            continue

        # ---- Round signals (apply to the CURRENT event) ----
        # Column header: "Name Ag e Team Prelim Time LEN" / "Team R elay Finals Time"
        # Headers with two time columns ("Prelim Time Finals Time" or
        # "Seed Time Prelim Time") mean the LAST time on each result
        # line is the actual swim; the first time is a reference column.
        if COLUMN_HEADER.match(stripped):
            round_matches = list(COLUMN_ROUND.finditer(stripped))
            seed = COLUMN_SEED.search(stripped)
            take_last_time = len(round_matches) >= 2 or bool(seed)
            if round_matches and current_event is not None:
                # Use the LAST match as the round (that's the result column)
                word = round_matches[-1].group(1).lower()
                switch_round('Prelims' if word.startswith('prelim') else 'Finals')
            continue

        # Standalone marker: "Preliminaries" / "Finals"
        marker = ROUND_MARKER.match(stripped)
        if marker:
            word = marker.group(1).lower()
            if word.startswith('prelim'):
                switch_round('Prelims')
            elif word.startswith('final'):
                switch_round('Finals')
            continue

        # Skip known non-data lines
        if _should_skip(stripped):
            continue

        if not current_event:
            continue

        event_is_relay = _is_relay(current_event.event_name)

        if event_is_relay:
            if _parse_relay_line(stripped, current_event, comma_order, take_last_time):
                continue
            # Splits line inside relay: pair with leg swimmers
            if _is_split_line(stripped) and current_event.results:
                _attach_relay_splits(current_event.results[-1], stripped)
                continue
            continue

        # Individual split lines: attach to the previous result
        if _is_split_line(stripped):
            if current_event.results:
                times = TIME_PATTERN.findall(stripped)
                current_event.results[-1].split_times.extend(times)
            continue

        # DQ/NS/DNF lines
        dq_match = DQ_LINE.match(stripped)
        if dq_match:
            name = normalize_name(dq_match.group(1), comma_order=comma_order)
            age = int(dq_match.group(2))
            status_raw = dq_match.group(4).upper()
            result = ParsedResult(
                swimmer_name=name,
                time_text='',
                age=age,
                club=dq_match.group(3),
                status=STATUS_MAP.get(status_raw, 'DQ'),
                gender=current_event.gender,
                event_name=current_event.event_name,
                event_distance=current_event.distance,
                event_stroke=current_event.stroke,
                round_type=current_event.round_type,
                age_group=current_event.age_group,
            )
            current_event.results.append(result)
            continue

        # Try to parse as result line
        result = _parse_result_line(stripped, current_event, comma_order, take_last_time)
        if result:
            # Sanity check: reject times that are impossibly fast for the event distance
            # This catches interleaved two-column PDF results from adjacent events
            if not _time_plausible(result.time_centiseconds, current_event.distance):
                continue
            current_event.results.append(result)

    meet.events = [e for e in meet.events if e.results]
    merge_duplicate_events(meet)
    return meet


def _is_relay(event_name):
    return 'relay' in event_name.lower()


def _parse_relay_line(line, event, comma_order, take_last_time=False):
    """Parse team/DQ/leg-swimmer lines inside a relay event.
    Returns True if the line was consumed."""

    # Team DQ: "--- MTY A NS" / "--- Iran DQ" / "--- Malaysia 3:33.08 DQ"
    m = RELAY_DQ_LINE.match(line)
    if m:
        team = m.group(1).strip()
        letter = m.group(2) or ''
        status_raw = m.group(3).upper()
        display = f'{team} {letter}'.strip()
        event.results.append(ParsedResult(
            swimmer_name=display,
            time_text='',
            status=STATUS_MAP.get(status_raw, 'DQ'),
            gender=event.gender,
            event_name=event.event_name,
            event_distance=event.distance,
            event_stroke=event.stroke,
            club=team,
            round_type=event.round_type,
            age_group=event.age_group,
        ))
        return True

    # Team result: flexible parsing with time anchoring.
    # Handles: "1 NAJ A 2:00.88 354" (with relay letter, one time)
    #          "1 Japan 3:30.50 3:25.32" (no relay letter, two times)
    #          "1 Hong Kong China 3:56.76" (multi-word, one time)
    #          "1 Kazakhstan 3:28.58 q" (one time + qualifier)
    rank_m = RANK_PREFIX.match(line)
    if rank_m:
        rank = int(rank_m.group(1))
        rest = line[rank_m.end():]
        times = list(TIME_PATTERN.finditer(rest))
        if times:
            # Text before first time = team [+ relay letter] [+ NT]
            before = rest[:times[0].start()].strip()
            before = re.sub(r'\bNT\b', '', before).strip()
            tokens = before.split()
            if tokens:
                # Check for relay letter (single uppercase letter at end)
                letter = ''
                if len(tokens) >= 2 and len(tokens[-1]) == 1 and tokens[-1].isupper():
                    letter = tokens[-1]
                    team = ' '.join(tokens[:-1])
                else:
                    team = ' '.join(tokens)

                # Pick the right time
                if take_last_time and len(times) >= 2:
                    time_match = times[-1]
                else:
                    time_match = times[0]

                time_text = time_match.group(1)
                time_cs = parse_time_to_centiseconds(time_text)

                # Relay totals are swum by 4 swimmers — judge plausibility per leg
                if not _time_plausible(time_cs, event.distance // 4):
                    return False

                # Points after last time (skip qualifier letters like "q")
                after = rest[times[-1].end():].strip()
                after = re.sub(r'^[qQ*]\s*', '', after).strip()
                fina = 0
                pts_m = re.match(r'(\d+)', after)
                if pts_m:
                    val = int(pts_m.group(1))
                    if 1 <= val <= 1200:
                        fina = val

                display = f'{team} {letter}'.strip()
                event.results.append(ParsedResult(
                    swimmer_name=display,
                    time_text=time_text,
                    time_centiseconds=time_cs,
                    event_name=event.event_name,
                    event_distance=event.distance,
                    event_stroke=event.stroke,
                    gender=event.gender,
                    rank=rank,
                    club=team,
                    fina_points=fina,
                    round_type=event.round_type,
                    age_group=event.age_group,
                ))
                return True

    # Leg swimmers: "1) Ghassan, Zein 12 2) Mohamad, Chahrour 13"
    if RELAY_SWIMMER_MARK.search(line) and event.results:
        result = event.results[-1]
        if not hasattr(result, '_relay_names'):
            result._relay_names = []
        for pm in RELAY_SWIMMER_PART.finditer(line):
            raw = pm.group(2).strip()
            # Strip trailing age
            raw = re.sub(r'\s+\d{1,2}$', '', raw).strip()
            name = normalize_name(raw, comma_order=comma_order)
            if name:
                result._relay_names.append(name)
        # Until (unless) a splits line arrives, record names alone
        result.split_times = list(result._relay_names)
        return True

    return False


def _attach_relay_splits(result, line):
    """Pair a relay splits line ("29.93 32.67 29.35 28.93") with leg swimmers."""
    times = TIME_PATTERN.findall(line)
    names = getattr(result, '_relay_names', [])
    if names:
        result.split_times = [
            f'{name} {times[i]}' if i < len(times) else name
            for i, name in enumerate(names)
        ]
    else:
        result.split_times.extend(times)


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


def _parse_result_line(line, event, comma_order='last_first', take_last_time=False):
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

    When take_last_time is True (column header has two time columns like
    "Prelim Time Finals Time" or "Seed Time Prelim Time"), the last time
    on the line is the actual swim time for the current round.
    """
    # A DQ/NS row with a seed time must never be read as a timed result
    if STATUS_TAIL.search(line):
        return None

    # Must have a time somewhere in the line
    times = list(TIME_PATTERN.finditer(line))
    if not times:
        return None
    time_match = times[-1] if (take_last_time and len(times) >= 2) else times[0]

    time_text = time_match.group(1)
    time_cs = parse_time_to_centiseconds(time_text)
    if time_cs <= 0:
        return None

    # The name section always ends at the FIRST time on the line
    before_time = line[:times[0].start()].strip()
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

    # Fix PDF-extraction shifted spaces gluing the age to the name's last letter:
    # "Shahzadehhamzeh, Amiryousse f14 AST" -> "Shahzadehhamzeh, Amiryoussef 14 AST"
    before_time = re.sub(r'(\w)\s+([a-z])(\d{1,2})\b', r'\1\2 \3', before_time)

    # Now before_time should be: "Name, First Age Team" or "Name First Age Team"
    # Work backwards: split into tokens
    tokens = before_time.split()
    if len(tokens) < 3:
        return None

    # Find age and team by scanning for the age token (1-2 digit number
    # between 5 and 99). Everything before the age is part of the name;
    # everything after the age is the team/country name (may be multi-word
    # like "Hong Kong China" or "Kingdom oF Saudi Arabia").
    team = ''
    age = 0
    name_end_idx = len(tokens)

    # Scan from LEFT to RIGHT for the first standalone age digit that
    # appears AFTER at least one name token (to skip rank remnants).
    # In HyTek, the order is always: Name Age Team.
    for i in range(1, len(tokens)):
        if re.match(r'^\d{1,2}$', tokens[i]):
            possible_age = int(tokens[i])
            if 5 <= possible_age <= 99:
                age = possible_age
                name_end_idx = i
                # Everything after the age is the team name
                if i + 1 < len(tokens):
                    team = ' '.join(tokens[i + 1:])
                break

    if age == 0 and name_end_idx == len(tokens) and len(tokens) >= 3:
        # No age on the line at all. Don't let the team code get swallowed
        # into the name: strip a trailing token that looks like a team code
        # (dashed like "NSSC-LB", or short ALL-CAPS/alnum like "ORTH", "4B")
        # as long as a comma confirms the name is already complete.
        last = tokens[-1]
        looks_dashed = re.match(r'^[A-Za-z0-9]+-[A-Za-z0-9]+$', last)
        looks_code = re.match(r'^[A-Z0-9]{2,6}$', last) and ',' in before_time
        if looks_dashed or looks_code:
            team = last
            name_end_idx = len(tokens) - 1

    if name_end_idx <= 0:
        return None

    # Reconstruct name from remaining tokens
    name_raw = ' '.join(tokens[:name_end_idx])
    # Strip ID numbers (Jordan format: "Karim 10011446 SINUKROT" or "10011446 Sinukrot, Karim")
    name_raw = re.sub(r'\b\d{7,10}\b', '', name_raw).strip()
    name_raw = re.sub(r'\s+', ' ', name_raw)
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
