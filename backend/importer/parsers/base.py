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


def _iso(day, month, year):
    """Format a validated date as YYYY-MM-DD, or '' if invalid."""
    if 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100:
        return f'{year:04d}-{month:02d}-{day:02d}'
    return ''


# Explicit range: "DD/MM/YYYY to DD/MM/YYYY" (connectors: to, ¤, –, -)
_FULL_RANGE_RE = re.compile(
    r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})'
    r'\s*(?:to|¤|–|-)\s*'
    r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})'
)
# Compact day range: "19 - 22/1/2022" or "19–22/1/2022"
# (?<!\d) prevents matching "2025 - 09/..." where "25" comes from a year.
_DAY_RANGE_RE = re.compile(
    r'(?<!\d)(\d{1,2})\s*[-–]\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})'
)
# Compact slash range: "20/21-04-2024" (day/day-month-year)
_SLASH_RANGE_RE = re.compile(
    r'(\d{1,2})/(\d{1,2})-(\d{2})-(\d{4})'
)
# Month names (English + French) → month number
_MONTH_NAMES = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5,
    'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10,
    'november': 11, 'december': 12,
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
    'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
    'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12,
    'decembre': 12,
    # Abbreviations
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
    'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}
_MONTH_NAME_RE = re.compile(
    r'(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s+'
    r'(' + '|'.join(_MONTH_NAMES) + r')\.?'
    r'(?:\s*,?\s*(\d{4}))?',
    re.IGNORECASE,
)


def extract_date_and_location(text):
    """
    Extract date(s) and location from a messy text string.
    Returns (start_date_str, end_date_str, location).
    Date strings are in YYYY-MM-DD format for HTML date inputs.

    Priority order:
    1. Explicit range: "DD/MM/YYYY to DD/MM/YYYY" (or ¤, –, -)
    2. Day range: "19 - 22/1/2022"
    3. Compact slash: "20/21-04-2024"
    4. Month-name dates: "28-31 August 2025", "25 Mars 2024"
    5. Individual dates: first DD/MM/YYYY found (NOT last — avoids
       picking up record dates from subsequent lines).
    """
    if not text:
        return '', '', ''

    start_date = ''
    end_date = ''

    # --- 1. Explicit full range: "DD/MM/YYYY to DD/MM/YYYY" ---
    rm = _FULL_RANGE_RE.search(text)
    if rm:
        start_date = _iso(int(rm.group(1)), int(rm.group(2)), int(rm.group(3)))
        end_date = _iso(int(rm.group(4)), int(rm.group(5)), int(rm.group(6)))

    # --- 2. Day range: "19 - 22/1/2022" ---
    if not start_date:
        rm = _DAY_RANGE_RE.search(text)
        if rm:
            start_day, end_day = int(rm.group(1)), int(rm.group(2))
            month, year = int(rm.group(3)), int(rm.group(4))
            start_date = _iso(start_day, month, year)
            end_date = _iso(end_day, month, year)

    # --- 3. Compact slash: "20/21-04-2024" ---
    if not start_date:
        rm = _SLASH_RANGE_RE.search(text)
        if rm:
            d1, d2 = int(rm.group(1)), int(rm.group(2))
            month, year = int(rm.group(3)), int(rm.group(4))
            start_date = _iso(d1, month, year)
            end_date = _iso(d2, month, year)

    # --- 4. Month-name dates: "28 August 2025" or "28-31 August 2025" ---
    if not start_date:
        mm = _MONTH_NAME_RE.search(text)
        if mm:
            month = _MONTH_NAMES[mm.group(3).lower().rstrip('.')]
            year_str = mm.group(4)
            # If no year in the match, look for a 4-digit year nearby
            if not year_str:
                yr_m = re.search(r'(\d{4})', text)
                year_str = yr_m.group(1) if yr_m else ''
            if year_str:
                year = int(year_str)
                start_date = _iso(int(mm.group(1)), month, year)
                if mm.group(2):
                    end_date = _iso(int(mm.group(2)), month, year)

    # --- 5. Fallback: first individual DD/MM/YYYY date ---
    if not start_date:
        for m in DATE_PATTERN.finditer(text):
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            iso = _iso(day, month, year)
            if iso:
                start_date = iso
                break  # only the FIRST date — don't grab record dates

    # --- Extract location: strip dates, keywords, and clean up ---
    loc_text = text
    loc_text = _FULL_RANGE_RE.sub('', loc_text)
    loc_text = DATE_PATTERN.sub('', loc_text)
    loc_text = _MONTH_NAME_RE.sub('', loc_text)
    loc_text = re.sub(r'(?<!\d)\d{1,2}\s*[-–]\s*(?=\s)', '', loc_text)
    for kw in STRIP_KEYWORDS:
        loc_text = re.sub(re.escape(kw), '', loc_text, flags=re.IGNORECASE)
    loc_text = re.sub(r'\b(to|¤)\b', '', loc_text)
    loc_text = re.sub(r'\b(25|50)\s*M\b', '', loc_text, flags=re.IGNORECASE)
    loc_text = re.sub(r'\s*[-–,]\s*$', '', loc_text)
    loc_text = re.sub(r'^\s*[-–,]\s*', '', loc_text)
    loc_text = re.sub(r'\s*[-–]\s*[-–]\s*', ' - ', loc_text)
    loc_text = re.sub(r'\s*[-–,]\s*$', '', loc_text)
    loc_text = re.sub(r'^\s*[-–,]\s*', '', loc_text)
    loc_text = re.sub(r'\s+', ' ', loc_text).strip()
    loc_text = re.sub(r'[,\s]+$', '', loc_text)
    loc_text = re.sub(r'^[,\s]+', '', loc_text)

    return start_date, end_date, loc_text


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
    # PDF extraction sometimes injects spaces ('4 na ges'): retry the
    # multi-word keys with all whitespace squashed out.
    squashed = re.sub(r'\s+', '', t)
    for key, val in STROKE_MAP.items():
        if ' ' in key and key.replace(' ', '') in squashed:
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


# --- Age category normalization ---

# French swimming age-categories are kept in French (per federation request —
# e.g. Morocco FRMN uses Seniors/Juniors, Cadets, Minimes, Benjamins).
# Keyed on the UPPERCASE label (singular and plural both listed), each maps
# to the canonical French display form.
CATEGORY_CANONICAL = {
    'POUSSIN': 'Poussins',
    'POUSSINS': 'Poussins',
    'BENJAMIN': 'Benjamins',
    'BENJAMINS': 'Benjamins',
    'MINIME': 'Minimes',
    'MINIMES': 'Minimes',
    'CADET': 'Cadets',
    'CADETS': 'Cadets',
    'JUNIOR': 'Juniors',
    'JUNIORS': 'Juniors',
    'SENIOR': 'Seniors',
    'SENIORS': 'Seniors',
    'OPEN': 'Open',
    'TOUTES CATEGORIES': 'Toutes Catégories',
    'TOUTES CATÉGORIES': 'Toutes Catégories',
}

# Oldest → youngest. Combined labels ('SENIORS/JUNIORS', 'JUNIORS SENIORS')
# are always emitted in this order → 'Seniors/Juniors'; the same order is
# used to sort categories for display (matches the source PDFs).
CATEGORY_SENIORITY = [
    'Open', 'Toutes Catégories', 'Seniors', 'Juniors',
    'Cadets', 'Minimes', 'Benjamins', 'Poussins',
]


def normalize_category(label):
    """Normalize an age-category label to its canonical French form.

    Category names stay in French as they appear in federation PDFs
    (Seniors/Juniors, Cadets, Minimes, Benjamins...). Combined labels like
    'SENIORS/JUNIORS' or 'JUNIORS SENIORS' become 'Seniors/Juniors'
    (oldest first). Unknown labels fall back to Title Case.
    """
    if not label:
        return ''
    raw = re.sub(r'\s+', ' ', label.replace('\xa0', ' ')).strip()
    if not raw:
        return ''
    key = raw.upper()
    if key in CATEGORY_CANONICAL:
        return CATEGORY_CANONICAL[key]
    tokens = [t for t in re.split(r'[\s/]+', key) if t]
    canonical = []
    for t in tokens:
        if t not in CATEGORY_CANONICAL:
            # Unknown token — don't guess, return the whole label title-cased.
            return raw.title()
        val = CATEGORY_CANONICAL[t]
        if val not in canonical:
            canonical.append(val)
    canonical.sort(key=lambda v: CATEGORY_SENIORITY.index(v))
    return '/'.join(canonical)


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


def drop_general_duplicate_results(meet):
    """Drop overall-classification rows that duplicate age-category rows.

    Splash meets often print heats twice: once as an overall ranking
    ("Cat. générale" → age_group '') and once per age category. Importing
    both duplicates every swim in the swimmer profile. Within each
    (event, gender, round), remove a no-category result when the exact same
    swim (name + time) also appears under a specific age category. Rows
    unique to the overall list (e.g. unclassified swimmers) are kept.
    """
    groups = {}
    emptied = set()
    for ev in meet.events:
        groups.setdefault((ev.event_name, ev.gender, ev.round_type), []).append(ev)
    for evs in groups.values():
        aged_keys = set()
        for ev in evs:
            if ev.age_group:
                for r in ev.results:
                    aged_keys.add((r.swimmer_name.upper(), r.time_centiseconds))
        if not aged_keys:
            continue
        for ev in evs:
            if not ev.age_group and ev.results:
                ev.results = [
                    r for r in ev.results
                    if (r.swimmer_name.upper(), r.time_centiseconds) not in aged_keys
                ]
                if not ev.results:
                    emptied.add(id(ev))
    meet.events = [ev for ev in meet.events if id(ev) not in emptied]
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


def drop_heats_if_finals_exist(meet):
    """Drop heats only when they are exact duplicates of the finals.

    Some PDF formats list both "Heats" and "Finals" for the same event
    with identical swimmers and times — those heats are artifacts and
    should be dropped.  Genuinely different rounds (different swimmers
    or times) are kept so both rounds appear on the site.

    A heats event is considered a duplicate when >=80% of its results
    match a finals result (same swimmer name AND same time).
    """
    groups = {}
    for ev in meet.events:
        groups.setdefault((ev.event_name, ev.gender), []).append(ev)
    drop = set()
    for evs in groups.values():
        finals_evs = [ev for ev in evs if ev.round_type == 'Finals' and ev.results]
        if not finals_evs:
            continue
        # Collect all finals swimmer+time pairs
        finals_keys = set()
        for fev in finals_evs:
            for r in fev.results:
                finals_keys.add((r.swimmer_name, r.time_centiseconds))
        for ev in evs:
            if ev.round_type not in ('Heats', 'Prelims', 'Semis'):
                continue
            if not ev.results:
                drop.add(id(ev))
                continue
            # Check how many heats results duplicate a finals result
            dupes = sum(
                1 for r in ev.results
                if (r.swimmer_name, r.time_centiseconds) in finals_keys
            )
            if dupes / len(ev.results) >= 0.8:
                drop.add(id(ev))
    meet.events = [ev for ev in meet.events if id(ev) not in drop]
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
