"""Parse a meet bulletin/program PDF to extract which events run on which day.

Bulletins come in many formats and languages (English, French, Arabic).
Common patterns:
  - "Day 1 / Jour 1 / Journée 1" headers followed by event names
  - "Session 1 - Morning / Séries" + "Session 2 - Finals / Finales"
  - Date headers "Monday 27 July" / "Lundi 27 Juillet"
  - Tables with day columns

Returns a list of {day, event_name, gender, session} dicts.
"""
import re
import pdfplumber
from datetime import date

# Day/session markers in multiple languages
DAY_PATTERNS = [
    re.compile(r'(?:day|jour(?:n[ée]e)?|يوم)\s*(\d+)', re.IGNORECASE),
    re.compile(r'(?:session)\s*(\d+)', re.IGNORECASE),
]

# Date patterns
# Weekday-prefixed section headers like "Lundi 27 Juillet 2026" or the
# FRMN/FRTN programme style "Jeudi - 30 Juillet 2026" (note the " - "
# between weekday and date). These are the authoritative per-day delimiters.
WEEKDAY_DATE = re.compile(
    r'(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
    r'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*[-–]?\s*'
    r'(\d{1,2})\s+(\w+)\s+(\d{4})', re.IGNORECASE)
# Bare numeric date DD/MM/YYYY — only trusted when the document has NO
# weekday headers, because programmes repeat a meet-date-range header (and a
# generation timestamp) on every page that would otherwise pin every event
# to day 1.
NUMERIC_DATE = re.compile(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})')
# Event order index printed after the title, e.g. "... Messieurs (7)".
ORDER_PATTERN = re.compile(r'\((\d{1,2})\)\s*$')

# Month names (English + French)
MONTHS = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5,
    'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10,
    'november': 11, 'december': 12,
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
    'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
    'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
    'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}

# Session detection
HEATS_KEYWORDS = re.compile(r'\b(?:heats?|séries?|series|prelim|morning|matin|تصفيات)\b', re.IGNORECASE)
FINALS_KEYWORDS = re.compile(r'\b(?:final[es]?|evening|soir|نهائي)\b', re.IGNORECASE)

# Session period (morning vs afternoon/evening) — distinct from the
# HEATS/FINALS round. Programmes mark it as "MATIN A 09H30" / "APRES MIDI A 17H00".
MORNING_KEYWORDS = re.compile(r'\b(?:matin|morning|صباح)\b', re.IGNORECASE)
EVENING_KEYWORDS = re.compile(
    r'(?:apr[eè]s\s*[- ]?\s*midi|afternoon|\bsoir\w*\b|\bevening\b|مساء)',
    re.IGNORECASE)

# Event patterns (swimming events)
EVENT_PATTERN = re.compile(
    r'(\d+(?:\s*x\s*\d+)?)\s*m?\s*'  # distance
    r'(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|'
    r'individual\s+medley|medley|im|'
    r'nage\s+libre|dos|brasse|papillon|4?\s*nages|'
    r'سباحة\s+حرة|ظهر|صدر|فراشة)',
    re.IGNORECASE
)

GENDER_PATTERN = re.compile(
    r'\b(men|women|male|female|boys?|girls?|'
    r'messieurs|dames|hommes|femmes|garçons|filles|'
    r'رجال|سيدات)\b',
    re.IGNORECASE
)


def _detect_gender(text):
    m = GENDER_PATTERN.search(text)
    if not m:
        return ''
    w = m.group(1).lower()
    if w in ('women', 'female', 'girls', 'girl', 'dames', 'femmes', 'filles', 'سيدات'):
        return 'F'
    return 'M'


def _detect_session(text):
    if FINALS_KEYWORDS.search(text):
        return 'FINALS'
    if HEATS_KEYWORDS.search(text):
        return 'HEATS'
    return ''


def _detect_time_of_day(text):
    if EVENING_KEYWORDS.search(text):
        return 'EVENING'
    if MORNING_KEYWORDS.search(text):
        return 'MORNING'
    return ''


def _parse_date_to_iso(match, meet_start=None):
    groups = match.groups()
    if len(groups) == 3:
        try:
            d, m, y = groups
            if m.isdigit():
                return date(int(y), int(m), int(d))
            month = MONTHS.get(m.lower().strip('.'), 0)
            if month:
                return date(int(y), month, int(d))
        except (ValueError, TypeError):
            pass
    return None


def parse_bulletin(file_path, meet_start_date=None):
    """Parse a bulletin PDF and return program items.
    
    Returns list of {day, event_name, gender, session} dicts.
    """
    with pdfplumber.open(file_path) as pdf:
        text = '\n'.join(p.extract_text() or '' for p in pdf.pages)

    lines = text.split('\n')
    items = []
    current_day = 1
    current_session = ''
    current_time_of_day = ''
    current_date = None

    # When the document uses weekday section headers ("Jeudi - 30 Juillet
    # 2026"), those are the authoritative day delimiters; ignore bare numeric
    # dates so the meet-range/timestamp header repeated on every page can't
    # reset every event back to day 1.
    has_weekday = any(WEEKDAY_DATE.search(l) for l in lines)

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check for day markers
        for pat in DAY_PATTERNS:
            dm = pat.search(line)
            if dm:
                current_day = int(dm.group(1))
                # Also check session on same line
                s = _detect_session(line)
                if s:
                    current_session = s
                break

        # Weekday-prefixed section header = authoritative day marker.
        wm = WEEKDAY_DATE.search(line)
        if wm:
            d = _parse_date_to_iso(wm, meet_start_date)
            if d:
                current_date = d
                if meet_start_date:
                    day_num = (d - meet_start_date).days + 1
                    if 1 <= day_num <= 30:
                        current_day = day_num
            tod = _detect_time_of_day(line)
            if tod:
                current_time_of_day = tod
            continue
        # Bare numeric date — only when no weekday headers anchor the days.
        elif not has_weekday:
            nm = NUMERIC_DATE.search(line)
            if nm:
                d = _parse_date_to_iso(nm, meet_start_date)
                if d and meet_start_date:
                    day_num = (d - meet_start_date).days + 1
                    if 1 <= day_num <= 30:
                        current_day = day_num
                        current_date = d
                elif d:
                    current_date = d
                s = _detect_session(line)
                if s:
                    current_session = s

        # Check for session-period markers (morning / afternoon)
        tod = _detect_time_of_day(line)
        if tod and not EVENT_PATTERN.search(line):
            current_time_of_day = tod

        # Check for round markers (heats / finals)
        s = _detect_session(line)
        if s and not EVENT_PATTERN.search(line):
            current_session = s
            continue

        # Check for events
        em = EVENT_PATTERN.search(line)
        if em:
            gender = _detect_gender(line)
            om = ORDER_PATTERN.search(line)
            items.append({
                'day': current_day,
                'event_text': line,
                'distance': em.group(1),
                'stroke': em.group(2),
                'gender': gender,
                'session': current_session or _detect_session(line),
                'time_of_day': current_time_of_day,
                'order': int(om.group(1)) if om else None,
            })

    return items
