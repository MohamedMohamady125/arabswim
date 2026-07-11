"""
Auto-detect file format and route to the correct parser.
Supports: PDF, HTML, Excel files.
Passes filename to parsers for pool detection.
"""
import os
import pdfplumber

from . import splash_parser, hytek_parser, frmn_parser, nat2i_parser, omega_parser
from .base import ParsedMeet, detect_pool


def _post_process_meet(meet):
    """Apply standard post-processing to a parsed meet."""
    from .base import drop_general_duplicate_results, promote_lone_heats_to_finals, drop_heats_if_finals_exist
    meet = drop_general_duplicate_results(meet)
    meet = promote_lone_heats_to_finals(meet)
    return drop_heats_if_finals_exist(meet)


def detect_and_parse(file_path):
    """
    Auto-detect the format of a swimming results file and parse it.
    Returns a ParsedMeet object, or a list of ParsedMeet for multi-meet Excel files.
    """
    ext = os.path.splitext(file_path)[1].lower()
    filename = os.path.basename(file_path)

    if ext in ('.html', '.htm'):
        result = _parse_html(file_path, filename)
    elif ext in ('.pdf',):
        result = _parse_pdf(file_path, filename)
    elif ext in ('.xlsx', '.xls', '.csv'):
        result = _parse_excel(file_path, filename)
    else:
        raise ValueError(f'Unsupported file type: {ext}')

    if isinstance(result, list):
        return [_post_process_meet(m) for m in result]
    return _post_process_meet(result)


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
            result = _parse_html(tmp_path, original_name)
        elif ext_lower in ('.pdf',):
            result = _parse_pdf(tmp_path, original_name)
        elif ext_lower in ('.xlsx', '.xls', '.csv'):
            result = _parse_excel(tmp_path, original_name)
        else:
            raise ValueError(f'Unsupported file type: {ext}')

        if isinstance(result, list):
            return [_post_process_meet(m) for m in result]
        return _post_process_meet(result)
    finally:
        os.unlink(tmp_path)


def _parse_pdf(file_path, filename=''):
    """Extract text from PDF and route to correct parser."""
    import gc
    with pdfplumber.open(file_path) as pdf:
        # First pass: simple extraction for format detection
        text_parts = []
        for page in pdf.pages:
            text_parts.append(page.extract_text() or '')
            page.flush_cache()
        simple_text = '\n'.join(text_parts)
        del text_parts
        gc.collect()

    if not simple_text.strip():
        raise ValueError('Could not extract text from PDF. The file may be image-based.')

    # Detect pool from text + filename
    pool = detect_pool(simple_text, filename)

    # Splash is more specific than HY-TEK — check Splash first
    # (some Splash PDFs also contain "meet manager" which triggers HY-TEK detection)
    if splash_parser.detect_format(simple_text):
        # Splash PDFs often have overlapping club/time columns that garble
        # character order in default extraction ("D'Ora1n:00.89").
        # use_text_flow follows the PDF stream order and keeps them separate.
        full_text = _extract_text_flow(file_path)
        meet = splash_parser.parse(full_text)
    elif hytek_parser.detect_format(simple_text):
        full_text = _extract_columns(file_path)
        meet = hytek_parser.parse(full_text)
    elif omega_parser.detect_format(simple_text):
        meet = omega_parser.parse(simple_text)
    elif frmn_parser.detect_format(simple_text):
        # FRMN PDFs lay out fine with default extraction; text-flow order
        # actually breaks their result-line structure.
        meet = frmn_parser.parse(simple_text)
    else:
        # Try each parser and pick the one that extracts the most results
        results = []
        for parser in [splash_parser, hytek_parser, omega_parser, frmn_parser]:
            try:
                if parser == hytek_parser:
                    text = _extract_columns(file_path)
                elif parser == frmn_parser:
                    text = simple_text
                else:
                    text = _extract_text_flow(file_path)
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


def _extract_text_flow(file_path):
    """Extract PDF text following the content-stream order.

    Splash/FRMN PDFs draw the club name and the time as separate text objects
    that can physically overlap in x-position. Default (position-sorted)
    extraction interleaves their characters ("D'Ora1n:00.89"); stream-order
    extraction keeps each text object intact.
    """
    import gc
    parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text(use_text_flow=True) or '')
            page.flush_cache()
    text = _fix_cid_ligatures('\n'.join(parts))
    del parts
    gc.collect()
    return text


import re as _re_module

# CID codes for ligatures that pdfplumber can't decode from some fonts.
_CID_MAP = {
    '(cid:976)': 'f',    # f glyph (some HyTek fonts store it as CID)
    '(cid:975)': 'fi',   # ﬁ ligature
    '(cid:64257)': 'fi',
    '(cid:64258)': 'fl',
}
_CID_RE = _re_module.compile(r'\(cid:\d+\)')


def _fix_cid_ligatures(text):
    """Replace (cid:NNN) ligature placeholders with actual characters."""
    def _replace(m):
        return _CID_MAP.get(m.group(0), '')
    return _CID_RE.sub(_replace, text)


def _has_overlapping_text(words, tolerance=2):
    """Check if a page's words have overlapping x-positions on any line.

    Some HyTek PDFs render name/age/team as separate text objects whose
    characters physically overlap. Default extraction interleaves characters
    from different objects, garbling names ("Hassan A 1L4 NeJoarmdaanit").
    """
    lines = {}
    for w in words:
        ly = round(w['top'] / 5) * 5
        lines.setdefault(ly, []).append(w)
    overlap_count = 0
    for line_words in lines.values():
        sw = sorted(line_words, key=lambda w: w['x0'])
        for j in range(1, len(sw)):
            if sw[j]['x0'] < sw[j - 1]['x1'] - tolerance:
                overlap_count += 1
                if overlap_count >= 3:
                    return True
    return False


def _extract_page_deoverlap(page):
    """Extract text from a page with overlapping text objects.

    Uses text_flow to get intact words (no character interleaving), then
    sorts them by position. Words that belong to the same line (within 4pt
    y-tolerance) are joined with spaces.
    """
    flow_words = page.extract_words(use_text_flow=True, keep_blank_chars=True)
    if not flow_words:
        return ''
    # Cluster words into lines using a merge approach (avoids rounding
    # boundary issues where 0.12pt differences split a line in two).
    flow_words.sort(key=lambda w: w['top'])
    lines = []
    for w in flow_words:
        if lines and abs(w['top'] - lines[-1][0]['top']) < 4:
            lines[-1].append(w)
        else:
            lines.append([w])
    page_lines = []
    for line_words in lines:
        line_words.sort(key=lambda w: w['x0'])
        page_lines.append(' '.join(w['text'] for w in line_words))
    return '\n'.join(page_lines)


def _extract_columns(file_path):
    """
    Extract text from a HY-TEK PDF handling two-column layouts and
    overlapping text objects.

    HY-TEK Meet Manager often produces PDFs with two columns of results
    side by side. Standard text extraction interleaves the columns,
    mixing results from different events. This function:
    1. Detects if a page has two-column layout
    2. Splits each page at the midpoint
    3. Extracts left column first, then right column
    4. Concatenates them sequentially so events are properly separated

    Additionally, some HyTek PDFs (e.g. FRMN-produced Arab championships)
    render name, age, and team as separate text objects whose characters
    physically overlap. For those pages, extraction uses text_flow to keep
    each text run intact and then sorts runs by position.
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
            # Relay leg lines ("1) Name, First 14 2) Name2, Second 14") span the
            # full width and look like rank+comma-name on the right — exclude them
            # by checking that no ")" precedes the digit on the same line.
            import re as _re
            right_event_headers = 0
            right_ranked_names = 0
            for wi, w in enumerate(words):
                if w['x0'] > mid_x:
                    if w['text'] == 'Event':
                        right_event_headers += 1
                    if _re.match(r'^\d{1,3}$', w['text']) and int(w['text']) <= 20:
                        # Reject if a ")" word sits on the same line just before
                        # this digit — that's a relay leg age, not a rank.
                        is_relay_age = False
                        for wp in words[max(0, wi-4):wi]:
                            if abs(wp['top'] - w['top']) < 3 and wp['text'].endswith(')'):
                                is_relay_age = True
                                break
                        if is_relay_age:
                            continue
                        for w2 in words[wi+1:wi+4]:
                            if abs(w2['top'] - w['top']) < 3 and ',' in w2['text']:
                                right_ranked_names += 1
                                break
            has_two_columns = right_event_headers >= 2 or right_ranked_names >= 3

            if has_two_columns:
                if not header_extracted:
                    full_page_text = page.extract_text() or ''
                    header_lines = []
                    result_like = _re.compile(
                        r'^\*?\d{1,3}\s+\S.*\d{1,2}[:.]\d{2}')  # rank ... time
                    for ln in full_page_text.split('\n')[:8]:
                        ln = ln.strip()
                        if not ln:
                            continue
                        if ln.startswith('Event ') or _re.match(
                                r'^(Boys|Girls|Men|Women|Mixed)\b.*Met(er|re)', ln):
                            break
                        # Full-page extraction interleaves both columns, so
                        # result rows can appear here — never treat them as header
                        if result_like.match(ln):
                            continue
                        header_lines.append(ln)
                    if header_lines:
                        all_text_parts.append('\n'.join(header_lines))
                    header_extracted = True

                left_max_x = max(w['x1'] for w in left_words) if left_words else mid_x
                right_min_x = min(w['x0'] for w in right_words) if right_words else mid_x
                split_x = (left_max_x + right_min_x) / 2

                if split_x < page_width * 0.3 or split_x > page_width * 0.7:
                    split_x = mid_x

                bbox = page.bbox
                left_crop = page.crop((bbox[0], bbox[1], split_x, bbox[3]))
                right_crop = page.crop((split_x, bbox[1], bbox[2], bbox[3]))

                left_text = _extract_page_deoverlap(left_crop)
                right_text = _extract_page_deoverlap(right_crop)

                all_text_parts.append(left_text)
                all_text_parts.append(right_text)
            else:
                # Use text_flow extraction for all single-column pages:
                # keeps each text run intact even when objects overlap
                # in x-position (common in HyTek PDFs from FRMN).
                all_text_parts.append(_extract_page_deoverlap(page))

            # Free memory after each page
            del words, left_words, right_words
            page.flush_cache()

    return _fix_cid_ligatures('\n'.join(all_text_parts))


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


NAME_CANDIDATES = ['swimmer name', 'name', 'nom', 'swimmer', 'nageur', 'athlete']
TIME_CANDIDATES = ['team time', 'time', 'temps', 'tps', 'finals time', 'result']

# Cells that mean "no time swum" rather than a time
STATUS_CELL = None  # compiled lazily below


def _is_status_cell(text):
    """True for DQ/DNS/NT/'-' style cells that carry no swim time."""
    import re
    global STATUS_CELL
    if STATUS_CELL is None:
        STATUS_CELL = re.compile(
            r'^(dq|dsq|disq\w*|dns|dnf|ns|nt|n\.?c\.?|h\.?c\.?|scr|wdr|abd|frf|'
            r'-+|—|–|/|x)$', re.IGNORECASE)
    return bool(STATUS_CELL.match(text.strip()))


def _cell_time_str(val):
    """Read a time cell exactly as the user meant it.

    Excel stores swim times in many shapes: plain text ("7:57.54"),
    time-formatted cells (datetime.time(7, 57, 54) really means 7:57.54),
    datetimes, timedeltas, numeric seconds, or day fractions. Convert each
    to canonical "m:ss.xx" text; return '' for empty/status cells.
    """
    import datetime
    import pandas as pd

    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ''
    if isinstance(val, pd.Timedelta):
        val = val.to_pytimedelta()
    if isinstance(val, datetime.timedelta):
        return _fmt_seconds(val.total_seconds())
    if isinstance(val, (datetime.datetime, pd.Timestamp)):
        val = val.time()
    if isinstance(val, datetime.time):
        if val.microsecond:
            # true m:ss.cc time — hour/minute are minutes, micros are centis
            secs = (val.hour * 60 + val.minute) * 60 + val.second + val.microsecond / 1e6
            return _fmt_seconds(secs)
        if val.hour:
            # "7:57.54" typed into a time cell arrives as 07:57:54
            return f'{val.hour}:{val.minute:02d}.{val.second:02d}'
        # "25.43" in a time cell arrives as 00:25:43
        return f'{val.minute}.{val.second:02d}'
    if isinstance(val, (int, float)):
        if 0 < val < 1:  # Excel day fraction
            return _fmt_seconds(val * 86400)
        return _fmt_seconds(float(val))
    text = str(val).strip()
    if not text or text.lower() == 'nan' or _is_status_cell(text):
        return ''
    # Time-formatted cells sometimes round-trip as "HH:MM:SS" strings —
    # reinterpret exactly like the datetime.time branch above.
    import re
    hms = re.match(r'^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$', text)
    if hms:
        h, mi, s, frac = (int(hms.group(1)), int(hms.group(2)),
                          int(hms.group(3)), hms.group(4))
        if frac:
            secs = (h * 60 + mi) * 60 + s + float(f'0.{frac}')
            return _fmt_seconds(secs)
        if h:
            return f'{h}:{mi:02d}.{s:02d}'
        return f'{mi}.{s:02d}'
    # French decimal comma: "1:02,45"
    return text.replace(',', '.')


def _fmt_seconds(seconds):
    """Format seconds as swim time text ("57.54" / "2:05.30")."""
    if seconds <= 0:
        return ''
    cs = round(seconds * 100)
    minutes, rem = divmod(cs, 6000)
    if minutes:
        return f'{minutes}:{rem // 100:02d}.{rem % 100:02d}'
    return f'{rem // 100}.{rem % 100:02d}'


def _cell_int(val, allow_float=True):
    """Read an integer cell tolerating '1er', '1st', '2.0', ' 3 '."""
    import re
    import pandas as pd
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (int, float)):
        return int(val)
    m = re.match(r'\s*(\d+)', str(val))
    return int(m.group(1)) if m else None


def _cell_gender(val):
    """Understand gender cells in English/French/Arabic-latin variants."""
    g = _safe_str(val).upper().rstrip('S')
    if g in ('M', 'MALE', 'H', 'HOMME', 'MEN', "MEN'", 'BOY', 'GARCON', 'GAR\u00c7ON', 'MESSIEUR'):
        return 'M'
    if g in ('F', 'FEMALE', 'FEMME', 'W', 'WOMEN', "WOMEN'", 'GIRL', 'FILLE', 'DAME'):
        return 'F'
    if g in ('X', 'MIXED', 'MIXTE'):
        return 'X'
    return ''


def _fix_header(df):
    """Recover the real header when title rows sit above it.

    If the frame's columns don't contain name+time labels, scan the first
    15 rows for the row that does and re-frame the sheet below it.
    """
    def has_required(columns):
        lower = [str(c).lower().strip() for c in columns]
        return (any(k in c for c in lower for k in NAME_CANDIDATES)
                and any(k in c for c in lower for k in TIME_CANDIDATES))

    if has_required(df.columns):
        return df
    for i in range(min(15, len(df))):
        row_vals = [str(v).strip() for v in df.iloc[i].tolist()]
        if has_required(row_vals):
            new_df = df.iloc[i + 1:].reset_index(drop=True)
            new_df.columns = row_vals
            return new_df
    return df


def _parse_excel(file_path, filename=''):
    """Parse Excel/CSV files with pandas.

    Reads EVERY sheet in the workbook and classifies each by its columns:
      - sheets with Team Time / Split Time columns are relay sheets
        (one row per swimmer, 4 rows per team entry)
      - sheets with Name + Time columns are individual result sheets
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
        try:
            all_sheets = {'Sheet1': pd.read_csv(file_path)}
        except UnicodeDecodeError:
            all_sheets = {'Sheet1': pd.read_csv(file_path, encoding='latin-1')}
    else:
        all_sheets = pd.read_excel(file_path, sheet_name=None)

    # ---- Classify every sheet by its columns ----
    individual_dfs = []
    relay_dfs = []
    for sheet_name, sheet_df in all_sheets.items():
        if sheet_df.empty:
            continue
        sheet_df = _fix_header(sheet_df)
        scols = {str(c).lower().strip(): c for c in sheet_df.columns}
        has_name = _find_column(scols, NAME_CANDIDATES)
        has_team_time = _find_column(scols, ['team time'])
        has_split = _find_column(scols, ['split time', 'split'])
        has_time = _find_column(scols, ['time', 'temps', 'tps', 'finals time', 'result'])
        if has_team_time or (has_split and 'relay' in sheet_name.lower()) or (
                has_name and not has_time and 'relay' in sheet_name.lower()):
            relay_dfs.append(sheet_df)
        elif has_name and has_time:
            individual_dfs.append(sheet_df)
        # sheets with neither shape (notes, legends) are ignored

    if not individual_dfs and not relay_dfs:
        first_df = _fix_header(list(all_sheets.values())[0])
        raise ValueError(
            f'Could not find required columns (name, time) in Excel file. '
            f'Found columns: {list(first_df.columns)}'
        )

    # ---- Check for multi-meet Excel (multiple unique meet names) ----
    MEET_NAME_CANDIDATES = ['championships name', 'championship', 'meet name', 'meet', 'competition']
    unique_meet_names, name_map = _collect_unique_meet_names(
        individual_dfs + relay_dfs, MEET_NAME_CANDIDATES)
    if len(unique_meet_names) > 1:
        return _parse_excel_multi(
            individual_dfs, relay_dfs, unique_meet_names, name_map,
            MEET_NAME_CANDIDATES, filename)

    # ---- Single-meet path (original) ----
    meet = ParsedMeet(source_format='excel')

    # Meta (meet name, city, dates...) comes from the first data sheet
    df = individual_dfs[0] if individual_dfs else relay_dfs[0]
    cols = {str(c).lower().strip(): c for c in df.columns}

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
    meet_name_col = _find_column(cols, MEET_NAME_CANDIDATES)
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

    # ---- Parse every individual sheet, row by row ----
    # Group by event name + gender + round + category for proper separation
    events_dict = {}
    for ind_df in individual_dfs:
        _parse_individual_sheet(ind_df, meet, events_dict)

    # Store extra meet metadata for the preview
    # (classification, sub-classification, meet country are used by the import confirm step)
    if first_row is not None:
        if classification_col:
            meet._excel_classification = _safe_str(first_row[classification_col])
        if sub_classification_col:
            meet._excel_sub_classification = _safe_str(first_row[sub_classification_col])
        if meet_country_col:
            meet._excel_meet_country = _safe_str(first_row[meet_country_col])

    # ---- Process every relay sheet ----
    for relay_df in relay_dfs:
        _parse_relay_sheet(relay_df, meet, cols_finder=_find_column)

    return meet


def _collect_unique_meet_names(dfs, meet_name_candidates):
    """Return ordered unique meet names across all DataFrames.

    Also builds a mapping from every raw name to its canonical form,
    merging near-duplicates like 'Championships' vs 'Championship'.
    Returns (ordered_canonical_names, raw_to_canonical_map).
    """
    from thefuzz import fuzz

    raw_names = []
    for df in dfs:
        cols = {str(c).lower().strip(): c for c in df.columns}
        mn_col = _find_column(cols, meet_name_candidates)
        if not mn_col:
            continue
        for val in df[mn_col]:
            name = _safe_str(val)
            if name and name.lower() != 'nan' and name not in raw_names:
                raw_names.append(name)

    if not raw_names:
        return [], {}

    # Group near-duplicates (ratio >= 90) under the first occurrence
    canonical = []       # ordered list of canonical names
    name_map = {}        # raw_name -> canonical_name
    for name in raw_names:
        merged = False
        for canon in canonical:
            if fuzz.ratio(name.lower(), canon.lower()) >= 95:
                name_map[name] = canon
                merged = True
                break
        if not merged:
            canonical.append(name)
            name_map[name] = name

    return canonical, name_map


def _extract_excel_meet_metadata(meet, df, filename):
    """Set meet-level metadata (date, pool, city, classification) from a DataFrame."""
    from .base import extract_date_and_location

    cols = {str(c).lower().strip(): c for c in df.columns}
    meet_city_col = _find_column(cols, ['meet city', 'city', 'ville', 'location', 'lieu'])
    pool_col = _find_column(cols, ['pool', 'bassin', 'course'])
    date_col = _find_column(cols, ['date'])
    classification_col = _find_column(cols, ['classification'])
    sub_classification_col = _find_column(cols, ['sub-classification', 'sub classification', 'subclassification'])
    meet_country_col = _find_column(cols, ['meet country'])

    first_row = df.iloc[0] if len(df) > 0 else None
    if first_row is None:
        return

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
        meet.pool = detect_pool(str(df.head(20).to_string()), filename)
    if date_col:
        date_str = _safe_str(first_row[date_col])
        start_date, end_date, _ = extract_date_and_location(date_str)
        meet.date_text = start_date
        if end_date:
            meet.date_end = end_date
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
    if classification_col:
        meet._excel_classification = _safe_str(first_row[classification_col])
    if sub_classification_col:
        meet._excel_sub_classification = _safe_str(first_row[sub_classification_col])
    if meet_country_col:
        meet._excel_meet_country = _safe_str(first_row[meet_country_col])


def _parse_excel_multi(individual_dfs, relay_dfs, meet_names, name_map,
                       meet_name_candidates, filename):
    """Split a multi-meet Excel into separate ParsedMeet objects, one per meet name.

    ``name_map`` maps every raw cell value to its canonical meet name,
    merging near-duplicates like 'Championships' vs 'Championship'.
    """
    from .base import ParsedMeet

    meets = []
    for meet_name in meet_names:
        meet = ParsedMeet(source_format='excel')
        meet.meet_name = meet_name
        events_dict = {}
        metadata_set = False

        for ind_df in individual_dfs:
            cols = {str(c).lower().strip(): c for c in ind_df.columns}
            mn_col = _find_column(cols, meet_name_candidates)
            if not mn_col:
                continue
            mask = ind_df[mn_col].apply(
                lambda x, mn=meet_name: name_map.get(_safe_str(x), _safe_str(x)) == mn)
            filtered = ind_df[mask].reset_index(drop=True)
            if filtered.empty:
                continue

            if not metadata_set:
                _extract_excel_meet_metadata(meet, filtered, filename)
                metadata_set = True

            _parse_individual_sheet(filtered, meet, events_dict)

        for relay_df in relay_dfs:
            rcols = {str(c).lower().strip(): c for c in relay_df.columns}
            mn_col = _find_column(rcols, meet_name_candidates)
            if mn_col:
                mask = relay_df[mn_col].apply(
                    lambda x, mn=meet_name: name_map.get(_safe_str(x), _safe_str(x)) == mn)
                filtered = relay_df[mask].reset_index(drop=True)
                if not filtered.empty:
                    _parse_relay_sheet(filtered, meet, cols_finder=_find_column)

        if meet.events:
            meets.append(meet)

    return meets


def _parse_individual_sheet(df, meet, events_dict):
    """Parse one individual-results sheet into meet.events.

    Reads each cell defensively: times may be text, Excel time cells,
    timedeltas or numbers; ranks may carry suffixes ("1er"); DQ/DNS/NT
    cells are recognized and skipped. Relay events that appear in an
    individual sheet (rows holding the team name) are kept as relay
    entries with the team stored as the club.
    """
    import pandas as pd
    from .base import (
        ParsedEvent, ParsedResult,
        parse_time_to_centiseconds, normalize_name,
        normalize_stroke, extract_distance, is_relay_event, detect_gender,
    )

    cols = {str(c).lower().strip(): c for c in df.columns}
    name_col = _find_column(cols, NAME_CANDIDATES)
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
    if not name_col or not time_col:
        return

    for _, row in df.iterrows():
        event_name = _safe_str(row[event_col]) if event_col else 'Unknown Event'
        if not event_name or event_name.lower() == 'nan':
            continue
        relay = is_relay_event(event_name)

        round_type = _safe_str(row[round_col]) if round_col else ''
        round_lower = round_type.lower()
        if 'final' in round_lower:
            round_type = 'Finals'
        elif 'prelim' in round_lower or 'heat' in round_lower or 'serie' in round_lower or 'série' in round_lower:
            round_type = 'Prelims'
        elif 'consol' in round_lower:
            round_type = 'Consolation'

        category = _safe_str(row[category_col]) if category_col else ''
        if category.lower() == 'nan':
            category = ''

        # Gender: explicit column first, then category text
        gender = _cell_gender(row[gender_col]) if gender_col else ''
        if not gender and category:
            gender = detect_gender(category)

        # Event grouping key: event + gender + round + category
        event_key = f'{event_name}|{gender}|{round_type}|{category}'

        if event_key not in events_dict:
            parsed_event = ParsedEvent(
                event_name=event_name,
                distance=extract_distance(event_name),
                stroke=normalize_stroke(event_name),
                gender=gender,
                round_type=round_type,
                age_group=category,
            )
            events_dict[event_key] = parsed_event
            meet.events.append(parsed_event)

        # ---- Parse result cells ----
        time_val = _cell_time_str(row[time_col])
        if not time_val:
            continue  # empty or DQ/DNS/NT cell — no time swum
        time_cs = parse_time_to_centiseconds(time_val)
        if time_cs <= 0:
            continue

        raw_name = _safe_str(row[name_col])
        if not raw_name or raw_name.lower() == 'nan':
            continue
        # Relay rows in individual sheets carry the team name — keep as-is
        name = raw_name if relay else normalize_name(raw_name)
        if not name or len(name) < 2:
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

        # Optional cells, each read tolerantly
        if age_col:
            age = _cell_int(row[age_col])
            if age and 4 < age < 100:
                result.age = age
        if year_col:
            by = _cell_int(row[year_col])
            if by and 1900 < by < 2100:
                result.birth_year = by
        if club_col:
            club = _safe_str(row[club_col])
            if club and club.lower() != 'nan':
                result.club = club
        if relay and not result.club:
            result.club = name  # relay team doubles as the club
        if nation_col:
            nat = _safe_str(row[nation_col]).upper()
            if nat and nat != 'NAN':
                result.nationality_code = nat
        if rank_col:
            rank = _cell_int(row[rank_col])
            if rank:
                result.rank = rank
        if points_col:
            pts = _cell_int(row[points_col])
            if pts and 0 < pts <= 1200:
                result.fina_points = pts

        events_dict[event_key].results.append(result)


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

    rcols = {str(c).lower().strip(): c for c in relay_df.columns}

    event_col = cols_finder(rcols, ['event', 'epreuve'])
    team_time_col = cols_finder(rcols, ['team time'])
    team_name_col = cols_finder(rcols, ['team name', 'team'])
    name_col = cols_finder(rcols, ['swimmer name', 'name', 'swimmer'])
    split_col = cols_finder(rcols, ['split time', 'split'])
    nation_col = cols_finder(rcols, ['nationality', 'nat'])
    gender_col = cols_finder(rcols, ['gender', 'sex'])
    round_col = cols_finder(rcols, ['round'])
    category_col = cols_finder(rcols, ['category'])
    relay_kind_col = rcols.get('relay')  # "Men's" / "Women's" / "Mixed"

    if not event_col:
        return

    # Group relay rows by event + team time (each team = 4 consecutive rows with same team time)
    events_dict = {}

    for _, row in relay_df.iterrows():
        event_name = _safe_str(row[event_col])
        if not event_name or event_name.lower() == 'nan':
            continue

        team_time_str = _cell_time_str(row[team_time_col]) if team_time_col else ''
        team_name = _safe_str(row[team_name_col]) if team_name_col else ''
        if team_name.lower() == 'nan':
            team_name = ''
        round_type = ''
        if round_col:
            rt = _safe_str(row[round_col]).lower()
            if 'final' in rt:
                round_type = 'Finals'
            elif 'prelim' in rt or 'heat' in rt:
                round_type = 'Prelims'

        category = _safe_str(row[category_col]) if category_col else ''
        if category.lower() == 'nan':
            category = ''

        # Gender: gender column, then the "Relay" column ("Men's"/"Women's"/
        # "Mixed"), then the category text
        gender = _cell_gender(row[gender_col]) if gender_col else ''
        if not gender and relay_kind_col:
            gender = _cell_gender(row[relay_kind_col])
        if not gender and category:
            gender = detect_gender(category)
        if not gender and relay_kind_col:
            gender = detect_gender(_safe_str(row[relay_kind_col]))

        # Event key for relay: event + gender + round + CATEGORY so each
        # age category keeps its own relay classement
        team_key = f'{event_name}|{team_name}|{team_time_str}|{category}'
        event_key = f'{event_name}|{gender}|{round_type}|{category}'

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
            if not team_name and not team_time_str:
                continue  # nothing identifying a team on this row
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
                nat = _safe_str(row[nation_col]).upper()
                if nat and nat != 'NAN':
                    team_result.nationality_code = nat
            ev_data['teams'][team_key] = team_result
            ev_data['event'].results.append(team_result)

        # Store swimmer split info in the team result's split_times
        swimmer_name = normalize_name(_safe_str(row[name_col])) if name_col else ''
        split_time = _cell_time_str(row[split_col]) if split_col else ''

        if swimmer_name:
            ev_data['teams'][team_key].split_times.append(
                f'{swimmer_name} {split_time}' if split_time else swimmer_name
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
