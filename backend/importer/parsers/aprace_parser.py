"""
Parser for AP Race / swimming.events PDF format.

Format characteristics:
  - Meet name: "AP RACE LONDON INTERNATIONAL 2026"
  - Page header: "AP RACE LONDON 2026 | DAY 1 | HEATS"
  - Event titles: "Women's 400m Freestyle" or "Men's 100m Butterfly - Super Final"
  - Category line: "Open"
  - Table: Pos | Name | Age | Club | Time | Improvement | AQUA
  - Club format: "GER - Germany", "USA - Nat Club SA"
  - Times: dot decimal "04:09.77" or "52.21"
  - DNS: "Did not compete"
  - DQ: "Disqualified"
  - AQUA points in last column
  - Round types in event name: Super Final, B Final, Junior Final, Para Final, Swim Off
  - Para classifications in name: "(S14)", "(S10)" etc.
  - Relay events: "Men's 4x100m Freestyle Relay - Super Final"
  - Generated: "Generated: DD/MM/YYYY HH:MM BST"
  - Footer: "AP Race London International 2026 https://swimming.events"
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_event_name, extract_distance,
    is_relay_event, merge_duplicate_events,
)

# Page header: "AP RACE LONDON 2026 | DAY 1 | HEATS"
PAGE_HEADER = re.compile(
    r'AP\s+RACE\s+\w+\s+\d{4}\s*\|\s*DAY\s+(\d+)\s*\|\s*(\w[\w\s]*)',
    re.IGNORECASE
)

# Event title: "Women's 400m Freestyle" or "Men's 100m Butterfly - Super Final"
EVENT_TITLE = re.compile(
    r"^(Women's|Men's|Mixed)\s+"
    r"(\d+(?:\s*x\s*\d+)?)\s*m\s+"     # distance
    r"(.+?)$",                           # stroke + optional round
    re.IGNORECASE
)

# Result line: "1 IsabelGose 24 GER-Germany 04:09.77 -2.83%(00:06.87) 824"
# Also: "1 Isabel Gose 24 GER - Germany 04:09.77 -2.83% (00:06.87) 824"
RESULT_LINE = re.compile(
    r'^(\d{1,3})\s+'                     # rank
    r'(.+?)\s+'                          # name (may be camelCase merged)
    r'(\d{1,2})\s+'                      # age
    r'([A-Z]{2,3})\s*-\s*'              # nationality code
    r'(.+?)\s+'                          # club (may be camelCase merged)
    r'(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})\s+'  # time
    r'.*?'                               # improvement (skip)
    r'(\d{3,4})\s*$'                     # AQUA points
)

# DNS line: "MadisonEmment 19 GBR-GuildfordCt Didnotcompete"
DNS_LINE = re.compile(
    r'^(.+?)\s+'
    r'(\d{1,2})\s+'
    r'([A-Z]{2,3})\s*-\s*'
    r'(.+?)\s+'
    r'Did\s*not\s*compete\s*$',
    re.IGNORECASE
)

# DQ line: "ZaraWilkins 18 GBR-Farnham Disqualified"
DQ_LINE = re.compile(
    r'^(.+?)\s+'
    r'(\d{1,2})\s+'
    r'([A-Z]{2,3})\s*-\s*'
    r'(.+?)\s+'
    r'Disqualified\s*$',
    re.IGNORECASE
)

# Generated date: "Generated: 25/05/2026 21:21 BST"
GENERATED_DATE = re.compile(r'Generated:\s+(\d{2})/(\d{2})/(\d{4})')

# Stroke mapping
STROKE_MAP = {
    'freestyle': 'Freestyle',
    'backstroke': 'Backstroke',
    'breaststroke': 'Breaststroke',
    'butterfly': 'Butterfly',
    'individual medley': 'Individual Medley',
    'medley relay': 'Medley',
    'freestyle relay': 'Freestyle',
}


def detect_format(text):
    """Check if this text is AP Race / swimming.events format."""
    lower = text.lower()
    return ('ap race' in lower and 'swimming.events' in lower) or (
        'ap race' in lower and '| day' in lower and 'aqua' in lower)


def _parse_stroke_and_round(text):
    """Split 'Butterfly - Super Final' into (stroke, round_type)."""
    # Check for round suffix
    round_patterns = [
        (r'\s*-\s*Super\s+Final\s+Swim\s+Off\s*$', 'Swim-off'),
        (r'\s*-\s*Super\s+Final\s*$', 'Finals'),
        (r'\s*-\s*B\s+Final\s*$', 'Consolation'),
        (r'\s*-\s*Junior\s+Final\s*$', 'Junior Final'),
        (r'\s*-\s*Para\s+Final\s*$', None),  # Skip para events
    ]
    round_type = ''
    stroke_text = text.strip()

    for pattern, rtype in round_patterns:
        m = re.search(pattern, stroke_text, re.IGNORECASE)
        if m:
            if rtype is None:
                return stroke_text, None, False  # signal to skip
            round_type = rtype
            stroke_text = stroke_text[:m.start()].strip()
            break

    # Handle relay
    is_relay = 'relay' in stroke_text.lower()
    if is_relay:
        stroke_text = re.sub(r'\s+relay\s*$', '', stroke_text, flags=re.IGNORECASE).strip()

    # Map stroke
    st = stroke_text.lower().strip()
    stroke = 'Freestyle'  # default
    for key, val in STROKE_MAP.items():
        if key in st:
            stroke = val
            break

    # If no round from suffix and it's heats context, will be set from page header
    return stroke, round_type, is_relay


def _clean_para_from_name(name):
    """Remove para classification markers from name: 'Poppy Maskill (S14)' → 'Poppy MASKILL'."""
    return re.sub(r'\s*\(S\d+\)\s*', ' ', name).strip()


def _split_camelcase(text):
    """Split 'IsabelGose' → 'Isabel Gose', 'LoughboroUn' → 'Loughboro Un'.

    AP Race PDFs often merge adjacent words by stripping the space character.
    Insert spaces at lowercase→uppercase boundaries.
    """
    return re.sub(r'([a-zà-ÿ])([A-ZÀ-Þ])', r'\1 \2', text)


def _format_name(name):
    """Convert 'IsabelGose' or 'Isabel Gose' to 'Isabel GOSE'.

    AP Race names are 'First Last' — make last token(s) uppercase.
    Handles camelCase-merged names from PDF extraction.
    """
    name = _clean_para_from_name(name)
    name = _split_camelcase(name)
    tokens = name.split()
    if len(tokens) < 2:
        return name.upper()
    return ' '.join(tokens[:-1]) + ' ' + tokens[-1].upper()


def parse(text):
    """Parse AP Race PDF text into a ParsedMeet."""
    lines = text.split('\n')
    meet = ParsedMeet(source_format='aprace')

    # Extract meet name
    for line in lines[:20]:
        if 'AP RACE' in line.upper() and 'INTERNATIONAL' in line.upper():
            meet.meet_name = line.strip()
            # Location from name: "AP RACE LONDON INTERNATIONAL 2026" → "London"
            m = re.search(r'AP\s+RACE\s+(\w+)\s+INTERNATIONAL', line, re.IGNORECASE)
            if m:
                meet.location = m.group(1).title()
            break

    if not meet.meet_name:
        for line in lines[:10]:
            if 'AP Race' in line:
                meet.meet_name = line.strip()
                break

    # Extract date from "Generated: DD/MM/YYYY"
    for line in lines:
        gm = GENERATED_DATE.search(line)
        if gm:
            day, mon, year = int(gm.group(1)), int(gm.group(2)), int(gm.group(3))
            meet.date_text = f'{year}-{mon:02d}-{day:02d}'
            break

    current_event = None
    current_day = 0
    current_stage = ''

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        # Skip footers and headers
        if ('swimming.events' in line or 'Generated:' in line or
                line.startswith('AP Race London') or
                line == 'Open' or line.startswith('Pos ') or
                'result sections' in line.lower()):
            continue

        # Page header: "AP RACE LONDON 2026 | DAY 1 | HEATS"
        pm = PAGE_HEADER.match(line)
        if pm:
            current_day = int(pm.group(1))
            stage = pm.group(2).strip().upper()
            if 'HEAT' in stage:
                current_stage = 'Prelims'
            elif 'FINAL' in stage:
                current_stage = 'Finals'
            elif 'SEMI' in stage:
                current_stage = 'Semifinals'
            continue

        # Day markers: "DAY 1", "DAY 2"
        if re.match(r'^DAY\s+\d+$', line, re.IGNORECASE):
            current_day = int(re.search(r'\d+', line).group())
            continue

        # Stage markers: "HEATS", "FINALS", "SEMI FINALS"
        if line.upper() in ('HEATS', 'FINALS', 'SEMI FINALS', 'SEMI-FINALS'):
            if 'HEAT' in line.upper():
                current_stage = 'Prelims'
            elif 'SEMI' in line.upper():
                current_stage = 'Semifinals'
            else:
                current_stage = 'Finals'
            continue

        # Event title
        em = EVENT_TITLE.match(line)
        if em:
            gender_text = em.group(1)
            distance_text = em.group(2)
            rest = em.group(3).strip()

            gender = 'F' if 'women' in gender_text.lower() else (
                'X' if 'mixed' in gender_text.lower() else 'M')

            stroke, round_type, is_relay = _parse_stroke_and_round(rest)

            # Para events — skip entirely
            if round_type is None:
                current_event = None
                continue

            # If no round from event title, use page-level stage
            if not round_type:
                round_type = current_stage or 'Prelims'

            try:
                if is_relay:
                    parts = re.split(r'[xX×]', distance_text)
                    distance = int(parts[0].strip()) * int(parts[1].strip())
                else:
                    distance = int(re.sub(r'[^\d]', '', distance_text))
            except (ValueError, IndexError):
                distance = extract_distance(distance_text + 'm ' + rest)

            # Guard against extraction artifacts: in some re-exported PDFs two
            # event titles collapse onto one line, producing a nonsensical
            # distance like "20100m" (200m + 100m merged) — usually a mangled
            # Para multiclass title. Individual pool events only ever use these
            # distances, so anything else is a phantom event; skip it.
            if not is_relay and distance not in (50, 100, 200, 400, 800, 1500):
                current_event = None
                continue

            event_name = normalize_event_name(distance, stroke, is_relay)

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=round_type,
            )
            meet.events.append(current_event)
            continue

        if not current_event:
            continue

        # Result line
        rm = RESULT_LINE.match(line)
        if rm:
            rank = int(rm.group(1))
            name_raw = rm.group(2).strip()
            age = int(rm.group(3))
            nat_code = rm.group(4)
            club = rm.group(5).strip()
            time_text = rm.group(6)
            fina_points = int(rm.group(7))

            name = _format_name(name_raw)
            club = _split_camelcase(club)
            time_cs = parse_time_to_centiseconds(time_text)

            result = ParsedResult(
                swimmer_name=name,
                time_text=time_text,
                time_centiseconds=time_cs,
                rank=rank,
                age=age,
                nationality_code=nat_code,
                club=club,
                fina_points=fina_points,
                gender=current_event.gender,
                round_type=current_event.round_type,
                status='OK',
            )
            current_event.results.append(result)
            continue

        # DNS line
        dm = DNS_LINE.match(line)
        if dm:
            name = _format_name(dm.group(1).strip())
            result = ParsedResult(
                swimmer_name=name,
                time_text='',
                time_centiseconds=0,
                rank=0,
                age=int(dm.group(2)),
                nationality_code=dm.group(3),
                club=_split_camelcase(dm.group(4).strip()),
                gender=current_event.gender,
                round_type=current_event.round_type,
                status='DNS',
            )
            current_event.results.append(result)
            continue

        # DQ line
        dqm = DQ_LINE.match(line)
        if dqm:
            name = _format_name(dqm.group(1).strip())
            result = ParsedResult(
                swimmer_name=name,
                time_text='',
                time_centiseconds=0,
                rank=0,
                age=int(dqm.group(2)),
                nationality_code=dqm.group(3),
                club=_split_camelcase(dqm.group(4).strip()),
                gender=current_event.gender,
                round_type=current_event.round_type,
                status='DQ',
            )
            current_event.results.append(result)
            continue

    # Remove events with no results
    meet.events = [e for e in meet.events if e.results]

    # Merge duplicate events
    merge_duplicate_events(meet)

    return meet
