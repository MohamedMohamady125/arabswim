"""
Parser for FFN-extraNat PDF format (French Swimming Federation).

Format characteristics:
  - Header: "Championnats de France Elite - SAINT-ÉTIENNE (FRA)"
  - Date line: "Du Samedi 27 Juin au Jeudi 2 Juillet 2026 - Bassin de : 50 m."
  - Event headers: "50 Nage Libre Dames - Finale A (Mercredi 1er Juillet 2026)"
  - Result lines: "1 MOLUMary-Ambre (2005) FRA U.S CRETEIL NATATION 00:24.68 1331 pts"
  - Split lines: "50m : 00:25.77 (00:25.77) 100m : 00:53.96 (00:28.19)"
  - DNS/DQ lines: "--- BESSARD Maeline (2008) FRA GRENOBLE ALP'38 DNS dec"
  - Footer: "Copyright © 2019 FFN-extraNat."
"""
import re
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, detect_gender,
    normalize_event_name, extract_distance, is_relay_event,
    merge_duplicate_events,
)

# Event header: "50 Nage Libre Dames - Finale A (Mercredi 1er Juillet 2026)"
# Also: "50 Nage Libre Dames - Séries (suite)"
EVENT_HEADER = re.compile(
    r'^(\d+(?:\s*x\s*\d+)?)\s+'          # distance (50, 100, 4 x 100, etc.)
    r'(.+?)\s+'                            # stroke (Nage Libre, Dos, Papillon, etc.)
    r'(Dames|Messieurs|Mixte)\s*'          # gender
    r'-\s*'
    r'(Finale\s*[A-Z]?|Séries|Demi-Finales?|Barrage\s+Finales?)'  # round
    r'(?:\s*\(suite\))?'                   # optional "(suite)" continuation
    r'(?:\s*\(.*?\))?',                    # optional date in parens
    re.IGNORECASE
)

# Result line: rank, name (year) NAT_CODE, club, time, points
# "1 MOLUMary-Ambre (2005) FRA U.S CRETEIL NATATION 00:24.68 1331 pts"
# "--- BESSARD Maeline (2008) FRA GRENOBLE ALP'38 DNS dec"
# OCR variants: "FR A" (space in code), "(200N5)" (letter in year)
RESULT_LINE = re.compile(
    r'^(\d+|---)\s+'                       # rank or ---
    r'(.+?)\s+'                            # name
    r'\((\d[\d\w]{3})\)\s+'                # birth year (may have OCR letter e.g. 200N5)
    r'([A-Z]{2,3}(?:\s+[A-Z])?)\s+'       # nationality code (may have space: "FR A")
    r'(.+?)\s+'                            # club
    r'(\d{2}:\d{2}\.\d{2}|DNS\s*\w*|DQ\s*\w*|DNF\s*\w*|DSQ\s*\w*|Forfait)'  # time or status
    r'(?:\s*(\d+)\s*pts)?'                 # optional FINA points
)

# Split line: "50m : 00:25.77 (00:25.77) 100m : 00:53.96 (00:28.19)"
SPLIT_LINE = re.compile(r'^\d+m\s*:\s*\d{2}:\d{2}\.\d{2}')

# Header date: "Du Samedi 27 Juin au Jeudi 2 Juillet 2026 - Bassin de : 50 m."
DATE_LINE = re.compile(
    r'Du\s+\w+\s+(\d{1,2})\s+(\w+)'       # start day + month
    r'(?:\s+au\s+\w+\s+(\d{1,2})\s+(\w+))?' # optional end day + month
    r'\s+(\d{4})'                          # year
    r'\s*-\s*Bassin\s+de\s*:\s*(\d+)\s*m', # pool size
    re.IGNORECASE
)

FRENCH_MONTHS = {
    'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
    'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12,
}

# French stroke names to standard
STROKE_MAP = {
    'nage libre': 'Freestyle',
    'dos': 'Backstroke',
    'brasse': 'Breaststroke',
    'papillon': 'Butterfly',
    '4 nages': 'Individual Medley',
    'nages': 'Individual Medley',
}


def detect_format(text):
    """Check if this text is FFN-extraNat format."""
    lower = text.lower()
    return 'ffn-extranat' in lower or (
        'bassin de' in lower and 'pts' in lower and
        ('nage libre' in lower or 'papillon' in lower or 'dos ' in lower or 'brasse' in lower)
    )


def _parse_french_stroke(text):
    """Convert French stroke name to standard English."""
    t = text.strip().lower()
    for french, english in STROKE_MAP.items():
        if french in t:
            return english
    return normalize_stroke(text)


def _parse_round(text):
    """Convert FFN round label to standard."""
    t = text.strip().lower()
    if 'finale' in t:
        return 'Finals'
    if 'demi' in t:
        return 'Semifinals'
    if 'série' in t or 'serie' in t:
        return 'Prelims'
    return ''


def _clean_ocr_time(time_str):
    """Clean OCR artifacts from time strings (stray letters inserted by watermark)."""
    # Remove single stray letters that appear mid-time due to PDF watermark overlay
    # e.g. "00:25.02s1305" → "00:25.02", "0t0:25.53" → "00:25.53"
    # First, fix times where a letter is inserted inside the time
    cleaned = re.sub(r'(?<=\d)[a-z](?=\d)', '', time_str, flags=re.IGNORECASE)
    # Fix "00:25.02s1305" → extract just the time part
    m = re.match(r'(\d{2}:\d{2}\.\d{2})', cleaned)
    if m:
        return m.group(1)
    return cleaned


def _parse_split_line(line):
    """Extract split times from a split line."""
    splits = []
    for m in re.finditer(r'(\d+)m\s*:\s*(\d{2}:\d{2}\.\d{2})', line):
        splits.append(f"{m.group(1)}m: {m.group(2)}")
    return splits


def parse(text):
    """Parse FFN-extraNat PDF text into a ParsedMeet."""
    lines = text.split('\n')
    meet = ParsedMeet(source_format='ffn')

    # Extract meet name from first meaningful line
    for line in lines[:5]:
        line = line.strip()
        if line and 'copyright' not in line.lower() and 'titre' not in line.lower():
            if 'bassin' not in line.lower() and 'note' not in line.lower():
                meet.meet_name = line
                # Extract location from "NAME - CITY (COUNTRY)"
                loc_m = re.search(r'-\s*(.+?)\s*\((\w{3})\)\s*$', line)
                if loc_m:
                    meet.location = loc_m.group(1).strip()
                break

    # Extract date and pool from header
    for line in lines[:10]:
        dm = DATE_LINE.search(line)
        if dm:
            day = int(dm.group(1))
            month_name = dm.group(2).lower()
            year = int(dm.group(5))
            pool_size = int(dm.group(6))
            month = FRENCH_MONTHS.get(month_name, 1)
            meet.date_text = f'{year}-{month:02d}-{day:02d}'
            meet.pool = 'LCM' if pool_size >= 50 else 'SCM'

            # End date if present
            if dm.group(3) and dm.group(4):
                end_day = int(dm.group(3))
                end_month_name = dm.group(4).lower()
                end_month = FRENCH_MONTHS.get(end_month_name, month)
                meet.date_end = f'{year}-{end_month:02d}-{end_day:02d}'
            break

    current_event = None
    last_result = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        # Skip headers, footers, page numbers
        if (line.startswith('Championnats') or line.startswith('Titre') or
                line.startswith('Du ') or line.startswith('Note') or
                line.startswith('Copyright') or line.startswith('Page ')):
            continue

        # Clean watermark artifacts from event headers and result lines.
        # "S-éries" → "Séries" (hyphen within a word, no spaces)
        cleaned_line = re.sub(r'(?<=[A-Za-zÀ-ÿ])-(?=[a-zà-ÿ])', '', line)
        # Remove stray uppercase letter inserted WITHIN a lowercase word:
        # "PaFpillon" → "Papillon" (lowercase-UPPER-lowercase = stray)
        cleaned_line = re.sub(r'(?<=[a-z])[A-Z](?=[a-z])', '', cleaned_line)
        # "Do F s" → "Dos": stray uppercase+space between lowercase chars
        cleaned_line = re.sub(r'(?<=[a-z])\s+[A-Z]\s+(?=[a-z])', '', cleaned_line)
        # Remove trailing stray lowercase letter: "...2026) a" → "...2026)"
        cleaned_line = re.sub(r'\s+[a-zà-ÿ]\s*$', '', cleaned_line)
        # Fix known mangled French swimming terms
        cleaned_line = re.sub(r'\bD\s+ames\b', 'Dames', cleaned_line)
        cleaned_line = re.sub(r'\bM\s+essieurs\b', 'Messieurs', cleaned_line)

        # Check for event header
        em = EVENT_HEADER.match(cleaned_line)
        if em:
            distance_text = em.group(1)
            stroke_text = em.group(2)
            gender_text = em.group(3)
            round_text = em.group(4)

            is_relay = 'x' in distance_text.lower()
            # For "200 4 Nages", distance_text is "200" and stroke_text is "4 Nages"
            # extract_distance would wrongly pick up "4" — use distance_text directly
            try:
                distance = int(re.sub(r'[^\d]', '', distance_text))
            except ValueError:
                distance = extract_distance(distance_text + ' ' + stroke_text)
            stroke = _parse_french_stroke(stroke_text)
            gender = 'F' if 'dames' in gender_text.lower() else (
                'X' if 'mixte' in gender_text.lower() else 'M'
            )
            round_type = _parse_round(round_text)
            event_name = normalize_event_name(distance, stroke, is_relay)

            current_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=round_type,
            )
            meet.events.append(current_event)
            last_result = None
            continue

        # Check for split line (belongs to previous result)
        if SPLIT_LINE.match(line) and last_result:
            splits = _parse_split_line(line)
            last_result.split_times.extend(splits)
            continue

        # Check for result line
        if not current_event:
            continue

        rm = RESULT_LINE.match(cleaned_line)
        if rm:
            rank_str = rm.group(1)
            name = rm.group(2).strip()
            birth_year_raw = rm.group(3)
            nat_code = rm.group(4).replace(' ', '')  # "FR A" → "FRA"
            club = rm.group(5).strip()
            time_raw = rm.group(6).strip()
            fina_str = rm.group(7)

            # Clean OCR artifacts from birth year: "200N5" → "2005"
            birth_year_clean = re.sub(r'[A-Za-z]', '', birth_year_raw)
            try:
                birth_year = int(birth_year_clean)
            except ValueError:
                birth_year = 0

            # Clean OCR artifacts from name (stray watermark letters)
            name = re.sub(r'(?<=[a-z])\s+(?=[a-z])', '', name)

            # Determine status
            status = 'OK'
            time_text = ''
            time_cs = 0

            if time_raw.upper().startswith('DNS') or time_raw.upper().startswith('FORFAIT'):
                status = 'DNS'
            elif time_raw.upper().startswith('DQ') or time_raw.upper().startswith('DSQ'):
                status = 'DQ'
            elif time_raw.upper().startswith('DNF'):
                status = 'DNF'
            else:
                time_text = _clean_ocr_time(time_raw)
                time_cs = parse_time_to_centiseconds(time_text)

            rank = int(rank_str) if rank_str != '---' else 0
            fina_points = int(fina_str) if fina_str else 0

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
                status=status,
            )
            current_event.results.append(result)
            last_result = result
            continue

    # Remove events with no results
    meet.events = [e for e in meet.events if e.results]

    # Merge duplicate events (same event name + round)
    merge_duplicate_events(meet)

    return meet
