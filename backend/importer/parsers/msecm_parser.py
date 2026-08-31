"""
Parser for MSECM® WEK 6 PDF format (Austrian/Central European swim meets).

Format characteristics:
  - Created by "MSECM® WEK 6", footer has "www.msecm.at" / "myResults.eu"
  - Page header: "Results DD.MM.YYYY - Session N"
  - Meet header: "Walter Bär Memorial Meeting '26 - Vienna"
  - Date range: "30.04.-03.05.2026"
  - Event headers: "Event N - 400m Ind. Medley Women Preliminary"
  - Continue headers: "Continue Event N - ..."
  - Age categories within events: "Open, Limit: 05:45,08" / "Junior, Limit: ..." / "AK16, Limit: ..."
  - Result lines: "1. Stanescu, Enya     2008 AUT ESV St. Pölten     04:57,35   Q   702"
  - Names: "Last, First" order
  - Times use commas as decimal separator: "04:57,35"
  - Split lines: "RT +0.71 50m: 00:30,60, 100m: 01:06,10 (00:35,50), ..."
  - DQ lines: name + status, followed by reason line with SW code
  - DNS lines: name + "DNS", often followed by "Cancelled."
  - Separator: "----" before DQ/DNS blocks
  - FINA/WA points in rightmost column
  - Qualification codes: Q, MT, DQ, DNS
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, detect_gender,
    normalize_event_name, extract_distance, is_relay_event,
    merge_duplicate_events,
)

# Event header: "Event 1 - 400m Ind. Medley Women Preliminary"
# Also: "Continue Event 1 - 400m Ind. Medley Women Preliminary"
EVENT_HEADER = re.compile(
    r'^(?:Continue\s+)?Event\s+\d+\s*-\s*'
    r'(\d+(?:\s*x\s*\d+)?)\s*m\s+'    # distance: "400m", "4 x 100m"
    r'(.+?)\s+'                         # stroke: "Ind. Medley", "Freestyle", etc.
    r'(Women|Men|Mixed)\s*'             # gender
    r'(.*?)$',                          # round: "Preliminary", "A-Final", "B-Final", "Final", ""
    re.IGNORECASE
)

# Age category header: "Open, Limit: 05:45,08" or "AK16, Limit: 05:51,60" or "Junior, Limit: 05:49,99"
AGE_CATEGORY = re.compile(
    r'^(Open|Junior|AK\d{2})\s*,?\s*Limit:\s*[\d:,]+',
    re.IGNORECASE
)

# Result line: "1. Stanescu, Enya     2008 AUT ESV St. Pölten     04:57,35   Q   702"
# Also handles multi-digit ranks: "52. Kucka, Martin ..."
# Name is "Last, First" with possible middle names/particles
RESULT_LINE = re.compile(
    r'^(\d{1,3})\.\s+'                         # rank + dot
    r'(.+?)\s+'                                 # name (Last, First)
    r'(\d{4})\s+'                               # birth year
    r'([A-Z]{2,3})\s+'                          # nationality code
    r'(.+?)\s+'                                 # club
    r'(\d{1,2}:\d{2},\d{2}|\d{2},\d{2})\s*'    # time with comma decimal
    r'(.*)$'                                    # remainder: qualification + points
)

# MUSZ result line: "1. 4/4 TÖRÖK Dominik Márk 2002 BVSC-Zugló 02:03.38 788"
# Also: "6. 5/0 MAX Halbeisen 2003 AUT Österreichischer Swhwimmverband 02:04.08 +00.70 775"
MUSZ_RESULT_LINE = re.compile(
    r'^(\d{1,3})\.\s+'                         # rank
    r'\d+\s*/\s*\d+\s+'                        # lane (e.g. "4/4")
    r'(.+?)\s+'                                 # name (SURNAME Given)
    r'(\d{4})\s+'                               # birth year
    r'(?:([A-Z]{2,3})\s+)?'                    # optional nationality code (for foreigners)
    r'(.+?)\s+'                                 # club
    r'(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})\s*'  # time with dot decimal
    r'(.*)$'                                    # remainder: gap + points
)

# DQ/DNS line (no rank, no dot): "Kainz, Leona     2008 AUT SV-Simmering     DQ"
DQ_DNS_LINE = re.compile(
    r'^([A-ZÀ-Þa-zà-ÿ].+?)\s+'                # name
    r'(\d{4})\s+'                               # birth year
    r'([A-Z]{2,3})\s+'                          # nationality
    r'(.+?)\s+'                                 # club
    r'(DQ|DNS|DNF|DSQ)\b',                      # status
    re.IGNORECASE
)

# Split line: starts with "RT" or a distance marker or "R.Idő" (MUSZ)
SPLIT_LINE = re.compile(r'^(?:RT\s|R\.Id[őo]\s|(?:\d+m\s*:))')

# Session date from page header: "Results 30.04.2026 - Session 1"
SESSION_DATE = re.compile(r'Results?\s+(\d{2})\.(\d{2})\.(\d{4})\s*-\s*Session\s+(\d+)')

# Meet date range: "30.04.-03.05.2026" or "30.04.2026"
DATE_RANGE = re.compile(
    r'(\d{2})\.(\d{2})\.'                       # start DD.MM.
    r'(?:-?(\d{2})\.(\d{2})\.)?'                # optional end DD.MM. (with or without dash)
    r'(\d{4})'                                  # year
)

# MUSZ event title: "Men's 200m Medley" or "Women's 100m Freestyle"
MUSZ_EVENT_TITLE = re.compile(
    r"^(Women's|Men's|Mixed)\s+"
    r"(\d+(?:\s*x\s*\d+)?)\s*m\s+"
    r"(.+?)$",
    re.IGNORECASE
)

# MUSZ date: "2024. 04. 09., 9:00:00 (S1)"
MUSZ_DATE = re.compile(r'(\d{4})\.\s*(\d{2})\.\s*(\d{2})')

# Stroke mapping for MSECM format
STROKE_MAP = {
    'freestyle': 'Freestyle',
    'backstroke': 'Backstroke',
    'breaststroke': 'Breaststroke',
    'butterfly': 'Butterfly',
    'ind. medley': 'Individual Medley',
    'individual medley': 'Individual Medley',
    'medley': 'Individual Medley',
}


def detect_format(text):
    """Check if this text is MSECM or MUSZ (Hungarian) format."""
    lower = text.lower()
    if 'msecm' in lower or 'myresults.eu' in lower or 'www.msecm.at' in lower:
        return True
    if 'event ' in lower and 'preliminary' in lower and 'limit:' in lower:
        return True
    if 'live.musz.hu' in lower or 'musz.hu' in lower:
        return True
    # MUSZ detection: Hungarian meet format with "RESULTS" + "R.Idő" + "RNK Lane"
    if ('results summary' in lower or ('results' in lower and 'rnk' in lower)) \
            and 'r.id' in lower:
        return True
    return False


def _parse_msecm_stroke(text):
    """Convert MSECM stroke name to standard English."""
    t = text.strip().lower()
    for key, val in STROKE_MAP.items():
        if key in t:
            return val
    return normalize_stroke(text)


def _parse_round(text):
    """Convert MSECM round label to standard."""
    t = text.strip().lower()
    if not t:
        return 'Finals'  # timed final (800/1500)
    if 'preliminary' in t or 'prelim' in t:
        return 'Prelims'
    if 'a-final' in t or 'a final' in t:
        return 'Finals'
    if 'b-final' in t or 'b final' in t:
        return 'Consolation'
    if 'c-final' in t or 'c final' in t:
        return 'Final C'
    if 'd-final' in t or 'd final' in t:
        return 'Final D'
    if 'swim-off' in t or 'swim off' in t:
        return 'Swim-off'
    if 'final' in t:
        return 'Finals'
    return ''


def _fix_comma_time(time_str):
    """Convert comma-decimal time to dot-decimal: '04:57,35' → '04:57.35'."""
    return time_str.replace(',', '.')


def _reorder_name(name):
    """Convert 'Last, First' to 'First LAST'.

    MSECM lists names as "Stanescu, Enya" → "Enya STANESCU".
    Handles compound surnames: "Riis, Christiane Dreyer" → "Christiane Dreyer RIIS".
    """
    if ',' not in name:
        # No comma — try to detect: if first token is all-caps, it's the surname
        tokens = name.split()
        if tokens and tokens[0] == tokens[0].upper() and len(tokens) > 1:
            return ' '.join(tokens[1:]) + ' ' + tokens[0]
        return name

    parts = name.split(',', 1)
    surname = parts[0].strip()
    given = parts[1].strip()
    if not given:
        return surname.upper()
    return f'{given} {surname.upper()}'


def _reorder_musz_name(name):
    """Convert 'TÖRÖK Dominik Márk' to 'Dominik Márk TÖRÖK'.

    MUSZ lists SURNAME (all caps) first, then given name(s) in title case.
    """
    tokens = name.split()
    i = 0
    while i < len(tokens) and tokens[i] == tokens[i].upper() and any(c.isalpha() for c in tokens[i]):
        i += 1
    if 0 < i < len(tokens):
        return ' '.join(tokens[i:]) + ' ' + ' '.join(tokens[:i])
    return name


def _parse_musz_split_line(line):
    """Extract split times from MUSZ split line.
    'R.Idő 00.65 50m 25.81 100m 57.32 150m 01:32.81 200m 02:03.38'
    """
    splits = []
    for m in re.finditer(r'(\d+)m\s+(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})', line):
        splits.append(f"{m.group(1)}m: {m.group(2)}")
    return splits


def _parse_split_line(line):
    """Extract split times from an MSECM split line."""
    splits = []
    # Match patterns like "50m: 00:30,60" or "100m: 01:06,10"
    for m in re.finditer(r'(\d+)m\s*:\s*(\d{2}:\d{2},\d{2})', line):
        time_fixed = _fix_comma_time(m.group(2))
        splits.append(f"{m.group(1)}m: {time_fixed}")
    return splits


def parse(text):
    """Parse MSECM PDF text into a ParsedMeet."""
    lines = text.split('\n')
    is_musz = 'musz.hu' in text.lower() or 'r.idő' in text.lower()
    meet = ParsedMeet(source_format='musz' if is_musz else 'msecm')

    # MUSZ: extract date from "2024. 04. 09., 9:00:00 (S1)"
    if is_musz:
        all_dates = set()
        for line in lines:
            for mdm in MUSZ_DATE.finditer(line.strip()):
                d = f'{mdm.group(1)}-{mdm.group(2)}-{mdm.group(3)}'
                # Only add dates within a reasonable range (not record dates from 2003 etc.)
                year = int(mdm.group(1))
                if year >= 2020:
                    all_dates.add(d)
        if all_dates:
            sorted_dates = sorted(all_dates)
            meet.date_text = sorted_dates[0]
            if len(sorted_dates) > 1:
                meet.date_end = sorted_dates[-1]

        # Meet name from first line
        for line in lines[:5]:
            l = line.strip()
            if l and len(l) > 5 and 'swimming' not in l.lower() and 'results' not in l.lower():
                meet.meet_name = l
                break
        # Location from second line
        for line in lines[1:5]:
            l = line.strip()
            if l and len(l) > 2 and l != meet.meet_name and not MUSZ_DATE.search(l):
                meet.location = l
                break

    # Extract meet name and date from early lines
    for line in lines[:100]:
        line = line.strip()
        if not line:
            continue

        # Date range: "30.04.-03.05.2026"
        dm = DATE_RANGE.search(line)
        if dm:
            day1, mon1 = int(dm.group(1)), int(dm.group(2))
            year = int(dm.group(5))
            has_end = dm.group(3) and dm.group(4)
            # Prefer a match with end date over one without
            if not meet.date_text or (has_end and not getattr(meet, 'date_end', '')):
                meet.date_text = f'{year}-{mon1:02d}-{day1:02d}'
                if has_end:
                    day2, mon2 = int(dm.group(3)), int(dm.group(4))
                    meet.date_end = f'{year}-{mon2:02d}-{day2:02d}'

        # Meet name: look for substantial title lines (not page headers, not footers)
        if (not meet.meet_name and len(line) > 15 and
                'results' not in line.lower() and 'page' not in line.lower() and
                'created by' not in line.lower() and 'msecm' not in line.lower() and
                'www.' not in line.lower() and 'judges' not in line.lower() and
                'session' not in line.lower()):
            # Skip if it's the date range line
            if not DATE_RANGE.match(line):
                meet.meet_name = line
                # Extract location from title like "... - Vienna"
                loc = re.search(r'-\s*([A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)*)\s*$', line)
                if loc:
                    meet.location = loc.group(1).strip()

    # Pool: MSECM always states "50m" or "25m" in judges section
    text_lower = text.lower()
    if '50m' in text_lower[:2000] or '50 m' in text_lower[:2000]:
        meet.pool = 'LCM'
    elif '25m' in text_lower[:2000] or '25 m' in text_lower[:2000]:
        meet.pool = 'SCM'

    current_event = None
    current_category = ''
    last_result = None
    current_session_date = ''

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        # Skip headers, footers
        if (line.startswith('Created by') or line.startswith('Page ') or
                'www.msecm.at' in line or 'myResults.eu' in line or
                'myresults.eu' in line.lower() or
                line.startswith('SPORT EVENTS') or
                line.startswith('CONSULTING')):
            continue

        # Extract session date from page header
        sdm = SESSION_DATE.search(line)
        if sdm:
            day, mon, year = int(sdm.group(1)), int(sdm.group(2)), int(sdm.group(3))
            current_session_date = f'{year}-{mon:02d}-{day:02d}'
            continue

        # Check for event header
        em = EVENT_HEADER.match(line)
        if em:
            distance_text = em.group(1)
            stroke_text = em.group(2)
            gender_text = em.group(3)
            round_text = em.group(4).strip()

            # Handle "Continue Event" — don't create new event
            if line.lower().startswith('continue'):
                continue

            is_relay = 'x' in distance_text.lower()
            try:
                if is_relay:
                    # "4 x 100m" → total distance
                    parts = re.split(r'[xX×]', distance_text)
                    distance = int(parts[0].strip()) * int(parts[1].strip())
                else:
                    distance = int(re.sub(r'[^\d]', '', distance_text))
            except (ValueError, IndexError):
                distance = extract_distance(distance_text + 'm ' + stroke_text)

            stroke = _parse_msecm_stroke(stroke_text)
            gender = 'F' if 'women' in gender_text.lower() else (
                'X' if 'mixed' in gender_text.lower() else 'M'
            )
            round_type = _parse_round(round_text)
            event_name = normalize_event_name(distance, stroke, is_relay)

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=round_type,
                date_text=current_session_date,
            )
            meet.events.append(current_event)
            current_category = ''
            last_result = None
            continue

        # Check for age category header
        acm = AGE_CATEGORY.match(line)
        if acm:
            current_category = acm.group(1)
            continue

        # Check for separator line (before DQ/DNS)
        if line.startswith('----'):
            continue

        # MUSZ: track per-page date from "2024. 04. 09., 9:00:00 (S1)"
        if is_musz:
            mdm = MUSZ_DATE.search(line)
            if mdm:
                year = int(mdm.group(1))
                if year >= 2020:
                    current_session_date = f'{mdm.group(1)}-{mdm.group(2)}-{mdm.group(3)}'

        # MUSZ round headers: "A Final", "B Final", "Preliminaries", "Results Summary"
        if is_musz:
            l_stripped = line.lower().strip()
            if l_stripped == 'a final':
                if current_event:
                    current_event.round_type = 'Finals'
                continue
            elif l_stripped == 'b final':
                # B Final = new event entry (different round)
                if current_event:
                    current_event = ParsedEvent(
                        event_name=current_event.event_name,
                        distance=current_event.distance,
                        stroke=current_event.stroke,
                        gender=current_event.gender,
                        round_type='Consolation',
                        date_text=current_session_date or current_event.date_text,
                    )
                    meet.events.append(current_event)
                    last_result = None
                continue
            elif l_stripped in ('preliminaries', 'heats'):
                if current_event:
                    current_event.round_type = 'Prelims'
                continue

        # MUSZ event title: "Men's 200m Medley" (appears in page header)
        if is_musz:
            mtm = MUSZ_EVENT_TITLE.match(line)
            if mtm and 'Record' not in line and 'RESULTS' not in line:
                gender_text = mtm.group(1)
                distance_text = mtm.group(2)
                stroke_text = mtm.group(3).strip()
                # Strip age records that appear on the same line
                stroke_text = re.sub(r'\s+\d{1,2}\s+\d{2}:\d{2}\.\d{2}\s+.*$', '', stroke_text)
                stroke_text = re.sub(r'\s+\d{1,2}\s+\d{2}\.\d{2}\s+.*$', '', stroke_text)

                gender = 'F' if 'women' in gender_text.lower() else (
                    'X' if 'mixed' in gender_text.lower() else 'M')
                is_relay = 'x' in distance_text.lower()
                try:
                    if is_relay:
                        parts = re.split(r'[xX×]', distance_text)
                        distance = int(parts[0].strip()) * int(parts[1].strip())
                    else:
                        distance = int(re.sub(r'[^\d]', '', distance_text))
                except (ValueError, IndexError):
                    distance = 0

                stroke = _parse_msecm_stroke(stroke_text)
                event_name = normalize_event_name(distance, stroke, is_relay)

                # Only create new event if this is actually a new event
                if not current_event or current_event.event_name != event_name or current_event.gender != gender:
                    current_event = ParsedEvent(
                        event_name=event_name,
                        distance=distance,
                        stroke=stroke,
                        gender=gender,
                        round_type='Finals',  # MUSZ results summaries are finals
                        date_text=current_session_date or meet.date_text,
                    )
                    meet.events.append(current_event)
                    current_category = ''
                    last_result = None
                continue

        # Check for split line
        if SPLIT_LINE.match(line) and last_result:
            if is_musz:
                splits = _parse_musz_split_line(line)
            else:
                splits = _parse_split_line(line)
            last_result.split_times.extend(splits)
            continue

        # Skip DQ reason lines (start with time + "SW")
        if re.match(r'^\d{2}:\d{2}\s+SW\s', line):
            continue
        # Skip "Cancelled." lines
        if line.strip().lower() == 'cancelled.':
            continue

        if not current_event:
            continue

        # Check for result line
        rm = RESULT_LINE.match(line)
        if rm:
            rank = int(rm.group(1))
            name_raw = rm.group(2).strip()
            birth_year = int(rm.group(3))
            nat_code = rm.group(4)
            club = rm.group(5).strip()
            time_raw = rm.group(6).strip()
            remainder = rm.group(7).strip()

            name = _reorder_name(name_raw)
            time_text = _fix_comma_time(time_raw)
            time_cs = parse_time_to_centiseconds(time_text)

            # Parse qualification and FINA points from remainder
            fina_points = 0
            pts_m = re.search(r'(\d{3,4})\s*$', remainder)
            if pts_m:
                fina_points = int(pts_m.group(1))

            result = ParsedResult(
                swimmer_name=name,
                time_text=time_text,
                time_centiseconds=time_cs,
                rank=rank,
                birth_year=birth_year,
                nationality_code=nat_code,
                club=club,
                fina_points=fina_points,
                gender=current_event.gender,
                round_type=current_event.round_type,
                age_group=current_category,
                status='OK',
            )
            current_event.results.append(result)
            last_result = result
            continue

        # MUSZ result line
        if is_musz and current_event:
            mrm = MUSZ_RESULT_LINE.match(line)
            if mrm:
                rank = int(mrm.group(1))
                name_raw = mrm.group(2).strip()
                birth_year = int(mrm.group(3))
                nat_code = mrm.group(4) or 'HUN'  # default to HUN for domestic swimmers
                club = mrm.group(5).strip()
                time_text = mrm.group(6)
                remainder = mrm.group(7).strip()

                name = _reorder_musz_name(name_raw)
                time_cs = parse_time_to_centiseconds(time_text)

                fina_points = 0
                pts_m = re.search(r'(\d{3,4})\s*$', remainder)
                if pts_m:
                    fina_points = int(pts_m.group(1))

                result = ParsedResult(
                    swimmer_name=name,
                    time_text=time_text,
                    time_centiseconds=time_cs,
                    rank=rank,
                    birth_year=birth_year,
                    nationality_code=nat_code,
                    club=club,
                    fina_points=fina_points,
                    gender=current_event.gender,
                    round_type=current_event.round_type,
                    age_group=current_category,
                    status='OK',
                )
                current_event.results.append(result)
                last_result = result
                continue

        # Check for DQ/DNS line
        dqm = DQ_DNS_LINE.match(line)
        if dqm:
            name_raw = dqm.group(1).strip()
            birth_year = int(dqm.group(2))
            nat_code = dqm.group(3)
            club = dqm.group(4).strip()
            status_raw = dqm.group(5).upper()

            name = _reorder_name(name_raw)
            status = 'DQ' if status_raw in ('DQ', 'DSQ') else (
                'DNS' if status_raw == 'DNS' else 'DNF'
            )

            result = ParsedResult(
                swimmer_name=name,
                time_text='',
                time_centiseconds=0,
                rank=0,
                birth_year=birth_year,
                nationality_code=nat_code,
                club=club,
                gender=current_event.gender,
                round_type=current_event.round_type,
                age_group=current_category,
                status=status,
            )
            current_event.results.append(result)
            last_result = result
            continue

    # Remove events with no results
    meet.events = [e for e in meet.events if e.results]

    # Merge duplicate events (same event name + round + gender)
    merge_duplicate_events(meet)

    # Deduplicate results: MSECM lists swimmers in both "Open" and their
    # age category (e.g., "Junior", "AK16"). After merging, keep only the
    # age-specific entry (which carries more info) and drop the "Open" duplicate.
    for event in meet.events:
        seen = {}  # (swimmer_name, time_text) → result
        deduped = []
        for r in event.results:
            key = (r.swimmer_name, r.time_text, r.status)
            if key in seen:
                # Keep the one with a more specific age_group (non-Open)
                existing = seen[key]
                if r.age_group and r.age_group.lower() != 'open' and (
                        not existing.age_group or existing.age_group.lower() == 'open'):
                    # Replace existing with more specific
                    deduped = [r if x is existing else x for x in deduped]
                    seen[key] = r
                # Otherwise keep existing (skip this duplicate)
                continue
            seen[key] = r
            deduped.append(r)
        event.results = deduped

    return meet
