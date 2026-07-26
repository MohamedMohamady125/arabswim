import re

from django.db.models import Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from core.models import Event
from .models import QualifyingStandard, QualifyingTime
from .serializers import (
    QualifyingStandardSerializer,
    QualifyingStandardListSerializer,
    QualifyingTimeSerializer,
)


def _parse_time_to_cs(time_str):
    """Convert time strings like '1:02.34' or '28.75' to centiseconds."""
    time_str = time_str.strip()
    m = re.match(r'^(\d+):(\d{2})\.(\d{2})$', time_str)
    if m:
        return int(m.group(1)) * 6000 + int(m.group(2)) * 100 + int(m.group(3))
    m = re.match(r'^(\d+)\.(\d{2})$', time_str)
    if m:
        return int(m.group(1)) * 100 + int(m.group(2))
    return None


# Maps common event names from PDF qualifying docs to our DB event names
EVENT_ALIASES = {
    '50 free': '50m Freestyle', '100 free': '100m Freestyle',
    '200 free': '200m Freestyle', '400 free': '400m Freestyle',
    '800 free': '800m Freestyle', '1500 free': '1500m Freestyle',
    '50 back': '50m Backstroke', '100 back': '100m Backstroke',
    '200 back': '200m Backstroke',
    '50 breast': '50m Breaststroke', '100 breast': '100m Breaststroke',
    '200 breast': '200m Breaststroke',
    '50 fly': '50m Butterfly', '100 fly': '100m Butterfly',
    '200 fly': '200m Butterfly',
    '200 im': '200m Individual Medley', '200 medley': '200m Individual Medley',
    '400 im': '400m Individual Medley', '400 medley': '400m Individual Medley',
    # Direct match forms
    '50m freestyle': '50m Freestyle', '100m freestyle': '100m Freestyle',
    '200m freestyle': '200m Freestyle', '400m freestyle': '400m Freestyle',
    '800m freestyle': '800m Freestyle', '1500m freestyle': '1500m Freestyle',
    '50m backstroke': '50m Backstroke', '100m backstroke': '100m Backstroke',
    '200m backstroke': '200m Backstroke',
    '50m breaststroke': '50m Breaststroke', '100m breaststroke': '100m Breaststroke',
    '200m breaststroke': '200m Breaststroke',
    '50m butterfly': '50m Butterfly', '100m butterfly': '100m Butterfly',
    '200m butterfly': '200m Butterfly',
    '200m individual medley': '200m Individual Medley',
    '400m individual medley': '400m Individual Medley',
    '200m im': '200m Individual Medley', '400m im': '400m Individual Medley',
    # With "m " space
    '50 m freestyle': '50m Freestyle', '100 m freestyle': '100m Freestyle',
    '200 m freestyle': '200m Freestyle', '400 m freestyle': '400m Freestyle',
    '800 m freestyle': '800m Freestyle', '1500 m freestyle': '1500m Freestyle',
    '50 m backstroke': '50m Backstroke', '100 m backstroke': '100m Backstroke',
    '200 m backstroke': '200m Backstroke',
    '50 m breaststroke': '50m Breaststroke', '100 m breaststroke': '100m Breaststroke',
    '200 m breaststroke': '200m Breaststroke',
    '50 m butterfly': '50m Butterfly', '100 m butterfly': '100m Butterfly',
    '200 m butterfly': '200m Butterfly',
    '200 m individual medley': '200m Individual Medley',
    '400 m individual medley': '400m Individual Medley',
}


def _resolve_event(text):
    """Try to match a text to a DB Event."""
    text = text.strip().lower()
    # Try alias lookup
    canonical = EVENT_ALIASES.get(text)
    if canonical:
        ev = Event.objects.filter(name__iexact=canonical, is_relay=False).first()
        if ev:
            return ev
    # Try direct DB match
    ev = Event.objects.filter(name__iexact=text, is_relay=False).first()
    if ev:
        return ev
    # Try distance + stroke extraction: "100m Freestyle" or "100 Freestyle"
    m = re.match(r'(\d+)\s*m?\s+(.+)', text)
    if m:
        dist = int(m.group(1))
        stroke = m.group(2).strip()
        ev = Event.objects.filter(distance=dist, stroke__iexact=stroke, is_relay=False).first()
        if ev:
            return ev
    # Try with "N M Stroke" format (DB uses "50 M Freestyle" style names)
    m = re.match(r'(\d+)\s*m?\s+(.+)', text)
    if m:
        spaced = f"{m.group(1)} M {m.group(2).strip().title()}"
        ev = Event.objects.filter(name__iexact=spaced, is_relay=False).first()
        if ev:
            return ev
        # Also try "NM Stroke" without space
        nospace = f"{m.group(1)}M {m.group(2).strip().title()}"
        ev = Event.objects.filter(name__iexact=nospace, is_relay=False).first()
        if ev:
            return ev
    return None


def _detect_pool_from_pdf(pdf):
    """Detect the primary pool type (LCM/SCM) from PDF content.

    Uses the championship name or title to determine the main pool type.
    Returns 'LCM', 'SCM', or None if cannot determine.
    """
    # Use first page text
    first_text = (pdf.pages[0].extract_text() or '').lower() if pdf.pages else ''

    # Championship title patterns: "Championships (25m)" → SCM
    if re.search(r'championships?\s*\(25\s*m\)', first_text):
        return 'SCM'
    if re.search(r'championships?\s*\(50\s*m\)', first_text):
        return 'LCM'

    # Explicit course mentions
    if 'short course' in first_text:
        return 'SCM'
    if 'long course' in first_text:
        return 'LCM'

    # "Qualifying Time Standards (25m/50m)" on first page
    if re.search(r'(qualifying|time)\s+standards?\s*\(25\s*m\)', first_text):
        return 'SCM'
    if re.search(r'(qualifying|time)\s+standards?\s*\(50\s*m\)', first_text):
        return 'LCM'

    # Last resort: "25m" or "50m" in first 300 chars
    top = first_text[:300]
    if '25m' in top or '(25 m)' in top:
        return 'SCM'
    if '50m' in top or '(50 m)' in top:
        return 'LCM'

    return None


def _detect_header_gender_layout(row):
    """Detect gender layout from a header row.

    Returns a dict describing the layout, or None if not a gender header.
    Possible layouts:
      {'left': 'F', 'right': 'M'}  — Women on left, Men on right
      {'left': 'M', 'right': 'F'}  — Men on left, Women on right
      {'single': 'M'} or {'single': 'F'}  — single-gender header
    """
    if not row:
        return None

    cells = [str(c or '').strip().lower() for c in row]
    row_text = ' '.join(cells)

    # Check for dual-gender header
    has_women = any('women' in c or 'female' in c for c in cells)
    has_men = any(('men' in c and 'women' not in c) or ('male' in c and 'female' not in c)
                  for c in cells)

    if has_women and has_men:
        # Find positions of gender keywords in the cell list
        women_pos = None
        men_pos = None
        for i, c in enumerate(cells):
            if 'women' in c or 'female' in c:
                if women_pos is None:
                    women_pos = i
            elif 'men' in c or 'male' in c:
                if men_pos is None:
                    men_pos = i
        if women_pos is not None and men_pos is not None:
            if women_pos < men_pos:
                return {'left': 'F', 'right': 'M'}
            else:
                return {'left': 'M', 'right': 'F'}
        # Fallback: check position in joined text
        women_idx = row_text.find('women') if 'women' in row_text else row_text.find('female')
        men_idx = -1
        for kw in ['men', 'male']:
            idx = row_text.find(kw)
            if idx >= 0 and (kw == 'men' and 'women' not in row_text[max(0, idx-2):idx+3]):
                men_idx = idx
                break
            if kw == 'male' and 'female' not in row_text[max(0, idx-2):idx+6]:
                men_idx = idx
                break
        if women_idx >= 0 and men_idx >= 0:
            if women_idx < men_idx:
                return {'left': 'F', 'right': 'M'}
            else:
                return {'left': 'M', 'right': 'F'}
        return {'left': 'F', 'right': 'M'}  # default based on World Aquatics format

    # Single gender header
    if has_women and not has_men:
        return {'single': 'F'}
    if has_men and not has_women:
        return {'single': 'M'}

    return None


def _detect_cut_layout(row):
    """Detect A/B cut column layout from a sub-header row.

    Returns a dict like {'left_inner': 'A', 'left_outer': 'B',
                          'right_inner': 'A', 'right_outer': 'B'}
    or None if not a cut sub-header.
    """
    if not row:
        return None
    cells = [str(c or '').strip().lower() for c in row]
    row_text = ' '.join(cells)

    # Look for A/B cut indicators
    has_a = any(c.strip() == 'a' or 'cut a' in c for c in cells)
    has_b = any(c.strip() == 'b' in c or 'cut b' in c or '+' in c for c in cells)

    if not has_a:
        return None

    # Typical layout: B(outer) A(inner) Event A(inner) B(outer)
    # The A columns are always closer to the event column
    return True  # Signal that we have A/B cuts (the order is always B-A-Event-A-B)


def _detect_page_pool(page):
    """Detect pool type from a single page's text content.

    Prioritizes specific "qualifying time standards" headers over general
    championship title mentions (e.g. a 25m championship can have 50m pool times).
    """
    text = (page.extract_text() or '').lower()

    # Priority 1: "Qualifying Time Standards (50m)" or "(25m)" — most specific
    if re.search(r'(qualifying|time)\s+standards?\s*\(50\s*m\)', text):
        return 'LCM'
    if re.search(r'(qualifying|time)\s+standards?\s*\(25\s*m\)', text):
        return 'SCM'

    # Priority 2: Explicit course type mentions
    top = text[:400]
    if 'short course' in top:
        return 'SCM'
    if 'long course' in top:
        return 'LCM'

    # Priority 3: Pool size in parentheses (but not in championship name context)
    # Only use if it appears outside "championships (25m)" pattern
    cleaned = re.sub(r'championships?\s*\(\d+m\)', '', top)
    if '(50m)' in cleaned or '50m pool' in cleaned:
        return 'LCM'
    if '(25m)' in cleaned or '25m pool' in cleaned:
        return 'SCM'

    return None


def _parse_qualifying_pdf(file_obj):
    """Extract qualifying times from a PDF document.

    Detects gender layout from headers (Women left vs Men left),
    detects pool type (SCM/LCM) from document content per page,
    and handles various PDF table formats.

    Returns tuple: (list of dicts {event_text, gender, cut, time_text, pool}, detected_pool)
    where detected_pool is the document-level detection (first page or overall).
    Each entry may also have its own 'pool' key if per-page detection found it.
    """
    import pdfplumber

    results = []
    current_gender = None
    gender_layout = None
    detected_pool = None

    with pdfplumber.open(file_obj) as pdf:
        detected_pool = _detect_pool_from_pdf(pdf)

        for page in pdf.pages:
            # Detect pool for this specific page
            page_pool = _detect_page_pool(page)

            # Reset gender state per page (each page may have its own header)
            current_gender = None
            gender_layout = None

            # Try extracting tables first
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    for row in table:
                        if not row:
                            continue
                        row_text = ' '.join(str(c or '') for c in row).strip()
                        if not row_text:
                            continue

                        # Check for gender header row
                        layout = _detect_header_gender_layout(row)
                        if layout:
                            if 'single' in layout:
                                current_gender = layout['single']
                                gender_layout = None
                            else:
                                current_gender = None
                                gender_layout = layout
                            continue

                        # Skip sub-header rows (A/B cut labels, column headers)
                        lower = row_text.lower()
                        if re.match(r'^[ab\s\+\%\(\)\.0-9event]*$', lower) and 'event' in lower:
                            continue

                        # Try to find event + times in columns
                        cells = [str(c or '').strip() for c in row if c]
                        before = len(results)
                        _extract_from_cells(cells, current_gender, gender_layout, results)
                        # Tag new entries with page-level pool
                        if page_pool:
                            for r in results[before:]:
                                r['pool'] = page_pool
            else:
                # Fall back to text extraction
                text = page.extract_text() or ''
                for line in text.split('\n'):
                    line = line.strip()
                    if not line:
                        continue
                    lower = line.lower()

                    # Detect dual-gender text header
                    if 'women' in lower and ('men' in lower.replace('women', '')):
                        women_idx = lower.find('women')
                        men_idx = lower.replace('women', '     ').find('men')
                        if women_idx >= 0 and men_idx >= 0:
                            if women_idx < men_idx:
                                gender_layout = {'left': 'F', 'right': 'M'}
                            else:
                                gender_layout = {'left': 'M', 'right': 'F'}
                            current_gender = None
                            continue

                    if ('men' in lower and 'women' not in lower) or lower.strip() == 'male':
                        current_gender = 'M'
                        gender_layout = None
                        continue
                    if 'women' in lower or 'female' in lower:
                        current_gender = 'F'
                        gender_layout = None
                        continue

                    before = len(results)
                    _extract_from_line(line, current_gender, results)
                    if page_pool:
                        for r in results[before:]:
                            r['pool'] = page_pool

    return results, detected_pool


def _extract_from_cells(cells, gender, gender_layout, results):
    """Extract event and times from table row cells.

    gender_layout: dict with 'left'/'right' gender assignments from header detection,
                   or None if single-gender or unknown.
    """
    if len(cells) < 2:
        return

    # Find which cells look like times
    time_pattern = re.compile(r'^\d{1,2}:\d{2}\.\d{2}$|^\d{1,3}\.\d{2}$')
    event_parts = []
    times = []
    time_positions = []
    for i, c in enumerate(cells):
        if time_pattern.match(c):
            times.append(c)
            time_positions.append(i)
        elif not re.match(r'^\d+$', c):  # skip pure numbers (ranks etc)
            event_parts.append(c)

    if not times:
        return

    event_text = ' '.join(event_parts).strip()
    if not event_text:
        return

    # Handle dual-gender layout: event in middle with times on both sides
    if len(times) >= 2 and not gender and gender_layout and 'left' in gender_layout:
        left_gender = gender_layout['left']
        right_gender = gender_layout['right']

        # Find event column position
        event_idx = _find_event_column(cells, time_pattern)

        if event_idx is not None:
            left_times = [t for t, p in zip(times, time_positions) if p < event_idx]
            right_times = [t for t, p in zip(times, time_positions) if p > event_idx]
        else:
            # Fallback: split times in half
            mid = len(times) // 2
            left_times = times[:mid]
            right_times = times[mid:]

        # For 4-time layout (B-A-Event-A-B): inner times are A cuts, outer are B
        # Left side: outer=B, inner=A (so left_times[0]=B, left_times[1]=A)
        # Right side: inner=A, outer=B (so right_times[0]=A, right_times[1]=B)
        if len(left_times) == 2:
            # Determine which is A vs B: the faster time (lower) is A
            lt0_cs = _parse_time_to_cs(left_times[0])
            lt1_cs = _parse_time_to_cs(left_times[1])
            if lt0_cs and lt1_cs:
                if lt0_cs <= lt1_cs:
                    results.append({'event_text': event_text, 'gender': left_gender, 'cut': 'A', 'time_text': left_times[0]})
                    results.append({'event_text': event_text, 'gender': left_gender, 'cut': 'B', 'time_text': left_times[1]})
                else:
                    results.append({'event_text': event_text, 'gender': left_gender, 'cut': 'A', 'time_text': left_times[1]})
                    results.append({'event_text': event_text, 'gender': left_gender, 'cut': 'B', 'time_text': left_times[0]})
        elif len(left_times) == 1:
            results.append({'event_text': event_text, 'gender': left_gender, 'cut': 'A', 'time_text': left_times[0]})

        if len(right_times) == 2:
            rt0_cs = _parse_time_to_cs(right_times[0])
            rt1_cs = _parse_time_to_cs(right_times[1])
            if rt0_cs and rt1_cs:
                if rt0_cs <= rt1_cs:
                    results.append({'event_text': event_text, 'gender': right_gender, 'cut': 'A', 'time_text': right_times[0]})
                    results.append({'event_text': event_text, 'gender': right_gender, 'cut': 'B', 'time_text': right_times[1]})
                else:
                    results.append({'event_text': event_text, 'gender': right_gender, 'cut': 'A', 'time_text': right_times[1]})
                    results.append({'event_text': event_text, 'gender': right_gender, 'cut': 'B', 'time_text': right_times[0]})
        elif len(right_times) == 1:
            results.append({'event_text': event_text, 'gender': right_gender, 'cut': 'A', 'time_text': right_times[0]})

        # Validation: for the same event, men's A time should be faster than women's A
        _validate_and_fix_gender_swap(results, event_text)
        return

    # Handle undetected dual-gender layout (4 times, no gender set, no layout detected)
    if len(times) == 4 and not gender:
        event_idx = _find_event_column(cells, time_pattern)
        if event_idx is not None:
            left_times = [t for t, p in zip(times, time_positions) if p < event_idx]
            right_times = [t for t, p in zip(times, time_positions) if p > event_idx]
        else:
            left_times = times[:2]
            right_times = times[2:]

        # Without header info, use time comparison: men's times are faster
        left_a = _parse_time_to_cs(left_times[0]) if len(left_times) >= 1 else None
        right_a = _parse_time_to_cs(right_times[0]) if len(right_times) >= 1 else None

        if left_a and right_a:
            # Faster side = men (lower centiseconds = faster)
            faster_a = min(_parse_time_to_cs(t) or 99999 for t in left_times)
            slower_a = min(_parse_time_to_cs(t) or 99999 for t in right_times)
            if faster_a <= slower_a:
                left_gender, right_gender = 'M', 'F'
            else:
                left_gender, right_gender = 'F', 'M'
        else:
            # Can't determine — default to World Aquatics standard layout
            left_gender, right_gender = 'F', 'M'

        for lt in left_times:
            lt_cs = _parse_time_to_cs(lt)
            all_left_cs = [_parse_time_to_cs(t) for t in left_times]
            cut = 'A' if lt_cs == min(c for c in all_left_cs if c) else 'B'
            results.append({'event_text': event_text, 'gender': left_gender, 'cut': cut, 'time_text': lt})
        for rt in right_times:
            rt_cs = _parse_time_to_cs(rt)
            all_right_cs = [_parse_time_to_cs(t) for t in right_times]
            cut = 'A' if rt_cs == min(c for c in all_right_cs if c) else 'B'
            results.append({'event_text': event_text, 'gender': right_gender, 'cut': cut, 'time_text': rt})
        return

    # Handle 2 times with no gender (one per gender, no A/B)
    if len(times) == 2 and not gender:
        event_idx = _find_event_column(cells, time_pattern)
        if event_idx is not None:
            left_times = [t for t, p in zip(times, time_positions) if p < event_idx]
            right_times = [t for t, p in zip(times, time_positions) if p > event_idx]
            if len(left_times) == 1 and len(right_times) == 1:
                lt_cs = _parse_time_to_cs(left_times[0])
                rt_cs = _parse_time_to_cs(right_times[0])
                if lt_cs and rt_cs:
                    if lt_cs <= rt_cs:
                        left_g, right_g = 'M', 'F'
                    else:
                        left_g, right_g = 'F', 'M'
                else:
                    left_g, right_g = 'F', 'M'
                if gender_layout and 'left' in gender_layout:
                    left_g = gender_layout['left']
                    right_g = gender_layout['right']
                results.append({'event_text': event_text, 'gender': left_g, 'cut': 'A', 'time_text': left_times[0]})
                results.append({'event_text': event_text, 'gender': right_g, 'cut': 'A', 'time_text': right_times[0]})
                return

    # Detect gender from event text if not set
    g = gender
    lower_event = event_text.lower()
    if 'women' in lower_event or 'female' in lower_event:
        g = 'F'
        event_text = re.sub(r'(?i)\b(women|female)[\'s]*\s*', '', event_text).strip()
    elif 'men' in lower_event or 'male' in lower_event:
        g = 'M'
        event_text = re.sub(r'(?i)\b(men|male)[\'s]*\s*', '', event_text).strip()

    if not g:
        return

    # First time = A cut, second = B cut (if present)
    if len(times) >= 1:
        results.append({'event_text': event_text, 'gender': g, 'cut': 'A', 'time_text': times[0]})
    if len(times) >= 2:
        results.append({'event_text': event_text, 'gender': g, 'cut': 'B', 'time_text': times[1]})


def _find_event_column(cells, time_pattern):
    """Find the index of the event name column in a row."""
    for i, c in enumerate(cells):
        c_stripped = str(c).strip()
        if c_stripped and not time_pattern.match(c_stripped) and not re.match(r'^\d+$', c_stripped):
            # Looks like an event name (has distance + stroke pattern)
            if re.search(r'\d+\s*m?\s*(free|back|breast|fly|butter|medley|im\b)', c_stripped, re.I):
                return i
    return None


def _validate_and_fix_gender_swap(results, event_text):
    """Validate that men's A time is faster than women's A for same event.

    If swapped, fix the gender assignments in the last batch of results.
    """
    # Find the most recent results for this event
    event_results = [r for r in results if r['event_text'] == event_text]
    men_a = [r for r in event_results if r['gender'] == 'M' and r['cut'] == 'A']
    women_a = [r for r in event_results if r['gender'] == 'F' and r['cut'] == 'A']

    if men_a and women_a:
        men_cs = _parse_time_to_cs(men_a[0]['time_text'])
        women_cs = _parse_time_to_cs(women_a[0]['time_text'])
        if men_cs and women_cs and men_cs > women_cs:
            # Men's time is slower than women's — they're swapped!
            for r in event_results:
                r['gender'] = 'F' if r['gender'] == 'M' else 'M'


def _extract_from_line(line, gender, results):
    """Extract event and times from a text line."""
    time_pattern = re.compile(r'\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2}')
    times = time_pattern.findall(line)
    if not times:
        return

    # Remove times to get event text
    event_text = time_pattern.sub('', line).strip()
    event_text = re.sub(r'\s{2,}', ' ', event_text).strip(' -|')
    if not event_text:
        return

    g = gender
    lower = event_text.lower()
    if 'women' in lower or 'female' in lower:
        g = 'F'
        event_text = re.sub(r'(?i)\b(women|female)[\'s]*\s*', '', event_text).strip()
    elif 'men' in lower or 'male' in lower:
        g = 'M'
        event_text = re.sub(r'(?i)\b(men|male)[\'s]*\s*', '', event_text).strip()

    if not g:
        return

    if len(times) >= 1:
        results.append({'event_text': event_text, 'gender': g, 'cut': 'A', 'time_text': times[0]})
    if len(times) >= 2:
        results.append({'event_text': event_text, 'gender': g, 'cut': 'B', 'time_text': times[1]})


class QualifyingStandardViewSet(viewsets.ModelViewSet):
    queryset = QualifyingStandard.objects.annotate(times_count=Count('times'))

    def get_serializer_class(self):
        if self.action == 'list':
            return QualifyingStandardListSerializer
        return QualifyingStandardSerializer

    @action(detail=True, methods=['post'], url_path='upload-pdf',
            parser_classes=[MultiPartParser, FormParser])
    def upload_pdf(self, request, pk=None):
        """Parse a qualifying times PDF and import times into this standard."""
        standard = self.get_object()
        file = request.FILES.get('file')
        pool_override = request.data.get('pool')
        if pool_override and pool_override not in ('LCM', 'SCM'):
            return Response({'error': 'pool must be LCM or SCM'}, status=400)
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        if not file.name.lower().endswith('.pdf'):
            return Response({'error': 'Only PDF files are supported'}, status=400)

        try:
            parsed, detected_pool = _parse_qualifying_pdf(file)
        except Exception as e:
            return Response({'error': f'Failed to parse PDF: {str(e)}'}, status=400)

        # Fallback pool: user-specified, then document-level detection, then LCM
        fallback_pool = pool_override or detected_pool or 'LCM'

        created = 0
        skipped = []
        pools_used = set()
        for entry in parsed:
            event = _resolve_event(entry['event_text'])
            if not event:
                skipped.append(f"Unknown event: {entry['event_text']}")
                continue

            cs = _parse_time_to_cs(entry['time_text'])
            if not cs:
                skipped.append(f"Invalid time: {entry['time_text']} for {entry['event_text']}")
                continue

            # Use per-entry pool (from page detection) if user didn't override
            entry_pool = entry.get('pool') if not pool_override else pool_override
            pool = entry_pool or fallback_pool
            pools_used.add(pool)

            _, was_created = QualifyingTime.objects.update_or_create(
                standard=standard,
                event=event,
                gender=entry['gender'],
                cut=entry['cut'],
                pool=pool,
                defaults={'time_centiseconds': cs},
            )
            if was_created:
                created += 1

        return Response({
            'created': created,
            'updated': len(parsed) - created - len(skipped),
            'skipped': skipped,
            'total_parsed': len(parsed),
            'detected_pool': detected_pool,
            'pools_used': sorted(pools_used),
        })

    @action(detail=True, methods=['post'], url_path='add-time')
    def add_time(self, request, pk=None):
        """Manually add a single qualifying time."""
        standard = self.get_object()
        event_id = request.data.get('event')
        gender = request.data.get('gender')
        cut = request.data.get('cut')
        time_text = request.data.get('time_text')

        if not all([event_id, gender, cut, time_text]):
            return Response({'error': 'event, gender, cut, and time_text are required'}, status=400)

        pool = request.data.get('pool', 'LCM')
        if pool not in ('LCM', 'SCM'):
            return Response({'error': 'pool must be LCM or SCM'}, status=400)

        try:
            event = Event.objects.get(id=event_id, is_relay=False)
        except Event.DoesNotExist:
            return Response({'error': 'Event not found'}, status=404)

        cs = _parse_time_to_cs(time_text)
        if not cs:
            return Response({'error': f'Invalid time format: {time_text}'}, status=400)

        qt, created = QualifyingTime.objects.update_or_create(
            standard=standard,
            event=event,
            gender=gender,
            cut=cut,
            pool=pool,
            defaults={'time_centiseconds': cs},
        )
        return Response(QualifyingTimeSerializer(qt).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path='times/(?P<time_id>[^/.]+)')
    def delete_time(self, request, pk=None, time_id=None):
        """Delete a single qualifying time."""
        standard = self.get_object()
        try:
            qt = QualifyingTime.objects.get(id=time_id, standard=standard)
        except QualifyingTime.DoesNotExist:
            return Response(status=404)
        qt.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
