"""
Base parser and common utilities for swimming result file parsing.
All parsers extract data into a standardized format.
"""
import re
from dataclasses import dataclass, field


@dataclass
class ParsedResult:
    """A single swim result extracted from a file."""
    swimmer_name: str
    time_text: str  # raw time string e.g. "21.90" or "2:08.56"
    time_centiseconds: int = 0  # computed from time_text
    event_name: str = ''  # e.g. "50m Freestyle"
    event_distance: int = 0
    event_stroke: str = ''
    gender: str = ''  # M or F
    rank: int = 0
    birth_year: int = 0
    age: int = 0
    nationality_code: str = ''
    club: str = ''
    fina_points: int = 0
    split_times: list = field(default_factory=list)
    round_type: str = ''  # Finals, Heats, Prelims
    age_group: str = ''  # e.g. "15-16", "U12", "OPEN"
    status: str = 'OK'  # OK, DQ, DNS, DNF, NS


@dataclass
class ParsedEvent:
    """A group of results for one event."""
    event_name: str
    distance: int = 0
    stroke: str = ''
    gender: str = ''  # M or F
    round_type: str = ''
    age_group: str = ''
    results: list = field(default_factory=list)  # list of ParsedResult


@dataclass
class ParsedMeet:
    """The top-level container for an imported file."""
    meet_name: str = ''
    location: str = ''
    date_text: str = ''
    pool: str = ''  # LCM or SCM
    source_format: str = ''  # splash, hytek, frmn, nat2i, unknown
    events: list = field(default_factory=list)  # list of ParsedEvent

    @property
    def total_results(self):
        return sum(len(e.results) for e in self.events)

    @property
    def total_swimmers(self):
        names = set()
        for e in self.events:
            for r in e.results:
                names.add(r.swimmer_name)
        return len(names)

    @property
    def total_events(self):
        return len(self.events)


# --- Date and location extraction ---

# Date patterns: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
DATE_PATTERN = re.compile(
    r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})'
)

# Date range: "19 - 22/1/2022" or "20/21-04-2024" or "25/07/2024 to 27/07/2024"
DATE_RANGE_PATTERN = re.compile(
    r'(\d{1,2})(?:\s*[-/]\s*(\d{1,2}))?[/\-.](\d{1,2})[/\-.](\d{4})'
    r'(?:\s*(?:to|¤|-|–)\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}))?'
)

# Known pool/format keywords to strip from location
STRIP_KEYWORDS = [
    'petit bassin', 'grand bassin', 'short course', 'long course',
    'results', 'résultats', 'liste résultats',
]


def extract_date_and_location(text):
    """
    Extract date(s) and location from a messy text string.
    Returns (start_date_str, end_date_str, location).
    Date strings are in YYYY-MM-DD format for HTML date inputs.

    Handles formats like:
    - "EL BEZ SETIF, 19 - 22/1/2022"
    - "COMPLEX ORAN , 20 - 23/7/2022"
    - "Hamilton Aquatics Short Course - 21/10/2023 to 22/10/2023"
    - "CHAMPIONNAT ... - 25/07/2024 ¤ 27/07/2024 - RADES"
    - "COUPE DU TRONE DE NATATION - 10/05/2026 - MARRAKECH - Petit bassin"
    - "20/21-04-2024"
    """
    if not text:
        return '', '', ''

    start_date = ''
    end_date = ''
    location = ''

    # Find all date-like patterns
    dates_found = []
    for m in DATE_PATTERN.finditer(text):
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100:
            dates_found.append((m.start(), m.end(), f'{year:04d}-{month:02d}-{day:02d}'))

    if dates_found:
        start_date = dates_found[0][2]
        if len(dates_found) >= 2:
            end_date = dates_found[-1][2]

    # Also check for range like "19 - 22/1/2022" (start day before the full date)
    range_match = re.search(
        r'(\d{1,2})\s*[-–]\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})',
        text
    )
    if range_match:
        start_day = int(range_match.group(1))
        end_day = int(range_match.group(2))
        month = int(range_match.group(3))
        year = int(range_match.group(4))
        if 1 <= month <= 12 and 1 <= start_day <= 31 and 1 <= end_day <= 31:
            start_date = f'{year:04d}-{month:02d}-{start_day:02d}'
            end_date = f'{year:04d}-{month:02d}-{end_day:02d}'

    # Also handle "20/21-04-2024" format (day/day-month-year)
    compact_range = re.search(r'(\d{1,2})/(\d{1,2})-(\d{2})-(\d{4})', text)
    if compact_range:
        d1 = int(compact_range.group(1))
        d2 = int(compact_range.group(2))
        month = int(compact_range.group(3))
        year = int(compact_range.group(4))
        if 1 <= month <= 12:
            start_date = f'{year:04d}-{month:02d}-{d1:02d}'
            end_date = f'{year:04d}-{month:02d}-{d2:02d}'

    # Extract location: remove dates, known keywords, and clean up
    loc_text = text
    # Remove all date patterns
    loc_text = DATE_PATTERN.sub('', loc_text)
    # Remove day ranges like "19 - " before dates
    loc_text = re.sub(r'\d{1,2}\s*[-–]\s*(?=\s)', '', loc_text)
    # Remove known keywords
    for kw in STRIP_KEYWORDS:
        loc_text = re.sub(re.escape(kw), '', loc_text, flags=re.IGNORECASE)
    # Remove "to", "¤", connectors
    loc_text = re.sub(r'\b(to|¤)\b', '', loc_text)
    # Remove pool indicators like "25 M", "50 M" when standalone
    loc_text = re.sub(r'\b(25|50)\s*M\b', '', loc_text, flags=re.IGNORECASE)
    # Clean up separators and whitespace
    loc_text = re.sub(r'\s*[-–,]\s*$', '', loc_text)  # trailing
    loc_text = re.sub(r'^\s*[-–,]\s*', '', loc_text)  # leading
    loc_text = re.sub(r'\s*[-–]\s*[-–]\s*', ' - ', loc_text)  # double dashes
    loc_text = re.sub(r'\s*[-–,]\s*$', '', loc_text)  # trailing again after cleanup
    loc_text = re.sub(r'^\s*[-–,]\s*', '', loc_text)
    loc_text = re.sub(r'\s+', ' ', loc_text).strip()
    # Remove empty parentheses or dangling punctuation
    loc_text = re.sub(r'[,\s]+$', '', loc_text)
    loc_text = re.sub(r'^[,\s]+', '', loc_text)

    location = loc_text

    return start_date, end_date, location


def extract_meet_info(lines, max_lines=5):
    """
    Extract meet name, date, end_date, and location from the first few lines
    of a results file. Returns (meet_name, start_date, end_date, location).
    """
    if not lines:
        return '', '', '', ''

    # Combine first few lines for analysis
    combined = ' - '.join(l.strip() for l in lines[:max_lines] if l.strip())

    # The first meaningful line is usually the meet name
    meet_name = ''
    info_line = ''

    for line in lines[:max_lines]:
        line = line.strip()
        if not line:
            continue
        if not meet_name:
            meet_name = line
        elif not info_line and (re.search(r'\d{1,2}[/\-]\d{1,2}[/\-]\d{4}', line) or
                                re.search(r'\d{4}', line)):
            info_line = line
            break

    # Try to extract date from meet_name first (some formats embed it)
    start_date, end_date, _ = extract_date_and_location(meet_name)

    # If no date in meet_name, try the info line
    if not start_date and info_line:
        start_date, end_date, location = extract_date_and_location(info_line)
    else:
        _, _, location = extract_date_and_location(info_line) if info_line else ('', '', '')

    # Clean up meet_name: remove dates and pool info from it
    clean_name = meet_name
    clean_name = DATE_PATTERN.sub('', clean_name)
    clean_name = re.sub(r'\d{1,2}\s*[-–]\s*(?=\s)', '', clean_name)
    clean_name = re.sub(r'\b(to|¤)\b', '', clean_name)
    clean_name = re.sub(r'\s*[-–]\s*[-–]\s*', ' - ', clean_name)
    clean_name = re.sub(r'\s*[-–,]\s*$', '', clean_name)
    clean_name = re.sub(r'^\s*[-–,]\s*', '', clean_name)
    clean_name = re.sub(r'\s+', ' ', clean_name).strip()
    # Don't strip location from name if it's meaningful context

    return clean_name, start_date, end_date, location


# --- Time parsing utilities ---

TIME_PATTERN = re.compile(
    r'^(?:(\d{1,2}):)?(\d{1,2})[.,](\d{1,2})$'
)


def parse_time_to_centiseconds(time_str):
    """Convert a time string like '21.90', '1:05.24', '2:08.56' to centiseconds."""
    if not time_str:
        return 0
    time_str = time_str.strip()
    m = TIME_PATTERN.match(time_str)
    if not m:
        return 0
    minutes = int(m.group(1)) if m.group(1) else 0
    seconds = int(m.group(2))
    centis_str = m.group(3)
    # Handle both "21.9" (= 21.90) and "21.90"
    if len(centis_str) == 1:
        centis = int(centis_str) * 10
    else:
        centis = int(centis_str[:2])
    return minutes * 6000 + seconds * 100 + centis


def format_centiseconds(cs):
    """Convert centiseconds to display string."""
    if cs <= 0:
        return ''
    minutes = cs // 6000
    seconds = (cs % 6000) // 100
    centis = cs % 100
    if minutes:
        return f'{minutes}:{seconds:02d}.{centis:02d}'
    return f'{seconds}.{centis:02d}'


# --- Stroke / Event normalization ---

STROKE_MAP = {
    # English
    'freestyle': 'Freestyle', 'free': 'Freestyle',
    'backstroke': 'Backstroke', 'back': 'Backstroke',
    'breaststroke': 'Breaststroke', 'breast': 'Breaststroke',
    'butterfly': 'Butterfly', 'fly': 'Butterfly',
    'individual medley': 'Individual Medley', 'im': 'Individual Medley', 'medley': 'Individual Medley',
    # French
    'nage libre': 'Freestyle', 'libre': 'Freestyle', 'nl': 'Freestyle',
    'dos': 'Backstroke',
    'brasse': 'Breaststroke',
    'papillon': 'Butterfly', 'pap': 'Butterfly',
    '4 nages': 'Individual Medley', '4nages': 'Individual Medley',
    'quatre nages': 'Individual Medley',
}

RELAY_KEYWORDS = ['relay', 'relais', '4x', '4×', '4 x']


def normalize_stroke(text):
    """Normalize stroke name from various languages."""
    t = text.lower().strip()
    for key, val in STROKE_MAP.items():
        if key in t:
            return val
    return text.strip()


def is_relay_event(text):
    t = text.lower()
    return any(kw in t for kw in RELAY_KEYWORDS)


def extract_distance(text):
    """Extract distance in meters from event text."""
    m = re.search(r'(\d+)\s*m(?:eter|etre|ètre)?s?\b', text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # Try just a number before stroke words
    m = re.search(r'(\d+)\s*(?:libre|free|back|breast|fly|butter|dos|brasse|pap|nage)', text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return 0


def normalize_event_name(distance, stroke, is_relay=False):
    """Build a standardized event name."""
    if is_relay:
        legs = 4
        leg_dist = distance // legs if distance >= 200 else distance
        # For relays, use "Medley Relay" not "Individual Medley Relay"
        relay_stroke = stroke
        if stroke == 'Individual Medley':
            relay_stroke = 'Medley'
        return f'4x{leg_dist} M {relay_stroke} Relay'
    return f'{distance} M {stroke}'


# --- Age category translation ---

# French swimming age-categories → English tier names. Keyed on the
# UPPERCASE French word (singular and plural both listed).
CATEGORY_TRANSLATIONS = {
    'POUSSIN': 'Under 11',
    'POUSSINS': 'Under 11',
    'BENJAMIN': 'Youth',
    'BENJAMINS': 'Youth',
    'MINIME': 'Intermediate',
    'MINIMES': 'Intermediate',
    'CADET': 'Junior',
    'CADETS': 'Junior',
    'JUNIOR': 'Junior',
    'JUNIORS': 'Junior',
    'SENIOR': 'Senior',
    'SENIORS': 'Senior',
    'OPEN': 'Open',
    'TOUTES CATEGORIES': 'All Ages',
    'TOUTES CATÉGORIES': 'All Ages',
}


def normalize_category(label):
    """Translate a French age-category label to its English tier name.

    Handles combined labels like 'SENIORS/JUNIORS' or 'JUNIORS SENIORS'
    (→ 'Senior/Junior') and falls back to Title Case for anything unknown so
    no raw French ever reaches the database.
    """
    if not label:
        return ''
    raw = re.sub(r'\s+', ' ', label.replace('\xa0', ' ')).strip()
    if not raw:
        return ''
    key = raw.upper()
    if key in CATEGORY_TRANSLATIONS:
        return CATEGORY_TRANSLATIONS[key]
    tokens = [t for t in re.split(r'[\s/]+', key) if t]
    translated = []
    for t in tokens:
        if t not in CATEGORY_TRANSLATIONS:
            # Unknown token — don't guess, return the whole label title-cased.
            return raw.title()
        val = CATEGORY_TRANSLATIONS[t]
        if val not in translated:
            translated.append(val)
    return '/'.join(translated)


# --- Pool detection ---

# SCM indicators (multiple languages) — must be unambiguous pool descriptors
SCM_KEYWORDS = [
    'petit bassin', 'short course',
    'piscine 25', 'bassin 25', 'bassin de 25',
    '25m pool', '25 m pool', '25 metre pool', '25 meter pool',
    'حوض 25', 'حوض صغير',  # Arabic
]

# LCM indicators (multiple languages)
LCM_KEYWORDS = [
    'grand bassin', 'long course',
    'piscine 50', 'bassin 50', 'bassin de 50',
    '50m pool', '50 m pool', '50 metre pool', '50 meter pool',
    'olympic pool', 'piscine olympique',
    'حوض 50', 'حوض كبير',  # Arabic
]


def detect_pool(text, filename=''):
    """
    Detect pool type (SCM or LCM) from text content and/or filename.
    Checks multiple languages: English, French, Arabic.

    Priority:
    1. Filename hints (SCM, LCM) — most reliable, user explicitly named it
    2. Explicit keywords in text (petit bassin, short course, etc.)
    3. Event descriptions (SC Meter, LC Meter — HY-TEK format)
    4. Title line analysis ("25 M" as pool descriptor in header)
    5. Default to LCM if ambiguous
    """
    text_lower = text.lower()
    filename_lower = filename.lower()

    scm_score = 0
    lcm_score = 0

    # 1. Filename — strongest signal
    fname_parts = re.split(r'[.\-_ ]', filename_lower)
    if 'scm' in fname_parts:
        scm_score += 20
    if 'lcm' in fname_parts:
        lcm_score += 20

    # 2. Explicit pool keywords in text
    for kw in SCM_KEYWORDS:
        if kw in text_lower:
            scm_score += 15

    for kw in LCM_KEYWORDS:
        if kw in text_lower:
            lcm_score += 15

    # 3. HY-TEK "SC Meter" / "LC Meter" in event descriptions
    sc_meter_count = len(re.findall(r'\bSC\s+Met(?:er|re)', text, re.IGNORECASE))
    lc_meter_count = len(re.findall(r'\bLC\s+Met(?:er|re)', text, re.IGNORECASE))
    scm_score += sc_meter_count * 3
    lcm_score += lc_meter_count * 3

    # 4. Title/header analysis — only first ~200 chars, look for pool descriptor
    #    "25 M" in a title context (not an event like "50m Libre")
    header = text_lower[:300]
    #    Match "25 m" only when it looks like a pool descriptor, not an event distance
    if re.search(r'(?:bassin|pool|piscine|course).*25\s*m', header):
        scm_score += 10
    if re.search(r'(?:bassin|pool|piscine|course).*50\s*m', header):
        lcm_score += 10
    # Also "25 M" standalone in the title line (like "Championnat du Liban 25 M")
    if re.search(r'\b25\s*m\b', header) and not re.search(r'\d+m\s+(?:libre|dos|brasse|pap|nage|free|back)', header[:header.find('25 m')+10] if '25 m' in header else ''):
        scm_score += 8

    if scm_score > lcm_score:
        return 'SCM'
    elif lcm_score > scm_score:
        return 'LCM'
    return 'LCM'  # default


# --- Gender detection ---

MALE_KEYWORDS = ['messieurs', 'garçons', 'garcons', 'boys', 'men', 'male', 'homme']
FEMALE_KEYWORDS = ['dames', 'filles', 'girls', 'women', 'female', 'femme']


def detect_gender(text):
    t = text.lower()
    for kw in FEMALE_KEYWORDS:
        if kw in t:
            return 'F'
    for kw in MALE_KEYWORDS:
        if kw in t:
            return 'M'
    return ''


# --- Meet post-processing ---

def merge_duplicate_events(meet):
    """Merge fragmented events that share the same identity.

    PDF page breaks and two-column layouts repeat event headers, which makes
    parsers open a fresh ParsedEvent for the same (event, gender, round,
    category). Merging them restores one event per classement and also drops
    exact-duplicate result rows that come from re-extracted pages.
    """
    merged = {}
    seen_keys = {}
    order = []
    for ev in meet.events:
        key = (ev.event_name, ev.gender, ev.round_type, ev.age_group)
        if key not in merged:
            merged[key] = ev
            seen_keys[key] = set()
            order.append(ev)
        target = merged[key]
        seen = seen_keys[key]
        incoming = ev.results if ev is not target else list(ev.results)
        if ev is target:
            target.results = []
        for r in incoming:
            rkey = (r.swimmer_name.upper(), r.time_centiseconds, r.rank, r.status)
            if rkey not in seen:
                seen.add(rkey)
                target.results.append(r)
    meet.events = order
    return meet


def promote_lone_heats_to_finals(meet):
    """If an event never ran a Finals round, its lone Heats/Prelims round IS
    the final ranking, so relabel it Finals.

    Some federations publish single-round meets under a "Séries/Eliminatoires"
    heading (e.g. Tunisia Nat'2i summer championships): every swim decides the
    final classification, there is no separate finals session. A meet can't
    have heats without finals — heats only exist to qualify for a final.
    The same applies to results published with no round marker at all
    (single-session meets): they are the final classification.
    Grouped per (event_name, gender) so meets that DO run heats + finals for
    some events keep their real heats untouched.
    """
    groups = {}
    for ev in meet.events:
        groups.setdefault((ev.event_name, ev.gender), []).append(ev)
    for evs in groups.values():
        rounds = set()
        for ev in evs:
            for r in ev.results:
                rounds.add(r.round_type or ev.round_type or '')
        if 'Finals' in rounds:
            continue
        for ev in evs:
            if ev.round_type in ('Heats', 'Prelims', '', None):
                ev.round_type = 'Finals'
            for r in ev.results:
                if r.round_type in ('Heats', 'Prelims', '', None):
                    r.round_type = 'Finals'
    return meet


def clean_text(text):
    """Remove non-breaking spaces and collapse whitespace."""
    if not text:
        return ''
    text = text.replace('\xa0', ' ').replace('&nbsp;', ' ')
    return re.sub(r'\s+', ' ', text).strip()


def to_iso_date(date_text):
    """Normalize a DD/MM/YYYY-style date string to YYYY-MM-DD.
    Returns the input unchanged if it is already ISO or unparseable."""
    if not date_text:
        return ''
    date_text = date_text.strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_text):
        return date_text
    m = re.search(r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})', date_text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f'{year:04d}-{month:02d}-{day:02d}'
    return date_text


# --- Name normalization ---

def normalize_name(name, comma_order='first_last'):
    """Normalize swimmer name.
    Output format: Firstname LASTNAME (first name title case, last name all caps).

    comma_order controls how comma-separated names are interpreted:
      'first_last' — "First, Last" (HY-TEK Lebanon format: "Adam, Hmedeh")
      'last_first' — "LAST, First" (Splash/international format: "ALZAMIL, ALI")
    """
    name = name.strip()
    # Remove non-breaking spaces
    name = name.replace('\xa0', ' ').replace('&nbsp;', ' ')
    # Collapse multiple spaces
    name = re.sub(r'\s+', ' ', name)
    # Remove leading/trailing dots or commas
    name = name.strip('.,')
    name = name.strip()

    if not name:
        return name

    if ',' in name:
        parts = name.split(',', 1)
        if comma_order == 'last_first':
            # "ALZAMIL, ALI" → "Ali ALZAMIL"
            last = parts[0].strip().upper()
            first = parts[1].strip().title()
        else:
            # "Adam, Hmedeh" → "Adam HMEDEH"
            first = parts[0].strip().title()
            last = parts[1].strip().upper()
        return f'{first} {last}'.strip()

    # No comma — return cleaned as-is
    return name
