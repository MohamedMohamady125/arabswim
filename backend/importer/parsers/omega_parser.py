"""
Parser for Omega / Swiss Timing PDF format.
Used by: GCC championships, Olympic-style events, FINA competitions.
Identified by: "Results Summary" + event headers like "Men's 200m Freestyle Final".

Format:
  Event header: "Men's 1500m Freestyle Final"
  Column header (multi-line):
    "Rank Heat Lane Name  Year of Birth  NOC Code  Reaction Time  Time  Time Behind"
  Individual result: "1 2 5 ABDULRAZZAQ Waleed 1998 KUW .770 23.26"
  Relay team:  "1 5 KUW -Kuwait 7:52.94"
  Relay leg:   "ALSHAMROUKH Sauod 27.07 56.48 1:26.97 1:57.20 (2) 1:57.20"
  Split lines: "50 m. 28.50 100 m. 1:02.95 ..."
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke,
    normalize_name, normalize_event_name, merge_duplicate_events,
)

# Event header: "Men's 1500m Freestyle Final" or "Men's 4 x 100m Freestyle Relay Final"
EVENT_HEADER = re.compile(
    r"(Men|Women)'?s\s+"
    r"(?:(\d+)\s*x\s*)?(\d+)m\s+"
    r"(.+?)(?:\s*-\s*|\s+)(Final|Semi|Heat|Prelim)\w*",
    re.IGNORECASE,
)

# Individual result: rank [heat] [lane] NAME [birth_year] NOC [reaction] time(s) [behind]
# Name is "LASTNAME Firstname" — uppercase last name, then mixed-case first name.
# NOC is 3 uppercase letters. Birth year is 4 digits. Reaction is .NNN.
# Lines may have inline splits before the time and/or "time behind" after it;
# we capture the prefix (rank/name/birth/NOC) and take the MAX time after NOC
# (splits are cumulative so always ≤ final; time-behind is a delta so always <).
INDIVIDUAL_PREFIX = re.compile(
    r'^\s*(\d{1,3})\s+'           # rank
    r'(?:\d{1,2}\s+)?'            # optional heat number
    r'(?:\d{1,2}\s+)?'            # optional lane number
    r'([A-Z][A-Z\- ]+\s+\w[\w\- ]*?)\s+'  # name
    r'(?:(\d{4})\s+)?'            # optional birth year
    r'([A-Z]{3})\b'               # NOC code
)
# All time-like values on a line (split times + final time)
_TIME_RE = re.compile(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2})')

# Relay team: "1 5 KUW -Kuwait 7:52.94"
RELAY_TEAM = re.compile(
    r'^\s*(\d{1,2})\s+'           # rank
    r'(?:\d{1,2}\s+)?'            # optional lane
    r'([A-Z]{3})\s+'              # NOC code
    r'-[A-Za-z ]+\s+'             # "-CountryName"
    r'(\d{1,2}:?\d{2}\.\d{2})'   # time
)

# Relay leg swimmer: "ALSHAMROUKH Sauod 27.07 56.48 1:26.97 1:57.20 (2) 1:57.20"
# or "ABDULRAZZAQ Waleed .740 26.91 56.92 1:28.18 1:57.29 (1) 5:51.75"
RELAY_LEG = re.compile(
    r'^\s*([A-Z][A-Z\- ]+\s+\w[\w\- ]*?)\s+'  # name
    r'(?:\.\d{3}\s+)?'                         # optional reaction time
    r'[\d:.]'                                  # starts with a split time
)

# Split lines to skip: "50 m. 28.77 100 m. 1:01.63 ..."
SPLIT_LINE = re.compile(r'^\s*\d+\s*m\.\s')

# Standalone time at end of result (total time echo): "16:43.20"
ECHO_TIME = re.compile(r'^\s*\d{1,2}:?\d{2}\.\d{2}\s*$')

# Lines to skip
SKIP_LINE = re.compile(
    r'(?:Medal Standing|Legend:|SWM|Page \d|^\s*$|'
    r'As of |Event No\.|Results|Rank |Birth |Time Behind|'
    r'Year of|NOC|Reaction|^\s*\d{2}\.\d{2}\s)',
    re.IGNORECASE,
)


def detect_format(text):
    """Check if text looks like Omega/Swiss Timing format."""
    has_results_summary = 'Results Summary' in text or 'Results\n' in text
    has_event = bool(EVENT_HEADER.search(text))
    has_noc = bool(re.search(r'\b[A-Z]{3}\s+\.\d{3}\s+\d', text))
    return has_event and (has_results_summary or has_noc)


def parse(text):
    """Parse Omega/Swiss Timing format text into ParsedMeet."""
    lines = text.split('\n')
    meet = ParsedMeet(source_format='omega')

    # Extract meet name from first non-empty lines
    for line in lines[:5]:
        line = line.strip()
        if line and not SKIP_LINE.search(line):
            meet.meet_name = line
            break

    # Extract date from "As of DAY DD MON YYYY" pattern
    date_match = re.search(
        r'As of \w+\s+(\d{1,2})\s+(\w+)\s+(\d{4})', text)
    if date_match:
        day = int(date_match.group(1))
        month_name = date_match.group(2).upper()[:3]
        year = int(date_match.group(3))
        months = {
            'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
            'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12,
        }
        month = months.get(month_name, 1)
        meet.date_text = f'{year:04d}-{month:02d}-{day:02d}'

    # Find the earliest and latest dates for start/end
    all_dates = set()
    for dm in re.finditer(r'As of \w+\s+(\d{1,2})\s+(\w+)\s+(\d{4})', text):
        d, mn, y = int(dm.group(1)), dm.group(2).upper()[:3], int(dm.group(3))
        months = {
            'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
            'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12,
        }
        mo = months.get(mn, 1)
        all_dates.add(f'{y:04d}-{mo:02d}-{d:02d}')
    if all_dates:
        sorted_dates = sorted(all_dates)
        meet.date_text = sorted_dates[0]
        if len(sorted_dates) > 1:
            meet.date_end = sorted_dates[-1]

    current_event = None
    in_relay = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Event header
        em = EVENT_HEADER.search(stripped)
        if em:
            gender_raw = em.group(1)
            legs = em.group(2)  # None for individual, "4" for relay
            distance = int(em.group(3))
            stroke_raw = em.group(4)
            round_raw = em.group(5)

            gender = 'M' if gender_raw.upper() == 'MEN' else 'F'
            in_relay = legs is not None or 'relay' in stroke_raw.lower()

            if in_relay and legs:
                total_distance = int(legs) * distance
                stroke = normalize_stroke(
                    stroke_raw.replace('Relay', '').strip())
                event_name = normalize_event_name(
                    total_distance, stroke, is_relay=True)
            else:
                stroke = normalize_stroke(stroke_raw)
                event_name = normalize_event_name(distance, stroke)

            round_type = 'Finals'
            if round_raw.upper().startswith('SEMI'):
                round_type = 'Semis'
            elif round_raw.upper().startswith(('HEAT', 'PRELIM')):
                round_type = 'Heats'

            current_event = ParsedEvent(
                event_name=event_name,
                distance=int(legs) * distance if in_relay and legs else distance,
                stroke=stroke,
                gender=gender,
                round_type=round_type,
            )
            meet.events.append(current_event)
            continue

        if current_event is None:
            continue

        # Skip split lines, echo times, metadata
        if SPLIT_LINE.match(stripped) or ECHO_TIME.match(stripped):
            continue
        if SKIP_LINE.match(stripped):
            continue
        # Skip bare split-difference lines: "32.86 32.01 32.74 ..."
        if re.match(r'^\s*\d{2}\.\d{2}(\s+\d{2}\.\d{2})*\s*$', stripped):
            continue

        if in_relay:
            # Relay team line
            rm = RELAY_TEAM.match(stripped)
            if rm:
                rank = int(rm.group(1))
                noc = rm.group(2)
                time_text = rm.group(3)
                time_cs = parse_time_to_centiseconds(time_text)
                current_event.results.append(ParsedResult(
                    swimmer_name=f'{noc} A',
                    time_text=time_text,
                    time_centiseconds=time_cs,
                    event_name=current_event.event_name,
                    event_distance=current_event.distance,
                    event_stroke=current_event.stroke,
                    gender=current_event.gender,
                    rank=rank,
                    nationality_code=noc,
                    round_type=current_event.round_type,
                    age_group=current_event.age_group,
                ))
                continue

            # Relay leg swimmer — attach to last result
            lm = RELAY_LEG.match(stripped)
            if lm and current_event.results:
                name = normalize_name(lm.group(1).strip())
                if name:
                    result = current_event.results[-1]
                    if not hasattr(result, '_relay_names'):
                        result._relay_names = []
                    result._relay_names.append(name)
                    result.split_times = list(result._relay_names)
                continue
        else:
            # Individual result — match prefix then grab first real time after NOC
            im = INDIVIDUAL_PREFIX.match(stripped)
            if im:
                rank = int(im.group(1))
                name_raw = im.group(2).strip()
                birth_year = int(im.group(3)) if im.group(3) else 0
                noc = im.group(4)

                # Text after the NOC code contains optional reaction (.NNN),
                # optional splits, actual time, and optional time-behind.
                # The actual time is always the largest value (splits are
                # cumulative, time-behind is a delta).
                after_noc = stripped[im.end():]
                all_times = _TIME_RE.findall(after_noc)
                if not all_times:
                    continue
                time_text = max(all_times,
                                key=parse_time_to_centiseconds)
                time_cs = parse_time_to_centiseconds(time_text)

                name = normalize_name(name_raw)
                if not name:
                    continue

                current_event.results.append(ParsedResult(
                    swimmer_name=name,
                    time_text=time_text,
                    time_centiseconds=time_cs,
                    event_name=current_event.event_name,
                    event_distance=current_event.distance,
                    event_stroke=current_event.stroke,
                    gender=current_event.gender,
                    rank=rank,
                    birth_year=birth_year,
                    nationality_code=noc,
                    round_type=current_event.round_type,
                    age_group=current_event.age_group,
                ))
                continue

    meet = merge_duplicate_events(meet)
    return meet
