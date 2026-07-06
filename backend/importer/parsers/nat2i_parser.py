"""
Parser for Nat'2i HTML format.
Used by: Tunisia championships.
Identified by: "Nat'2i" in HTML source or table-based HTML with Place/Nom/Nation/Naissance/Club/Temps columns.

Format: HTML tables with 8 columns:
  Place | Nom et prénom | Nation | Naissance | Club | Temps | Points | Temps de passage
Event headers are in <a name="XX"> anchors with stroke/distance info.
"""
import re
from bs4 import BeautifulSoup
from .base import (
    ParsedResult, ParsedEvent, ParsedMeet,
    parse_time_to_centiseconds, normalize_stroke, detect_gender,
    normalize_name, is_relay_event, normalize_event_name, extract_distance,
    normalize_category, clean_text,
)


# Event title pattern: "100 m DOS Dames Classement" or "50 m NAGE LIBRE Messieurs"
EVENT_TITLE = re.compile(
    r'(\d+)\s*m\s+(.+?)\s+(Dames|Messieurs|Filles|Garçons|Garcons)\s*(?:Classement)?',
    re.IGNORECASE
)

# Relay event: "4x100 m NAGE LIBRE Dames" or "4x50 m NAGE LIBRE Mixte"
RELAY_TITLE = re.compile(
    r'(\d+)\s*x\s*(\d+)\s*m\s+(.+?)\s+(Dames|Messieurs|Mixte|Filles|Garçons|Garcons)',
    re.IGNORECASE
)

# Age-category sub-headers appear in dark red (#C00000) directly under the event
# title in multi-category meets, e.g. "JUNIORS SENIORS", "CADETS", "MINIMES".
CATEGORY_COLOR = re.compile(r'C0{2}00', re.IGNORECASE)  # matches #C00000


def _detect_category(p_element, text):
    """Return the age-category label if this <p> is a category sub-header.

    In multi-category Tunisia meets each event is split into several classements
    (one per age category), announced by a short dark-red (#C00000) heading right
    under the event title. Returns '' when the paragraph is not such a header.
    """
    font = p_element.find('font', attrs={'color': CATEGORY_COLOR})
    if not font:
        return ''
    t = (text or '').replace('\xa0', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    # Real category labels are short and contain no digits (dates/meet titles do).
    if not t or len(t) > 40 or any(ch.isdigit() for ch in t):
        return ''
    low = t.lower()
    if any(kw in low for kw in ('championnat', 'coupe', 'compétition', 'competition', 'programme')):
        return ''
    return normalize_category(t)


def _sibling_event(event, category):
    """Create a new ParsedEvent that shares an event's identity but a new category."""
    return ParsedEvent(
        event_name=event.event_name,
        distance=event.distance,
        stroke=event.stroke,
        gender=event.gender,
        age_group=category,
    )


def _nat2i_normalize_name(name):
    """Normalize Nat'2i name format: 'LASTNAME Firstname' → 'Firstname LASTNAME'.

    Tunisia writes names as UPPERCASE last name followed by title-case first name:
    'ISSA Lina' → 'Lina ISSA'
    'BEN AHMED Yasmine' → 'Yasmine BEN AHMED'
    'DOUMA Fatma Ezzahra' → 'Fatma Ezzahra DOUMA'
    """
    name = name.strip()
    name = name.replace('\xa0', ' ')
    name = re.sub(r'\s+', ' ', name).strip()
    if not name:
        return name

    # If comma-separated, use standard last_first handling
    if ',' in name:
        return normalize_name(name, comma_order='last_first')

    # Split into words and find where uppercase (last name) ends
    # and title-case (first name) begins
    words = name.split()
    last_parts = []
    first_parts = []

    for i, word in enumerate(words):
        # Uppercase words (2+ chars) at the start = last name
        if word.isupper() and len(word) > 1:
            last_parts.append(word)
        else:
            # Everything from here on is first name
            first_parts = words[i:]
            break

    if last_parts and first_parts:
        last = ' '.join(last_parts).upper()
        first = ' '.join(first_parts).title()
        return f'{first} {last}'

    # Fallback: return as-is
    return name


def detect_format(text):
    """Check if this is Nat'2i HTML format."""
    t = text.lower()
    return "nat'2i" in t or ('place' in t and 'nom' in t and 'naissance' in t and '<table' in t)


def parse(html_content):
    """Parse Nat'2i HTML content into ParsedMeet."""
    from .base import extract_date_and_location

    soup = BeautifulSoup(html_content, 'html.parser')
    meet = ParsedMeet(source_format='nat2i')

    # Extract meet info from title or first colored paragraph
    # Tunisia format: "CHAMPIONNAT D'ÉTÉ DE TUNISIE BENJAMINS - RADES - Grand bassin - 25/07/2024 – 27/07/2024"
    raw_title = ''
    title_tag = soup.find('title')
    if title_tag:
        raw_title = title_tag.get_text(strip=True)

    for p in soup.find_all('p', limit=5):
        text = p.get_text(strip=True)
        if text and ('championnat' in text.lower() or 'compétition' in text.lower()):
            raw_title = text
            break

    if raw_title:
        raw_title = clean_text(raw_title)
        # Title format: "CHAMPIONNAT D'ÉTÉ DE TUNISIE BENJAMINS - RADES - Grand bassin - 25/07/2024 ¤ 27/07/2024"
        # Split by " - " and classify each part
        parts = [p.strip() for p in re.split(r'\s*[-–]\s*', raw_title) if p.strip()]

        name_parts = []
        location_parts = []
        for part in parts:
            part_lower = part.lower()
            # Skip pool info
            if 'petit bassin' in part_lower or 'grand bassin' in part_lower:
                continue
            # Skip date parts (contains dates or date separators like ¤)
            if re.search(r'\d{1,2}/\d{1,2}/\d{4}', part) or '¤' in part:
                continue
            # Short words that look like city/venue = location (often uppercase)
            if len(part) < 30 and not any(c.isdigit() for c in part) and not any(kw in part_lower for kw in ['championnat', 'coupe', 'natation', 'été', 'hiver']):
                location_parts.append(part)
            else:
                name_parts.append(part)

        meet.meet_name = ' - '.join(name_parts) if name_parts else raw_title
        meet.location = ', '.join(location_parts) if location_parts else ''

        # Extract dates from original title
        start_date, end_date, _ = extract_date_and_location(raw_title)
        meet.date_text = start_date
        if end_date:
            meet.date_end = end_date

    if not meet.pool:
        full_text = soup.get_text().lower()
        meet.pool = 'SCM' if 'petit bassin' in full_text else 'LCM'

    # Find all event sections by looking for anchor-named elements
    # Events are separated by <a name="XX"> tags followed by event title
    current_event = None

    # Process all text to find event headers and result tables
    for element in soup.find_all(['p', 'table']):
        if element.name == 'p':
            text = element.get_text(strip=True)

            # Skip table of contents / programme paragraphs (very long concatenated text)
            if 'epreuves au programme' in text.lower() or 'programme de la' in text.lower():
                continue
            # Skip very long <p> tags that are likely concatenated data, not headers
            if len(text) > 200:
                continue

            # Check for event title
            relay_match = RELAY_TITLE.search(text)
            if relay_match:
                teams = int(relay_match.group(1))
                leg_dist = int(relay_match.group(2))
                distance = teams * leg_dist
                stroke = normalize_stroke(relay_match.group(3))
                gender_word = relay_match.group(4).lower()
                if gender_word == 'mixte':
                    gender = 'X'
                else:
                    gender = detect_gender(relay_match.group(4))
                event_name = normalize_event_name(distance, stroke, is_relay=True)
                # Include gender in relay event name to differentiate
                gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(gender, '')
                if gender_label:
                    event_name = f'{event_name} {gender_label}'
                current_event = ParsedEvent(
                    event_name=event_name, distance=distance,
                    stroke=stroke, gender=gender,
                )
                meet.events.append(current_event)
                continue

            event_match = EVENT_TITLE.search(text)
            if event_match:
                distance = int(event_match.group(1))
                stroke = normalize_stroke(event_match.group(2))
                gender = detect_gender(event_match.group(3))
                event_name = normalize_event_name(distance, stroke)
                current_event = ParsedEvent(
                    event_name=event_name, distance=distance,
                    stroke=stroke, gender=gender,
                )
                meet.events.append(current_event)
                continue

            # Check for an age-category sub-header (multi-category meets).
            # The first category reuses the event created by the title (still
            # empty); each subsequent category opens a fresh sibling event so
            # every classement keeps its own ranking and results.
            category = _detect_category(element, text)
            if category and current_event:
                if current_event.results:
                    current_event = _sibling_event(current_event, category)
                    meet.events.append(current_event)
                else:
                    current_event.age_group = category
                continue

            # Check for round type
            if 'séries' in text.lower() or 'series' in text.lower():
                if current_event:
                    current_event.round_type = 'Heats'
            elif 'finale' in text.lower():
                if current_event:
                    current_event.round_type = 'Finals'

        elif element.name == 'table' and current_event:
            is_relay = 'relay' in current_event.event_name.lower() or '4x' in current_event.event_name.lower()
            if is_relay:
                _parse_relay_table(element, current_event)
            else:
                _parse_result_table(element, current_event)

    return meet


def _parse_relay_table(table, event):
    """Parse a Nat2i relay result table.
    Relay format: 4 rows per team.
    - Rows 1-3: swimmer name + nation + birth year (no club, no time)
    - Row 4: last swimmer + club (=team name) + time + points + splits
    The rank is on row 1 only.
    """
    rows = table.find_all('tr')
    current_rank = 0
    current_swimmers = []

    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 6:
            continue

        cell_texts = [c.get_text(strip=True).replace('\xa0', ' ').strip() for c in cells]

        if 'Place' in cell_texts[0] or 'Nom' in cell_texts[1]:
            continue

        place_text = cell_texts[0].strip().rstrip('.')
        name_text = cell_texts[1]
        club = cell_texts[4] if len(cells) > 4 else ''
        time_text = cell_texts[5] if len(cells) > 5 else ''
        points_text = cell_texts[6] if len(cells) > 6 else '0'
        split_text = cell_texts[7] if len(cells) > 7 else ''

        if not name_text or not name_text.strip():
            continue

        name = _nat2i_normalize_name(name_text)

        # Row with a rank = start of new team
        if place_text.isdigit():
            current_rank = int(place_text)
            current_swimmers = [name]
        elif place_text.upper().replace('.', '') in ('NC', 'HC'):
            current_rank = 0
            current_swimmers = [name]
        else:
            # Continuation row (no rank)
            current_swimmers.append(name)

        # Row with a time = last swimmer of the team, create the result
        time_cs = parse_time_to_centiseconds(time_text)
        if time_cs > 0 and club:
            fina_points = int(points_text) if points_text.isdigit() else 0

            # Cumulative passage times: "31.93 (50 m) - 1:06.56 (100 m) - ..."
            cumulative = {}
            if split_text:
                for t, dist in re.findall(
                        r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*\((\d+)\s*m\)',
                        split_text):
                    cumulative[int(dist)] = parse_time_to_centiseconds(t)

            result = ParsedResult(
                swimmer_name=club,  # Team name = club
                time_text=time_text,
                time_centiseconds=time_cs,
                event_name=event.event_name,
                event_distance=event.distance,
                event_stroke=event.stroke,
                gender=event.gender,
                rank=current_rank,
                club=club,
                fina_points=fina_points,
                # "Name m:ss.xx" entries, each swimmer with their leg time
                split_times=_match_relay_splits(
                    current_swimmers, cumulative, event, time_cs),
                round_type=event.round_type,
            )
            event.results.append(result)
            current_swimmers = []


def _match_relay_splits(swimmers, cumulative, event, total_cs):
    """Pair each relay swimmer with their leg time.

    ``cumulative`` maps passage distance -> cumulative centiseconds
    (e.g. {50: 3193, 100: 6656, 150: ..., 200: ...} for a 4x50).
    Leg N's time = cumulative at its end boundary minus cumulative at its
    start boundary; the last leg falls back to the team's total time.
    Returns "Name m:ss.xx" strings (name alone when a boundary is missing),
    which confirm_import parses into {name, split_time} relay entries.
    """
    from .base import format_centiseconds

    m = re.search(r'(\d+)\s*x\s*(\d+)', event.event_name, re.IGNORECASE)
    if m:
        legs, leg_dist = int(m.group(1)), int(m.group(2))
    else:
        legs = len(swimmers) or 4
        leg_dist = event.distance // legs if event.distance else 0

    entries = []
    for i, name in enumerate(swimmers):
        leg_cs = None
        if leg_dist:
            start_cs = 0 if i == 0 else cumulative.get(leg_dist * i)
            end_cs = cumulative.get(leg_dist * (i + 1))
            if end_cs is None and i == legs - 1 and total_cs:
                end_cs = total_cs
            if start_cs is not None and end_cs is not None and end_cs > start_cs:
                leg_cs = end_cs - start_cs
        entries.append(f'{name} {format_centiseconds(leg_cs)}' if leg_cs else name)
    return entries


def _parse_result_table(table, event):
    """Parse an HTML result table and add results to event."""
    rows = table.find_all('tr')

    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 6:
            continue

        # Extract cell text
        cell_texts = [c.get_text(strip=True).replace('\xa0', ' ').strip() for c in cells]

        # Skip header rows
        if 'Place' in cell_texts[0] or 'Nom' in cell_texts[1]:
            continue

        place_text = cell_texts[0].strip().rstrip('.')
        name_text = cell_texts[1]
        nation = cell_texts[2] if len(cells) > 2 else ''
        birth_text = cell_texts[3] if len(cells) > 3 else ''
        club = cell_texts[4] if len(cells) > 4 else ''
        time_text = cell_texts[5] if len(cells) > 5 else ''
        points_text = cell_texts[6] if len(cells) > 6 else '0'
        split_text = cell_texts[7] if len(cells) > 7 else ''

        # Skip empty rows
        if not name_text or not name_text.strip():
            continue

        # Determine status. N.C ("non classé") / H.C ("hors concours")
        # swimmers swam without a ranking — keep them as real results;
        # rows with no/invalid time are filtered out downstream anyway.
        status = 'OK'
        rank = 0
        if place_text.isdigit():
            rank = int(place_text)

        # Check for DQ/forfeit in time
        if 'frf' in time_text.lower() or 'disq' in time_text.lower() or 'dsq' in time_text.lower():
            status = 'DQ'
            time_text = ''

        name = _nat2i_normalize_name(name_text)
        if not name:
            continue

        birth_year = 0
        if birth_text.isdigit() and len(birth_text) == 4:
            birth_year = int(birth_text)

        time_cs = parse_time_to_centiseconds(time_text)

        fina_points = 0
        if points_text.isdigit():
            fina_points = int(points_text)

        # Parse split times: "31.93 (50 m) - 1:06.56 (100 m) - 1:42.87 (150 m)"
        splits = []
        if split_text:
            # Match times with their distance labels
            split_matches = re.findall(
                r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*\((\d+)\s*m\)',
                split_text
            )
            if split_matches:
                splits = [f'{time} ({dist}m)' for time, dist in split_matches]
            else:
                # Fallback: just extract time patterns
                splits = re.findall(r'(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})', split_text)

        result = ParsedResult(
            swimmer_name=name,
            time_text=time_text,
            time_centiseconds=time_cs,
            event_name=event.event_name,
            event_distance=event.distance,
            event_stroke=event.stroke,
            gender=event.gender,
            rank=rank,
            birth_year=birth_year,
            nationality_code=nation,
            club=club,
            fina_points=fina_points,
            split_times=splits,
            round_type=event.round_type,
            status=status,
        )
        event.results.append(result)
