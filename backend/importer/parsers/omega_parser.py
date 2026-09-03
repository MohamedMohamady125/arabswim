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
# HC / EXH individual: same layout but HC prefix instead of rank number
HC_INDIVIDUAL_PREFIX = re.compile(
    r'^\s*(?:H\.?C\.?|EXH)\s+'    # HC/EXH prefix
    r'(?:\d{1,2}\s+)?'            # optional heat number
    r'(?:\d{1,2}\s+)?'            # optional lane number
    r'([A-Z][A-Z\- ]+\s+\w[\w\- ]*?)\s+'  # name
    r'(?:(\d{4})\s+)?'            # optional birth year
    r'([A-Z]{3})\b',              # NOC code
    re.IGNORECASE
)
# All time-like values on a line (split times + final time)
_TIME_RE = re.compile(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2})')

# Detailed "Results" pages repeat a round already printed on a "Results
# Summary" page, but drop the round word from the header:
#   "Event 331 Men's 50m Freestyle"   (heats detail, with splits)
#   "Event 431 Men's 50m Freestyle"   (semis detail)
#   "Event 102 Men's 400m Freestyle"  (final detail — the "Final" summary
#                                       already carried every swim)
# Every real round is ALSO printed with its round word ("Event 31 …
# Heats", "Event 131 … Final"), so these round-less repeats are redundant.
# If we don't recognise them as headers, their swims leak into whatever
# event was open before (finals ranked 1-2 polluting the heats list).
EVENT_NUM_HEADER = re.compile(r"^Event\s+\d+\s+(?:Men|Women|Mixed)'?s\b", re.IGNORECASE)

# Medal / points summary sections at the end of the book: their lines start
# with a number or medal word but are not results.
STOP_SECTION = re.compile(r'^(?:Medallists|Medal Standings?|Medal Table)\b', re.IGNORECASE)

# A real result row never carries the event name inline; the end-of-book
# points table does ("45 PROUD Benjamin GBR Men's 50m Freestyle Final 21.32 943").
_SUMMARY_INLINE = re.compile(r"(?:Men|Women|Mixed)'?s\s+\d")
_LEADING_RANK = re.compile(r'^=?(\d{1,3})$')
_HC_TOKEN = re.compile(r'^(?:H\.?C\.?|EXH)$', re.IGNORECASE)
_TIMEISH = re.compile(r'^(?:\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2})$')


def _parse_individual_line(stripped):
    """Anchor-based parse of an Omega individual result row.

    Returns (status, rank, name_raw, birth_year, noc, time_text) or None.

    Layout: ``[=]RANK [HEAT] [LANE] LASTNAME Firstname NOC [DD MON YYYY]
    [R.T.] [splits…] TIME [behind] [Q/R…]``.  The NOC is pinned either to
    the token right before a "DD MON YYYY" date of birth, or (when the row
    has no DOB) to the last 3-letter uppercase token before the first
    time value.  This keeps ALL-CAPS first names (e.g. "CROOKS JJG") from
    swallowing the NOC and mis-reading a 3-letter month as the country.
    """
    if _SUMMARY_INLINE.search(stripped):
        return None
    toks = stripped.split()
    if not toks:
        return None
    status = 'OK'
    m = _LEADING_RANK.match(toks[0])
    if m:
        rank = int(m.group(1))
    elif _HC_TOKEN.match(toks[0]):
        status, rank = 'HC', 0
    else:
        return None
    i = 1
    # optional heat + lane (small integers)
    skipped = 0
    while i < len(toks) and skipped < 2 and re.fullmatch(r'\d{1,2}', toks[i]):
        i += 1
        skipped += 1
    # NOC via a "DD MON YYYY" date of birth, else last uppercase 3-code
    noc_idx = None
    birth_year = 0
    after_start = None
    for k in range(i, len(toks) - 2):
        if (re.fullmatch(r'\d{1,2}', toks[k])
                and toks[k + 1][:3].upper() in _MONTHS
                and re.fullmatch(r'\d{4}', toks[k + 2])):
            noc_idx = k - 1
            birth_year = int(toks[k + 2])
            after_start = k + 3
            break
    if noc_idx is None:
        t_idx = next((j for j in range(i, len(toks)) if _TIMEISH.match(toks[j])), None)
        if t_idx is None:
            return None
        noc_idx = next((j for j in range(t_idx - 1, i - 1, -1)
                        if re.fullmatch(r'[A-Z]{3}', toks[j])), None)
        after_start = t_idx
    if noc_idx is None or noc_idx < i:
        return None
    noc = toks[noc_idx]
    if not re.fullmatch(r'[A-Z]{3}', noc):
        return None
    name_raw = ' '.join(toks[i:noc_idx]).strip()
    if not name_raw:
        return None
    times = [t for t in toks[after_start:] if _TIMEISH.match(t)]
    if not times:
        return None
    time_text = max(times, key=parse_time_to_centiseconds)
    return status, rank, name_raw, birth_year, noc, time_text

# Games-style variant (e.g. Hangzhou Asian Games results book): the event
# header has no round on the same line — the round follows on a date line.
#   "Women's 4 x 100m Freestyle Relay"
#   "SUN 24 SEP 2023 Heats"
EVENT_HEADER_NOROUND = re.compile(
    r"^(Men|Women|Mixed)'?s?\s+"
    r"(?:(\d+)\s*x\s*)?(\d+)m\s+"
    r"([A-Za-z ]+?)\s*$"
)
ROUND_LINE = re.compile(
    r'^(?:[A-Z]{3}\s+\d{1,2}\s+[A-Z]{3}\s+\d{4}\s+)?'
    r'(?:\d{1,2}:\d{2}\s+)?'  # optional time prefix "9:20 Heats"
    r'(Heats?|Finals?|Semifinals?|Swim-?offs?)\s*$',
    re.IGNORECASE,
)
# Date on the round line: "SUN 24 SEP 2023 Heats"
ROUND_DATE = re.compile(r'^[A-Z]{3}\s+(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\b')
# Standalone date line: "22 JUL 2025" (WUG/FISU format)
STANDALONE_DATE = re.compile(r'^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s*$')
# Detailed per-event pages in Games books print the English header in a
# display font whose glyphs don't extract ("omen s m utter"), but the
# Chinese header right above the round line is always intact:
#   "女子50米蝶泳" / "男子4x100米自由泳接力" / "混合4x100米混合泳接力"
EVENT_HEADER_CN = re.compile(
    r'^(男子|女子|混合)\s*'
    r'(?:(\d+)\s*[xX×]\s*)?(\d+)\s*米\s*'
    r'(个人混合泳|混合泳|自由泳|仰泳|蛙泳|蝶泳)'
    r'(接力)?\s*$'
)
CN_GENDERS = {'男子': 'Men', '女子': 'Women', '混合': 'Mixed'}
CN_STROKES = {
    '自由泳': 'Freestyle',
    '仰泳': 'Backstroke',
    '蛙泳': 'Breaststroke',
    '蝶泳': 'Butterfly',
    '个人混合泳': 'Individual Medley',
    '混合泳': 'Medley',
}
# Date of birth inside a result line: "19 APR 1998"
DOB_RE = re.compile(r'\b\d{1,2}\s+[A-Z]{3}\s+(\d{4})\b')

# Games-style relay team: "1 4 CHN-People's Republic of China 3:37.53 Q"
RELAY_TEAM_DASH = re.compile(
    r'^\s*(\d{1,2})\s+'           # rank
    r'(?:\d{1,2}\s+)?'            # optional lane
    r'([A-Z]{3})-\S'              # NOC-CountryName (no space around dash)
)

# Relay team: "1 5 KUW -Kuwait 7:52.94"
RELAY_TEAM = re.compile(
    r'^\s*(\d{1,2})\s+'           # rank
    r'(?:\d{1,2}\s+)?'            # optional lane
    r'([A-Z]{3})\s+'              # NOC code
    r'-[A-Za-z ]+\s+'             # "-CountryName"
    r'(\d{1,2}:?\d{2}\.\d{2})'   # time
)
# HC relay team: "HC KUW -Kuwait 7:52.94"
HC_RELAY_TEAM = re.compile(
    r'^\s*(?:H\.?C\.?|EXH)\s+'   # HC/EXH prefix
    r'(?:\d{1,2}\s+)?'            # optional lane
    r'([A-Z]{3})\s+'              # NOC code
    r'-[A-Za-z ]+\s+'             # "-CountryName"
    r'(\d{1,2}:?\d{2}\.\d{2})',   # time
    re.IGNORECASE
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
    if has_event and (has_results_summary or has_noc):
        return True
    # Games-style variant: bare event header + a separate date/round line
    has_bare_event = any(
        EVENT_HEADER_NOROUND.match(ln.strip()) for ln in text.split('\n'))
    has_round_line = any(
        ROUND_LINE.match(ln.strip())
        for ln in text.split('\n'))
    if has_results_summary and has_bare_event and has_round_line:
        return True
    # FISU/WUG/Atos variant: result book with medallists + event names
    lower = text.lower()
    if 'medallists by event' in lower and 'rank' in lower:
        # Check for event names in medallists table
        if re.search(r"(?:men|women)'s\s+\d+m\s+\w+", lower):
            return True
    if ('report created by atos' in lower) and 'rank' in lower:
        return True
    return False


_MONTHS = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
           'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}

# Entry list line: "PARKER Maxine Charlize USA 14 JUN 2002 7 JUN 2025 24.41"
_ENTRY_LINE = re.compile(
    r'^([A-ZÀ-Þ][A-ZÀ-Þa-zà-ÿ\s\'-]+?)\s+'   # name
    r'([A-Z]{2,3})\s+'                            # country code
    r'(\d{1,2})\s+([A-Z]{3})\s+(\d{4})'          # DOB: DD MON YYYY
)


def _extract_dob_map(text):
    """Pre-scan entry list pages for date-of-birth data.

    Returns dict: uppercase_name -> (birth_year, dob_iso_string)
    """
    dob_map = {}
    in_entry = False
    for line in text.split('\n'):
        stripped = line.strip()
        if 'Entry list' in stripped:
            in_entry = True
            continue
        if 'Results' in stripped and 'Entry' not in stripped:
            in_entry = False
            continue
        if not in_entry:
            continue
        m = _ENTRY_LINE.match(stripped)
        if m:
            name = m.group(1).strip()
            day = int(m.group(3))
            mon = _MONTHS.get(m.group(4).upper(), 0)
            year = int(m.group(5))
            if mon and 1900 < year < 2020:
                key = name.upper().strip()
                dob_map[key] = (year, f'{year}-{mon:02d}-{day:02d}')
    return dob_map


def parse(text):
    """Parse Omega/Swiss Timing format text into ParsedMeet."""
    lines = text.split('\n')
    meet = ParsedMeet(source_format='omega')

    # Pre-extract DOBs from entry list pages
    dob_map = _extract_dob_map(text)

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
        em_noround = None if em else EVENT_HEADER_NOROUND.match(stripped)
        em_cn = None if (em or em_noround) else EVENT_HEADER_CN.match(stripped)
        if em or em_noround or em_cn:
            if em:
                gender_raw = em.group(1)
                legs = em.group(2)  # None for individual, "4" for relay
                distance = int(em.group(3))
                stroke_raw = em.group(4)
                round_raw = em.group(5)
            elif em_noround:
                gender_raw = em_noround.group(1)
                legs = em_noround.group(2)
                distance = int(em_noround.group(3))
                stroke_raw = em_noround.group(4)
                round_raw = 'Final'  # updated by the following date/round line
            else:
                gender_raw = CN_GENDERS[em_cn.group(1)]
                legs = em_cn.group(2)
                distance = int(em_cn.group(3))
                stroke_raw = CN_STROKES[em_cn.group(4)]
                if em_cn.group(5):  # 接力 = relay
                    stroke_raw += ' Relay'
                round_raw = 'Final'  # updated by the following date/round line

            if gender_raw.upper() == 'MIXED':
                gender = 'X'
            else:
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
            current_event._round_pending = bool(em_noround or em_cn)
            meet.events.append(current_event)
            continue

        # Round-less "Event NNN Gender's …" repeat = a detail page whose swims
        # already appear (with their round) on a summary page. Close the open
        # event so finals/semis rows don't leak into the previous round.
        if EVENT_NUM_HEADER.match(stripped):
            current_event = None
            continue

        # End-of-book medal / points tables — not results.
        if STOP_SECTION.match(stripped):
            current_event = None
            continue

        if current_event is None:
            continue

        # Standalone date line: "22 JUL 2025" (WUG/FISU format)
        sdm = STANDALONE_DATE.match(stripped)
        if sdm:
            months = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5,
                      'JUN': 6, 'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10,
                      'NOV': 11, 'DEC': 12}
            mo = months.get(sdm.group(2).upper(), 0)
            if mo:
                _pending_date = f'{int(sdm.group(3)):04d}-{mo:02d}-{int(sdm.group(1)):02d}'
                if current_event and not current_event.results:
                    current_event.date_text = _pending_date
                if not meet.date_text or _pending_date < meet.date_text:
                    meet.date_text = _pending_date
                if not getattr(meet, 'date_end', '') or _pending_date > getattr(meet, 'date_end', ''):
                    meet.date_end = _pending_date
            continue

        # Games-style date/round line right after a bare event header:
        # "SUN 24 SEP 2023 Heats" — sets the round (and collects meet dates)
        rl = ROUND_LINE.match(stripped)
        if rl and getattr(current_event, '_round_pending', False) and not current_event.results:
            round_word = rl.group(1).upper()
            if round_word.startswith('SEMI'):
                current_event.round_type = 'Semis'
            elif round_word.startswith('HEAT'):
                current_event.round_type = 'Heats'
            else:
                current_event.round_type = 'Finals'
            dm = ROUND_DATE.match(stripped)
            if dm:
                months = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5,
                          'JUN': 6, 'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10,
                          'NOV': 11, 'DEC': 12}
                d = f'{int(dm.group(3)):04d}-{months.get(dm.group(2).upper(), 1):02d}-{int(dm.group(1)):02d}'
                current_event.date_text = d
                if not meet.date_text or d < meet.date_text:
                    meet.date_text = d
                if not getattr(meet, 'date_end', '') or d > meet.date_end:
                    meet.date_end = d
            current_event._round_pending = False
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
            relay_status = 'OK'
            if not rm:
                hc_rm = HC_RELAY_TEAM.match(stripped)
                if hc_rm:
                    relay_status = 'HC'
                    rm = hc_rm
            if rm:
                if relay_status == 'HC':
                    rank = 0
                    noc = rm.group(1)
                    time_text = rm.group(2)
                else:
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
                    status=relay_status,
                ))
                continue

            # Games-style relay team: "1 4 CHN-People's Republic of China 3:37.53 Q"
            dm2 = RELAY_TEAM_DASH.match(stripped)
            if dm2:
                all_times = _TIME_RE.findall(stripped[dm2.end():])
                if all_times:
                    time_text = max(all_times, key=parse_time_to_centiseconds)
                    time_cs = parse_time_to_centiseconds(time_text)
                    noc = dm2.group(2)
                    current_event.results.append(ParsedResult(
                        swimmer_name=f'{noc} A',
                        time_text=time_text,
                        time_centiseconds=time_cs,
                        event_name=current_event.event_name,
                        event_distance=current_event.distance,
                        event_stroke=current_event.stroke,
                        gender=current_event.gender,
                        rank=int(dm2.group(1)),
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
            # Individual result — anchor-based parse (rank/name/NOC/time)
            parsed = _parse_individual_line(stripped)
            if parsed:
                ind_status, rank, name_raw, birth_year, noc, time_text = parsed
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
                    status=ind_status,
                ))
                continue

    meet = merge_duplicate_events(meet)

    # Enrich results with DOBs from entry list pages
    if dob_map:
        for event in meet.events:
            for r in event.results:
                if not r.birth_year and r.swimmer_name:
                    key = r.swimmer_name.upper().strip()
                    dob = dob_map.get(key)
                    if dob:
                        r.birth_year = dob[0]

    return meet
