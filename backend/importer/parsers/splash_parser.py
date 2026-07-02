"""
Parser for Splash Meet Manager PDF format.
Used by: Algeria national/international championships.
Identified by: "Splash Meet Manager" in footer text.

Format:
  Event header variants:
    "Epreuve 11 Messieurs, 50m Libre Cat. générale"
    "Epreuve 6, Messieurs, 100m Papillon, Eliminatoire, Cat. générale"
    "Epreuve 36 Garçons, 50m Libre 13 - 18 ans"
    "Epreuve 36, Garçons, 50m Libre, MINIMES"        (page-break continuation)
  Round marker line (after header): "20/07/2022 - 10:40 Liste résultats Eliminatoire"
  Standalone category lines: "MINIMES", "CADETS", "Cat. générale", "13 - 18 ans"
  Columns: Rang AN Temps Pts [50m 100m ...]
  Result line (national):     "1. BENBARA, MEHDI NAZIM 98 MC ALGER 22.67 703"
  Result line (international):"1. ALZAMIL, ALI 02 KUW 25.71 793 Q 30.20 32.87"
  Tied result (no rank):      "RAHMOUNI, Mahdi 12 Union Sportf Biskra 28.23 350"
  Long-race split lines:      "50m: 31.36 31.36 150m: 1:39.54 34.46 ..."
  Relay team (international): "1. ALG ALG 3:39.22 839"
  Relay team (national):      "1. Mouloudia Club D'Alger 2 Mouloudia Club D'Alger 3:41.25 553"
  Relay swimmers w/ splits:   "MEMMOU, Illiassine +0,73 27.37 56.61 BOUDALIA, Rayane +0,30 26.42 56.57"
  DQ/DNS lines: "disq. NAME ...", "disq.sport. NAME ...", "forf.nd. NAME", "abandon NAME ..."
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, detect_gender,
    normalize_name, is_relay_event, normalize_event_name,
    normalize_category, merge_duplicate_events, clean_text,
)


# Event header: "Epreuve 36 Garçons, ..." or "Epreuve 36, Garçons, ..."
EVENT_HEADER = re.compile(
    r'^Epreuve\s+(\d+)\s*,?\s*'
    r'(Messieurs|Dames|Gar[çc]ons|Filles|Mixte)\b',
    re.IGNORECASE
)

# Event description: "50m Libre", "200m 4 nages", "4 x 100m Libre"
EVENT_DESC = re.compile(
    r'(\d+\s*x\s*)?(\d+)\s*m\s+(.+)$',
    re.IGNORECASE
)

TIME_RE = re.compile(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})')

# Age-group / category labels (standalone line or trailing on header/desc)
CATEGORY_RE = re.compile(
    r'(POUSSINS?|BENJAMINS?|MINIMES?|CADETS?|JUNIORS?|SENIORS?|OPEN|'
    r'Cat\.\s*g[ée]n[ée]rale|'
    r'\d{1,2}\s*-\s*\d{1,2}\s*ans|'
    r'\d{1,2}\s*ans\s*et\s*plus)',
    re.IGNORECASE
)
CATEGORY_LINE = re.compile(r'^\s*' + CATEGORY_RE.pattern + r'\s*$', re.IGNORECASE)
CATEGORY_TAIL = re.compile(r'\s+' + CATEGORY_RE.pattern + r'\s*$', re.IGNORECASE)

# Long-race split lines: "50m: 31.36 31.36 150m: 1:39.54 34.46 ..."
SPLIT_LINE = re.compile(r'^\s*\d{2,4}m:\s')
SPLIT_PAIR = re.compile(r'(\d{2,4})m:\s+(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})')

# Status lines: disq. / disq.sport. / forf.nd. / forf.déc. / abandon
STATUS_LINE = re.compile(
    r'^\s*(disq[\w.]*|forf[\w.]*|abandon|dsq|dns|dnf)\s+(.+)$',
    re.IGNORECASE
)

# International relay team line: "1. ALG ALG 3:39.22 839"
RELAY_INTL_LINE = re.compile(
    r'^\s*(\d+)\.\s+'
    r'([A-Z]{3})\s+'
    r'(\S+)\s+'
    r'(\d{1,2}:\d{2}\.\d{2})\s*'
    r'(\d+)?'
)

# Generic relay team line (national clubs): "1. <team text> m:ss.xx pts [Q]"
RELAY_TEAM_LINE = re.compile(
    r'^\s*(\d+)\.\s+'
    r'(.+?)\s*'
    r'(\d{1,2}:\d{2}\.\d{2})\s*'
    r'(\d+)?\s*[QqRr?*]*\s*$'
)

# Relay DQ/forfeit line: "disq. KUW KUW" or "forf.déc. JOR JOR"
RELAY_DQ_LINE = re.compile(
    r'^\s*(disq[\w.]*|forf[\w.]*|abandon)\s+(.+)$',
    re.IGNORECASE
)

COUNTRY_CODE = re.compile(r'^[A-Z]{3}$')

ROUND_PATTERNS = {
    'Finals': re.compile(r'\bFinale', re.IGNORECASE),
    'Heats': re.compile(r'\bEliminatoire|\bS[ée]ries?\b', re.IGNORECASE),
}

# Page furniture that must never be parsed as data
SKIP_KEYWORDS = (
    'splash meet manager', 'registered to', 'liste résultats',
    'liste resultats',
)
SKIP_PREFIXES = ('points:', 'rang ', 'rang\t')


def normalize_name_splash(name):
    """Normalize name for Splash format where comma means LAST, First."""
    return normalize_name(name, comma_order='last_first')


def detect_format(text):
    """Check if this text is from Splash Meet Manager."""
    return 'splash meet manager' in text.lower()


def _normalize_splash_category(label):
    """Normalize a Splash age-group label to a canonical English form."""
    if not label:
        return ''
    label = label.strip()
    if re.match(r'^Cat\.\s*g[ée]n[ée]rale$', label, re.IGNORECASE):
        return ''  # general/open category — no age restriction
    m = re.match(r'^(\d{1,2})\s*-\s*(\d{1,2})\s*ans$', label, re.IGNORECASE)
    if m:
        return f'{m.group(1)}-{m.group(2)}'
    m = re.match(r'^(\d{1,2})\s*ans\s*et\s*plus$', label, re.IGNORECASE)
    if m:
        return f'{m.group(1)}+'
    return normalize_category(label)


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
        if 'FINA' in line or 'AQUA' in line or line.startswith('Rang') or line.startswith('Points'):
            continue
        if re.match(r'^=+\s*PAGE', line):
            continue
        header_lines.append(line)
        if len(header_lines) >= 2:
            break

    if header_lines:
        meet.meet_name = clean_text(header_lines[0])
    if len(header_lines) >= 2:
        # Second line usually has location + dates: "EL BEZ SETIF, 19 - 22/1/2022"
        start_date, end_date, location = extract_date_and_location(header_lines[1])
        meet.date_text = start_date
        if end_date:
            meet.date_end = end_date
        meet.location = clean_text(location)

    is_international = _detect_international(text)

    current_event = None
    current_key = None       # (event_number, gender, distance, stroke)
    prev_rank = 0

    def sibling_event(round_type=None, age_group=None):
        """Get an event matching current context, creating a sibling if needed."""
        nonlocal current_event, prev_rank
        if current_event is None:
            return None
        rt = current_event.round_type if round_type is None else round_type
        ag = current_event.age_group if age_group is None else age_group
        if current_event.round_type == rt and current_event.age_group == ag:
            return current_event
        if not current_event.results:
            # No results yet: safe to adjust in place
            current_event.round_type = rt
            current_event.age_group = ag
            return current_event
        new_event = ParsedEvent(
            event_name=current_event.event_name,
            distance=current_event.distance,
            stroke=current_event.stroke,
            gender=current_event.gender,
            round_type=rt,
            age_group=ag,
        )
        meet.events.append(new_event)
        current_event = new_event
        prev_rank = 0
        return current_event

    for line in lines:
        line = clean_text(line)
        if not line:
            continue

        lower = line.lower()

        # Event header
        header_match = EVENT_HEADER.match(line)
        if header_match:
            event_number = header_match.group(1)
            gender_word = header_match.group(2).lower()
            if gender_word == 'mixte':
                gender = 'X'
            else:
                gender = detect_gender(line)

            rest = line[header_match.end():]
            # Round + category can be comma-separated parts or trail the description
            round_type = ''
            for rtype, pattern in ROUND_PATTERNS.items():
                if pattern.search(rest):
                    round_type = rtype
                    break

            age_group_raw = None
            cat_match = CATEGORY_TAIL.search(rest) or CATEGORY_LINE.match(rest.strip(' ,'))
            if cat_match:
                age_group_raw = cat_match.group(1)
            else:
                # Check comma-separated parts for a category
                for part in rest.split(','):
                    part = part.strip()
                    if CATEGORY_LINE.match(part):
                        age_group_raw = part
                        break

            desc_match = EVENT_DESC.search(rest)
            if not desc_match:
                continue
            distance = int(desc_match.group(2))
            # Relay headers give the LEG distance ("4 x 200m Libre"); the
            # event's total distance is teams x leg, and normalize_event_name
            # expects the total (it derives the leg back for the name).
            if desc_match.group(1):
                teams = int(re.match(r'\d+', desc_match.group(1)).group())
                distance = teams * distance
            stroke_raw = desc_match.group(3).strip(' ,')
            # Strip trailing round/category words from the stroke text
            stroke_raw = re.sub(
                r'\s*,.*$', '', stroke_raw)  # drop everything after first comma
            stroke_raw = CATEGORY_TAIL.sub('', stroke_raw).strip()
            stroke = normalize_stroke(stroke_raw)
            relay = bool(desc_match.group(1)) or is_relay_event(line)

            event_name = normalize_event_name(distance, stroke, relay)
            if relay and gender:
                gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(gender, '')
                if gender_label:
                    event_name = f'{event_name} {gender_label}'

            key = (event_number, gender, distance, stroke, relay)
            if key == current_key and current_event is not None:
                # Page-break continuation of the same event: inherit context
                if age_group_raw is not None:
                    sibling_event(age_group=_normalize_splash_category(age_group_raw))
                if round_type:
                    sibling_event(round_type=round_type)
                continue

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=round_type,
                age_group=_normalize_splash_category(age_group_raw) if age_group_raw else '',
            )
            meet.events.append(current_event)
            current_key = key
            prev_rank = 0
            continue

        # Round marker on its own line: "20/07/2022 - 10:40 Liste résultats Eliminatoire"
        if 'liste r' in lower and current_event is not None:
            for rtype, pattern in ROUND_PATTERNS.items():
                if pattern.search(line):
                    sibling_event(round_type=rtype)
                    break
            continue

        # Skip page furniture
        if any(kw in lower for kw in SKIP_KEYWORDS):
            continue
        if any(lower.startswith(p) for p in SKIP_PREFIXES):
            continue
        if re.match(r'^=+\s*PAGE', line):
            continue

        # Standalone category line
        cat_match = CATEGORY_LINE.match(line)
        if cat_match and current_event is not None:
            sibling_event(age_group=_normalize_splash_category(cat_match.group(1)))
            continue

        if current_event is None:
            continue

        # Long-race split line: attach cumulative splits to the previous result
        if SPLIT_LINE.match(line):
            if current_event.results:
                pairs = SPLIT_PAIR.findall(line)
                result = current_event.results[-1]
                existing = {d for d, _ in getattr(result, '_split_pairs', [])}
                if not hasattr(result, '_split_pairs'):
                    result._split_pairs = []
                for dist_text, cum_time in pairs:
                    d = int(dist_text)
                    if d not in existing:
                        result._split_pairs.append((d, cum_time))
                result._split_pairs.sort(key=lambda p: p[0])
                result.split_times = [t for _, t in result._split_pairs]
            continue

        event_is_relay = _is_relay(current_event.event_name)

        if event_is_relay:
            handled = _parse_relay_line(line, current_event, is_international)
            if handled:
                continue
        else:
            result = _parse_result_line(line, current_event, is_international, prev_rank)
            if result:
                if result.rank:
                    prev_rank = result.rank
                current_event.results.append(result)
                continue

            # Status line (DQ / DNS / DNF)
            status_result = _parse_status_line(line, current_event)
            if status_result:
                current_event.results.append(status_result)
                continue

    # Drop events that never received any results (empty provisional lists,
    # page-break continuation shells, etc.)
    meet.events = [e for e in meet.events if e.results]
    merge_duplicate_events(meet)
    return meet


def _is_relay(event_name):
    """Check if event name indicates a relay."""
    t = event_name.lower()
    return 'relay' in t or '4x' in t or '4×' in t or '4 x' in t


STATUS_MAP = {
    'disq': 'DQ',
    'dsq': 'DQ',
    'forf': 'DNS',
    'dns': 'DNS',
    'abandon': 'DNF',
    'dnf': 'DNF',
}


def _status_from_word(word):
    w = word.lower()
    for prefix, status in STATUS_MAP.items():
        if w.startswith(prefix):
            return status
    return 'DQ'


def _parse_relay_line(line, event, is_international):
    """Parse one line inside a relay event. Returns True if the line was consumed."""
    # International team line: "1. ALG ALG 3:39.22 839"
    m = RELAY_INTL_LINE.match(line)
    if m and is_international:
        rank = int(m.group(1))
        nat_code = m.group(2)
        team_name = m.group(3)
        time_text = m.group(4)
        fina = int(m.group(5)) if m.group(5) else 0
        event.results.append(ParsedResult(
            swimmer_name=f'{nat_code} {team_name}',
            time_text=time_text,
            time_centiseconds=parse_time_to_centiseconds(time_text),
            event_name=event.event_name,
            event_distance=event.distance,
            event_stroke=event.stroke,
            gender=event.gender,
            rank=rank,
            nationality_code=nat_code,
            club=f'{nat_code} {team_name}',
            fina_points=fina,
            round_type=event.round_type,
            age_group=event.age_group,
        ))
        return True

    # National club team line:
    # "1. Poste Telecomunication Alger 1 Poste Telecomunication Alger 4:10.23 382"
    m = RELAY_TEAM_LINE.match(line)
    if m:
        rank = int(m.group(1))
        team_text = m.group(2).strip()
        time_text = m.group(3)
        fina = int(m.group(4)) if m.group(4) else 0
        team_name = _collapse_team_repetition(team_text)
        nat_code = ''
        tokens = team_name.split()
        if tokens and COUNTRY_CODE.match(tokens[0]) and is_international:
            nat_code = tokens[0]
        event.results.append(ParsedResult(
            swimmer_name=team_name,
            time_text=time_text,
            time_centiseconds=parse_time_to_centiseconds(time_text),
            event_name=event.event_name,
            event_distance=event.distance,
            event_stroke=event.stroke,
            gender=event.gender,
            rank=rank,
            nationality_code=nat_code,
            club=team_name,
            fina_points=fina,
            round_type=event.round_type,
            age_group=event.age_group,
        ))
        return True

    # Relay DQ/forfeit: "disq. KUW KUW" or "forf.déc. Club X Club X"
    m = RELAY_DQ_LINE.match(line)
    if m:
        team_name = _collapse_team_repetition(m.group(2).strip())
        # Strip any trailing time/points from a DQ line
        team_name = TIME_RE.sub('', team_name).strip(' 0123456789')
        if team_name:
            event.results.append(ParsedResult(
                swimmer_name=team_name,
                time_text='',
                status=_status_from_word(m.group(1)),
                gender=event.gender,
                event_name=event.event_name,
                event_distance=event.distance,
                event_stroke=event.stroke,
                club=team_name,
                round_type=event.round_type,
                age_group=event.age_group,
            ))
        return True

    # Relay swimmer detail lines (names with reaction times + splits)
    if event.results:
        swimmer_splits = _parse_relay_swimmers(line)
        if swimmer_splits:
            event.results[-1].split_times.extend(swimmer_splits)
            return True

    return False


def _collapse_team_repetition(text):
    """Collapse 'Club Name 1 Club Name' → 'Club Name 1'.

    Splash national relay lines print the team name twice (short name +
    full name); usually identical apart from an optional team number.
    """
    m = re.match(r'^(.+?)(?:\s+(\d))?\s+\1(?:\s+(\d))?$', text)
    if m:
        base = m.group(1).strip()
        num = m.group(2) or m.group(3)
        return f'{base} {num}' if num else base
    return text


def _parse_relay_swimmers(line):
    """Extract swimmer names and split times from a relay detail line.

    Format: "ARDJOUNE, ABDELLAH +0,57 26.66 55.39 SYOUD, JAOUAD +0,29 24.32 52.16"
    Returns list of "Name split_time" strings.
    """
    # Skip page headers/footers that might appear mid-results
    skip_words = ['splash', 'meet manager', 'registered', 'page', 'championship',
                  'complex', 'epreuve', 'points:', 'rang', 'liste']
    if any(kw in line.lower() for kw in skip_words):
        return []
    # Swimmer detail lines carry either a reaction marker ("+0,57") or a
    # birth year followed by split times ("BENBARA, MEHDI NAZIM 98 24.02 50.88")
    if '+' not in line and not re.search(r'\d{2}\s+\d{1,2}[:.]\d{2}', line):
        return []
    if not re.match(r'^[A-ZÀ-Ý]', line):
        return []
    # Split where a name follows a completed split time
    parts = re.split(r'(?<=\d{2}\.\d{2})\s+(?=[A-ZÀ-Ý])', line)
    results = []

    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Variant A: NAME +reaction split... final_split
        m = re.match(r'^(.+?)\s+\+[\d,\.]+\s+(.+)$', part)
        if m:
            name_raw = m.group(1)
            splits_text = m.group(2)
        else:
            # Variant B: NAME YY split... final_split (birth year may be
            # glued to the name: "EDDINE06")
            m = re.match(r'^(.+?)\s?\d{2}\s+((?:\d{1,2}:)?\d{2}\.\d{2}.*)$', part)
            if not m:
                continue
            name_raw = m.group(1)
            splits_text = m.group(2)
        name = normalize_name_splash(name_raw)
        times = TIME_RE.findall(splits_text)
        split_time = times[-1] if times else ''
        if name:
            results.append(f'{name} {split_time}'.strip())

    return results


def _detect_international(text):
    """Detect if this is an international meet (has country codes instead of clubs)."""
    codes = re.findall(r'\b([A-Z]{3})\b', text)
    known_countries = {'ALG', 'EGY', 'TUN', 'MAR', 'JOR', 'KUW', 'KSA', 'QAT',
                       'OMA', 'BHR', 'IRQ', 'SYR', 'LBN', 'UAE', 'SUD', 'YEM',
                       'LBY', 'PLE', 'FRA', 'USA', 'GBR', 'GER', 'ITA', 'ESP'}
    country_count = sum(1 for c in codes if c in known_countries)
    return country_count > 5


def _extract_birth_year(before_time):
    """Find the 2-digit birth year in the name/club section of a result line.

    Returns (name_part, birth_year_4digit_or_0, club_text).
    Handles glued name+year tokens like "MONCEF01" or "Messaoud10".
    """
    # First standalone 2-digit token (names never contain digits)
    m = re.search(r'(?:(?<=\s)|^)(\d{2})(?=\s|$)', before_time)
    if not m:
        # Glued: letter immediately followed by exactly 2 digits then boundary
        m = re.search(r'(?<=[A-Za-zÀ-ÿ.\'])(\d{2})(?=\s|$)', before_time)
    if not m:
        return before_time.strip(), 0, ''
    name_part = before_time[:m.start()].strip()
    club = before_time[m.end():].strip()
    yy = int(m.group(1))
    birth_year = 2000 + yy if yy < 30 else 1900 + yy
    return name_part, birth_year, club


def _parse_result_line(line, event, is_international, prev_rank):
    """Try to parse a single individual result line."""
    m = re.match(r'^\s*(\d+)\.\s+(.*)$', line)
    if m:
        rank = int(m.group(1))
        rest = m.group(2)
    else:
        # Rankless tie line: "RAHMOUNI, Mahdi 12 Union Sportf Biskra 28.23 350"
        if not re.match(r'^[A-ZÀ-Ý]', line):
            return None
        rank = prev_rank
        rest = line

    time_match = TIME_RE.search(rest)
    if not time_match:
        return None

    time_text = time_match.group(1)
    before_time = rest[:time_match.start()].strip()
    after_time = rest[time_match.end():].strip()

    name_part, birth_year, club_or_country = _extract_birth_year(before_time)
    if not name_part:
        return None
    # Rankless lines must carry a birth year to be trusted as results
    if rest is line and not birth_year:
        return None

    # FINA points immediately after the time
    fina_points = 0
    pts_match = re.match(r'(\d{1,4})\b', after_time)
    if pts_match:
        fina_points = int(pts_match.group(1))
        after_time = after_time[pts_match.end():].strip()

    # Qualification marker (Q/R/q/r/*/?)
    after_time = re.sub(r'^[QqRr?*]+\s*', '', after_time)

    # Whatever times remain inline are splits (cumulative)
    splits = TIME_RE.findall(after_time)

    # Country code vs club
    nationality = ''
    club = club_or_country
    if is_international:
        tokens = club_or_country.split()
        if tokens and COUNTRY_CODE.match(tokens[0]):
            nationality = tokens[0]
            club = ' '.join(tokens[1:]) if len(tokens) > 1 else ''

    name = normalize_name_splash(name_part)
    if not name:
        return None

    return ParsedResult(
        swimmer_name=name,
        time_text=time_text,
        time_centiseconds=parse_time_to_centiseconds(time_text),
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


def _parse_status_line(line, event):
    """Parse a DQ/DNS/DNF line: 'disq. TAIBI, Abderraouf 10 Club ... 30.31'."""
    m = STATUS_LINE.match(line)
    if not m:
        return None
    status = _status_from_word(m.group(1))
    remainder = m.group(2).strip()
    # Name must start with an uppercase letter (guards against furniture)
    if not re.match(r'^[A-ZÀ-Ý]', remainder):
        return None

    # Cut off any trailing time(s) before locating the birth year
    time_match = TIME_RE.search(remainder)
    before_time = remainder[:time_match.start()].strip() if time_match else remainder
    name_part, birth_year, club = _extract_birth_year(before_time)
    name = normalize_name_splash(name_part)
    if not name:
        return None
    return ParsedResult(
        swimmer_name=name,
        time_text='',
        status=status,
        gender=event.gender,
        event_name=event.event_name,
        event_distance=event.distance,
        event_stroke=event.stroke,
        birth_year=birth_year,
        club=club,
        round_type=event.round_type,
        age_group=event.age_group,
    )
