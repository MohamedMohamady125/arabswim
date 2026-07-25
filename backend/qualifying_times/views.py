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
        return Event.objects.filter(name__iexact=canonical, is_relay=False).first()
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
    return None


def _parse_qualifying_pdf(file_obj):
    """Extract qualifying times from a PDF document.

    Expected format per line (flexible): event name, then time(s) for A/B cuts.
    Returns list of dicts: {event_text, gender, cut, time_text}.
    """
    import pdfplumber

    results = []
    current_gender = None

    with pdfplumber.open(file_obj) as pdf:
        for page in pdf.pages:
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
                        # Detect gender headers
                        lower = row_text.lower()
                        # Dual-gender header (e.g. "Men's ... Event ... Women's")
                        if 'men' in lower and 'women' in lower:
                            current_gender = None  # let cell-level logic split
                            continue
                        if 'men' in lower and 'women' not in lower:
                            current_gender = 'M'
                            continue
                        if 'women' in lower or 'female' in lower:
                            current_gender = 'F'
                            continue
                        if 'male' in lower and 'female' not in lower:
                            current_gender = 'M'
                            continue

                        # Try to find event + times in columns
                        cells = [str(c or '').strip() for c in row if c]
                        _extract_from_cells(cells, current_gender, results)
            else:
                # Fall back to text extraction
                text = page.extract_text() or ''
                for line in text.split('\n'):
                    line = line.strip()
                    if not line:
                        continue
                    lower = line.lower()
                    if ('men' in lower and 'women' not in lower) or lower.strip() == 'male':
                        current_gender = 'M'
                        continue
                    if 'women' in lower or 'female' in lower:
                        current_gender = 'F'
                        continue

                    _extract_from_line(line, current_gender, results)

    return results


def _extract_from_cells(cells, gender, results):
    """Extract event and times from table row cells."""
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

    # Handle "Men's | Event | Women's" layout: event in middle with 4 times
    # (men_A, men_B, women_A, women_B) — split into two gendered entries
    if len(times) == 4 and not gender:
        # Find event position to split left (men) vs right (women) times
        event_idx = None
        for i, c in enumerate(cells):
            c_stripped = str(c).strip()
            if c_stripped and not time_pattern.match(c_stripped) and not re.match(r'^\d+$', c_stripped):
                if re.search(r'\d+m\s', c_stripped):
                    event_idx = i
                    break
        if event_idx is not None:
            left_times = [t for t, p in zip(times, time_positions) if p < event_idx]
            right_times = [t for t, p in zip(times, time_positions) if p > event_idx]
        else:
            # Fallback: first 2 = men, last 2 = women
            left_times = times[:2]
            right_times = times[2:]
        if len(left_times) >= 1:
            results.append({'event_text': event_text, 'gender': 'M', 'cut': 'A', 'time_text': left_times[0]})
        if len(left_times) >= 2:
            results.append({'event_text': event_text, 'gender': 'M', 'cut': 'B', 'time_text': left_times[1]})
        if len(right_times) >= 1:
            results.append({'event_text': event_text, 'gender': 'F', 'cut': 'A', 'time_text': right_times[0]})
        if len(right_times) >= 2:
            results.append({'event_text': event_text, 'gender': 'F', 'cut': 'B', 'time_text': right_times[1]})
        return

    # Handle "Men's | Event | Women's" layout with 2 times (one per gender, no A/B)
    if len(times) == 2 and not gender:
        event_idx = None
        for i, c in enumerate(cells):
            c_stripped = str(c).strip()
            if c_stripped and not time_pattern.match(c_stripped) and not re.match(r'^\d+$', c_stripped):
                if re.search(r'\d+m\s', c_stripped):
                    event_idx = i
                    break
        if event_idx is not None:
            left_times = [t for t, p in zip(times, time_positions) if p < event_idx]
            right_times = [t for t, p in zip(times, time_positions) if p > event_idx]
            if len(left_times) == 1 and len(right_times) == 1:
                results.append({'event_text': event_text, 'gender': 'M', 'cut': 'A', 'time_text': left_times[0]})
                results.append({'event_text': event_text, 'gender': 'F', 'cut': 'A', 'time_text': right_times[0]})
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
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        if not file.name.lower().endswith('.pdf'):
            return Response({'error': 'Only PDF files are supported'}, status=400)

        try:
            parsed = _parse_qualifying_pdf(file)
        except Exception as e:
            return Response({'error': f'Failed to parse PDF: {str(e)}'}, status=400)

        created = 0
        skipped = []
        for entry in parsed:
            event = _resolve_event(entry['event_text'])
            if not event:
                skipped.append(f"Unknown event: {entry['event_text']}")
                continue

            cs = _parse_time_to_cs(entry['time_text'])
            if not cs:
                skipped.append(f"Invalid time: {entry['time_text']} for {entry['event_text']}")
                continue

            _, was_created = QualifyingTime.objects.update_or_create(
                standard=standard,
                event=event,
                gender=entry['gender'],
                cut=entry['cut'],
                defaults={'time_centiseconds': cs},
            )
            if was_created:
                created += 1

        return Response({
            'created': created,
            'updated': len(parsed) - created - len(skipped),
            'skipped': skipped,
            'total_parsed': len(parsed),
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
