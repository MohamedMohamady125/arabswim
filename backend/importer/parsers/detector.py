"""
Auto-detect file format and route to the correct parser.
Supports: PDF, HTML, Excel files.
Passes filename to parsers for pool detection.
"""
import os
import pdfplumber

from . import splash_parser, hytek_parser, frmn_parser, nat2i_parser
from .base import ParsedMeet, detect_pool


def detect_and_parse(file_path):
    """
    Auto-detect the format of a swimming results file and parse it.
    Returns a ParsedMeet object.
    """
    ext = os.path.splitext(file_path)[1].lower()
    filename = os.path.basename(file_path)

    if ext in ('.html', '.htm'):
        return _parse_html(file_path, filename)
    elif ext in ('.pdf',):
        return _parse_pdf(file_path, filename)
    elif ext in ('.xlsx', '.xls', '.csv'):
        return _parse_excel(file_path, filename)
    else:
        raise ValueError(f'Unsupported file type: {ext}')


def detect_and_parse_upload(uploaded_file):
    """
    Parse a Django UploadedFile. Writes to a temp file first.
    Preserves original filename for pool detection.
    """
    import tempfile
    original_name = uploaded_file.name
    ext = os.path.splitext(original_name)[1].lower()

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        for chunk in uploaded_file.chunks():
            tmp.write(chunk)
        tmp_path = tmp.name

    try:
        # Parse with temp path but pass original filename
        ext_lower = ext
        if ext_lower in ('.html', '.htm'):
            return _parse_html(tmp_path, original_name)
        elif ext_lower in ('.pdf',):
            return _parse_pdf(tmp_path, original_name)
        elif ext_lower in ('.xlsx', '.xls', '.csv'):
            return _parse_excel(tmp_path, original_name)
        else:
            raise ValueError(f'Unsupported file type: {ext}')
    finally:
        os.unlink(tmp_path)


def _parse_pdf(file_path, filename=''):
    """Extract text from PDF and route to correct parser."""
    with pdfplumber.open(file_path) as pdf:
        # First pass: simple extraction for format detection
        simple_text = '\n'.join(
            page.extract_text() or '' for page in pdf.pages
        )

    if not simple_text.strip():
        raise ValueError('Could not extract text from PDF. The file may be image-based.')

    # Detect pool from text + filename
    pool = detect_pool(simple_text, filename)

    # Splash is more specific than HY-TEK — check Splash first
    # (some Splash PDFs also contain "meet manager" which triggers HY-TEK detection)
    if splash_parser.detect_format(simple_text):
        full_text = _extract_columns(file_path)
        meet = splash_parser.parse(full_text)
    elif hytek_parser.detect_format(simple_text):
        full_text = _extract_columns(file_path)
        meet = hytek_parser.parse(full_text)
    elif frmn_parser.detect_format(simple_text):
        meet = frmn_parser.parse(simple_text)
    else:
        # Try each parser and pick the one that extracts the most results
        results = []
        for parser in [splash_parser, hytek_parser, frmn_parser]:
            try:
                text = _extract_columns(file_path) if parser == hytek_parser else simple_text
                m = parser.parse(text)
                results.append((m.total_results, m))
            except Exception:
                continue

        if results:
            results.sort(key=lambda x: x[0], reverse=True)
            meet = results[0][1]
            if meet.total_results > 0:
                meet.source_format += '_fallback'
            else:
                raise ValueError('Could not detect PDF format. No known parser matched.')
        else:
            raise ValueError('Could not detect PDF format. No known parser matched.')

    # Override pool with the smarter detection
    meet.pool = pool
    return meet


def _extract_columns(file_path):
    """
    Extract text from a HY-TEK PDF handling two-column layouts.

    HY-TEK Meet Manager often produces PDFs with two columns of results
    side by side. Standard text extraction interleaves the columns,
    mixing results from different events. This function:
    1. Detects if a page has two-column layout
    2. Splits each page at the midpoint
    3. Extracts left column first, then right column
    4. Concatenates them sequentially so events are properly separated
    """
    import pdfplumber

    all_text_parts = []
    header_extracted = False

    with pdfplumber.open(file_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_width = page.width
            page_height = page.height
            mid_x = page_width / 2

            # Check if this page has two-column layout by looking for
            # content on both sides of the midpoint
            words = page.extract_words()
            if not words:
                continue

            left_words = [w for w in words if w['x0'] < mid_x - 20]
            right_words = [w for w in words if w['x0'] > mid_x - 20]

            # Heuristic: true two-column layout has "Event" headers or rank+comma-name
            # patterns starting on the RIGHT side (not just numbers like FINA points).
            # Check for "Event" keyword or rank-then-name pattern on the right half.
            import re as _re
            right_event_headers = 0
            right_ranked_names = 0
            for wi, w in enumerate(words):
                if w['x0'] > mid_x:
                    if w['text'] == 'Event':
                        right_event_headers += 1
                    # Look for a rank number followed by a name with comma on the right
                    if _re.match(r'^\d{1,3}$', w['text']) and int(w['text']) <= 20:
                        # Check if next word on same line contains a comma (name pattern)
                        for w2 in words[wi+1:wi+4]:
                            if abs(w2['top'] - w['top']) < 3 and ',' in w2['text']:
                                right_ranked_names += 1
                                break
            has_two_columns = right_event_headers >= 2 or right_ranked_names >= 3

            if has_two_columns:
                # For the first page, extract header (top ~60px) at full width
                # to get meet name, date, etc. that span both columns
                if not header_extracted:
                    # Extract full-width header text first (meet name, date span both columns)
                    full_page_text = page.extract_text() or ''
                    # Grab just the first few lines as header
                    header_lines = []
                    for ln in full_page_text.split('\n')[:8]:
                        ln = ln.strip()
                        if ln and not ln.startswith('Event '):
                            header_lines.append(ln)
                        elif ln.startswith('Event '):
                            break
                    if header_lines:
                        all_text_parts.append('\n'.join(header_lines))
                    header_extracted = True

                # Find the actual column boundary by looking for the gap
                # between left and right content
                left_max_x = max(w['x1'] for w in left_words) if left_words else mid_x
                right_min_x = min(w['x0'] for w in right_words) if right_words else mid_x
                split_x = (left_max_x + right_min_x) / 2

                # Ensure split_x is reasonable (between 30%-70% of page width)
                if split_x < page_width * 0.3 or split_x > page_width * 0.7:
                    split_x = mid_x

                # Extract left column then right column using page bbox
                bbox = page.bbox  # (x0, top, x1, bottom)
                left_crop = page.crop((bbox[0], bbox[1], split_x, bbox[3]))
                right_crop = page.crop((split_x, bbox[1], bbox[2], bbox[3]))

                left_text = left_crop.extract_text() or ''
                right_text = right_crop.extract_text() or ''

                all_text_parts.append(left_text)
                all_text_parts.append(right_text)
            else:
                # Single column — extract normally
                text = page.extract_text() or ''
                all_text_parts.append(text)

    return '\n'.join(all_text_parts)


def _parse_html(file_path, filename=''):
    """Read HTML and parse with nat2i parser."""
    for encoding in ['utf-8', 'iso-8859-1', 'latin-1', 'cp1252']:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                content = f.read()
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

    if nat2i_parser.detect_format(content):
        meet = nat2i_parser.parse(content)
    else:
        meet = nat2i_parser.parse(content)

    # Override pool with smarter detection
    meet.pool = detect_pool(content, filename)
    return meet


def _parse_excel(file_path, filename=''):
    """Parse Excel/CSV files with pandas.

    Handles standard swim result spreadsheets with columns like:
    Events, Swimmer Name, Time, YoB, Nationality, Gender, Pool,
    Championships Name, Meet City, Meet Country, Date, Round,
    Category, Medal, Classification, Sub-Classification, Club, etc.
    """
    import pandas as pd
    from .base import (
        ParsedMeet, ParsedEvent, ParsedResult,
        parse_time_to_centiseconds, normalize_name,
        normalize_stroke, extract_distance, is_relay_event, normalize_event_name,
        extract_date_and_location, detect_gender,
    )

    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        all_sheets = {'Sheet1': pd.read_csv(file_path)}
    else:
        all_sheets = pd.read_excel(file_path, sheet_name=None)

    # Use first sheet as main individual results
    first_sheet_name = list(all_sheets.keys())[0]
    df = all_sheets[first_sheet_name]

    # Detect relay sheet
    relay_df = None
    for sheet_name, sheet_df in all_sheets.items():
        if 'relay' in sheet_name.lower():
            relay_df = sheet_df
            break

    meet = ParsedMeet(source_format='excel')

    cols = {c.lower().strip(): c for c in df.columns}

    # ---- Map columns ----
    name_col = _find_column(cols, ['swimmer name', 'name', 'nom', 'swimmer', 'nageur', 'athlete'])
    time_col = _find_column(cols, ['time', 'temps', 'tps', 'finals time', 'result'])
    event_col = _find_column(cols, ['event', 'epreuve', 'race', 'épreuve'])
    age_col = _find_column(cols, ['age', 'âge'])
    year_col = _find_column(cols, ['yob', 'birth', 'naissance', 'year of birth', 'year', 'an', 'lic', 'dob'])
    club_col = _find_column(cols, ['club', 'team', 'équipe'])
    nation_col = _find_column(cols, ['nationality', 'nation', 'nat', 'country', 'pays'])
    gender_col = _find_column(cols, ['gender', 'sex', 'sexe'])
    rank_col = _find_column(cols, ['rank', 'place', 'rg', 'rang', 'pos'])
    points_col = _find_column(cols, ['points', 'pts', 'fina', 'len'])
    round_col = _find_column(cols, ['round', 'tour', 'phase'])
    category_col = _find_column(cols, ['category', 'catégorie', 'cat', 'age group'])
    medal_col = _find_column(cols, ['medal', 'médaille'])
    pool_col = _find_column(cols, ['pool', 'bassin', 'course'])
    meet_name_col = _find_column(cols, ['championships name', 'championship', 'meet name', 'meet', 'competition'])
    meet_city_col = _find_column(cols, ['meet city', 'city', 'ville', 'location', 'lieu'])
    meet_country_col = _find_column(cols, ['meet country'])
    date_col = _find_column(cols, ['date'])
    classification_col = _find_column(cols, ['classification'])
    sub_classification_col = _find_column(cols, ['sub-classification', 'sub classification', 'subclassification'])

    if not name_col or not time_col:
        raise ValueError(
            f'Could not find required columns (name, time) in Excel file. '
            f'Found columns: {list(df.columns)}'
        )

    # ---- Extract meet info from first row ----
    first_row = df.iloc[0] if len(df) > 0 else None
    if first_row is not None:
        if meet_name_col:
            meet.meet_name = _safe_str(first_row[meet_name_col])
        if meet_city_col:
            meet.location = _safe_str(first_row[meet_city_col])
        if pool_col:
            pool_val = _safe_str(first_row[pool_col]).upper()
            if pool_val in ('LCM', 'SCM'):
                meet.pool = pool_val
            elif 'SHORT' in pool_val or '25' in pool_val:
                meet.pool = 'SCM'
            else:
                meet.pool = 'LCM'
        else:
            meet.pool = detect_pool(str(df.to_string()), filename)
        if date_col:
            date_str = _safe_str(first_row[date_col])
            start_date, end_date, _ = extract_date_and_location(date_str)
            meet.date_text = start_date
            if end_date:
                meet.date_end = end_date
            # If single date, check all rows for date range
            if not end_date:
                all_dates = set()
                for _, r in df.iterrows():
                    d = _safe_str(r[date_col])
                    sd, _, _ = extract_date_and_location(d)
                    if sd:
                        all_dates.add(sd)
                if all_dates:
                    sorted_dates = sorted(all_dates)
                    meet.date_text = sorted_dates[0]
                    if len(sorted_dates) > 1:
                        meet.date_end = sorted_dates[-1]

    # ---- Parse rows into events ----
    # Group by event name + round + category for proper separation
    events_dict = {}
    for _, row in df.iterrows():
        event_name = _safe_str(row[event_col]) if event_col else 'Unknown Event'
        if not event_name or event_name.lower() == 'nan':
            continue

        round_type = _safe_str(row[round_col]) if round_col else ''
        # Normalize round type
        round_lower = round_type.lower()
        if 'final' in round_lower:
            round_type = 'Finals'
        elif 'prelim' in round_lower or 'heat' in round_lower:
            round_type = 'Prelims'
        elif 'consol' in round_lower:
            round_type = 'Consolation'

        category = _safe_str(row[category_col]) if category_col else ''

        # Determine gender from category or gender column
        gender = ''
        if gender_col:
            g = _safe_str(row[gender_col]).upper()
            gender = 'M' if g in ('M', 'MALE', 'H', 'HOMME', 'MEN', "MEN'S") else 'F' if g in ('F', 'FEMALE', 'FEMME', 'WOMEN', "WOMEN'S") else ''
        if not gender and category:
            gender = detect_gender(category)

        # Event grouping key: event + gender + round + category
        event_key = f'{event_name}|{gender}|{round_type}|{category}'

        if event_key not in events_dict:
            # Parse event details
            distance = extract_distance(event_name)
            stroke = normalize_stroke(event_name)
            relay = is_relay_event(event_name)

            parsed_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=round_type,
                age_group=category,
            )
            events_dict[event_key] = parsed_event
            meet.events.append(parsed_event)

        # ---- Parse result ----
        time_val = _safe_str(row[time_col])
        if not time_val or time_val.lower() == 'nan':
            continue
        time_cs = parse_time_to_centiseconds(time_val)

        name = _safe_str(row[name_col])
        name = normalize_name(name)
        if not name or name.lower() == 'nan':
            continue

        result = ParsedResult(
            swimmer_name=name,
            time_text=time_val,
            time_centiseconds=time_cs,
            event_name=event_name,
            gender=gender,
            round_type=round_type,
            age_group=category,
        )

        # Optional fields
        if age_col:
            try:
                result.age = int(float(row[age_col]))
            except (ValueError, TypeError):
                pass
        if year_col:
            try:
                val = row[year_col]
                if pd.notna(val):
                    result.birth_year = int(float(val))
            except (ValueError, TypeError):
                pass
        if club_col:
            result.club = _safe_str(row[club_col])
        if nation_col:
            nat = _safe_str(row[nation_col])
            if nat and nat.lower() != 'nan':
                result.nationality_code = nat
        if rank_col:
            try:
                result.rank = int(float(row[rank_col]))
            except (ValueError, TypeError):
                pass
        if points_col:
            try:
                result.fina_points = int(float(row[points_col]))
            except (ValueError, TypeError):
                pass

        events_dict[event_key].results.append(result)

    # Store extra meet metadata for the preview
    # (classification, sub-classification, meet country are used by the import confirm step)
    if first_row is not None:
        if classification_col:
            meet._excel_classification = _safe_str(first_row[classification_col])
        if sub_classification_col:
            meet._excel_sub_classification = _safe_str(first_row[sub_classification_col])
        if meet_country_col:
            meet._excel_meet_country = _safe_str(first_row[meet_country_col])

    # ---- Process Relay sheet if present ----
    if relay_df is not None and len(relay_df) > 0:
        _parse_relay_sheet(relay_df, meet, cols_finder=_find_column)

    return meet


def _parse_relay_sheet(relay_df, meet, cols_finder):
    """Parse a relay sheet and append relay events to the meet.

    Relay sheets have one row per swimmer (4 rows per team entry).
    Columns: Events, Team Time, Team Name, Swimmer Name, Split Time,
    YoB, Nationality, Gender, Round, Category, Medal, etc.
    """
    import pandas as pd
    from .base import (
        ParsedEvent, ParsedResult,
        parse_time_to_centiseconds, normalize_name,
        normalize_stroke, extract_distance, detect_gender,
    )

    rcols = {c.lower().strip(): c for c in relay_df.columns}

    event_col = cols_finder(rcols, ['event', 'epreuve'])
    team_time_col = cols_finder(rcols, ['team time'])
    team_name_col = cols_finder(rcols, ['team name', 'team'])
    name_col = cols_finder(rcols, ['swimmer name', 'name', 'swimmer'])
    split_col = cols_finder(rcols, ['split time', 'split'])
    year_col = cols_finder(rcols, ['yob', 'birth', 'year'])
    nation_col = cols_finder(rcols, ['nationality', 'nat'])
    gender_col = cols_finder(rcols, ['gender', 'sex'])
    round_col = cols_finder(rcols, ['round'])
    category_col = cols_finder(rcols, ['category'])
    medal_col = cols_finder(rcols, ['medal'])

    if not event_col:
        return

    # Group relay rows by event + team time (each team = 4 consecutive rows with same team time)
    events_dict = {}

    for _, row in relay_df.iterrows():
        event_name = _safe_str(row[event_col])
        if not event_name or event_name.lower() == 'nan':
            continue

        team_time_str = _safe_str(row[team_time_col]) if team_time_col else ''
        team_name = _safe_str(row[team_name_col]) if team_name_col else ''
        round_type = ''
        if round_col:
            rt = _safe_str(row[round_col]).lower()
            if 'final' in rt:
                round_type = 'Finals'
            elif 'prelim' in rt or 'heat' in rt:
                round_type = 'Prelims'

        category = _safe_str(row[category_col]) if category_col else ''

        gender = ''
        if gender_col:
            g = _safe_str(row[gender_col]).upper()
            gender = 'M' if g in ('M', 'MALE', 'MEN', "MEN'S") else 'F' if g in ('F', 'FEMALE', 'WOMEN', "WOMEN'S") else ''
        if not gender and category:
            gender = detect_gender(category)

        # Event key for relay: event + team_name + team_time (unique per team entry)
        team_key = f'{event_name}|{team_name}|{team_time_str}'
        event_key = f'{event_name}|{gender}|{round_type}'

        if event_key not in events_dict:
            distance = extract_distance(event_name)
            stroke = normalize_stroke(event_name)
            parsed_event = ParsedEvent(
                event_name=event_name,
                distance=distance,
                stroke=stroke,
                gender=gender,
                round_type=round_type,
                age_group=category,
            )
            events_dict[event_key] = {'event': parsed_event, 'teams': {}}
            meet.events.append(parsed_event)

        ev_data = events_dict[event_key]

        # Create team result if we haven't seen this team yet
        if team_key not in ev_data['teams']:
            team_time_cs = parse_time_to_centiseconds(team_time_str)
            team_result = ParsedResult(
                swimmer_name=team_name,
                time_text=team_time_str,
                time_centiseconds=team_time_cs,
                event_name=event_name,
                gender=gender,
                round_type=round_type,
                age_group=category,
                club=team_name,
            )
            if nation_col:
                team_result.nationality_code = _safe_str(row[nation_col])
            ev_data['teams'][team_key] = team_result
            ev_data['event'].results.append(team_result)

        # Store swimmer split info in the team result's split_times
        swimmer_name = normalize_name(_safe_str(row[name_col])) if name_col else ''
        split_time = _safe_str(row[split_col]) if split_col else ''
        birth_year = 0
        if year_col:
            try:
                val = row[year_col]
                if pd.notna(val):
                    birth_year = int(float(val))
            except (ValueError, TypeError):
                pass

        if swimmer_name and split_time:
            ev_data['teams'][team_key].split_times.append(
                f'{swimmer_name} {split_time}'
            )


def _safe_str(val):
    """Convert a value to string, handling NaN and None."""
    import pandas as pd
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ''
    return str(val).strip()


def _find_column(cols_map, candidates):
    """Find a column by trying multiple name candidates."""
    for candidate in candidates:
        for col_lower, col_original in cols_map.items():
            if candidate in col_lower:
                return col_original
    return None
