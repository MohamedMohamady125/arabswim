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

            # Check for round type
            if 'séries' in text.lower() or 'series' in text.lower():
                if current_event:
                    current_event.round_type = 'Heats'
            elif 'finale' in text.lower():
                if current_event:
                    current_event.round_type = 'Finals'

        elif element.name == 'table' and current_event:
            _parse_result_table(element, current_event)

    return meet


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

        # Determine status
        status = 'OK'
        rank = 0
        if place_text == 'N.C' or place_text == 'NC':
            status = 'DNS'
        elif place_text.isdigit():
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
