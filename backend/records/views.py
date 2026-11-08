from rest_framework import viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Min, F
from core.audit import AuditLogMixin
from .models import Record
from .serializers import RecordSerializer, RecordCreateSerializer


def _fmt_cs(cs):
    """centiseconds → 'H:MM:SS.hh' / 'M:SS.hh' / 'SS.hh' (hours for open water)."""
    hours = cs // 360000
    minutes = (cs % 360000) // 6000
    seconds = (cs % 6000) // 100
    centis = cs % 100
    if hours:
        return f'{hours}:{minutes:02d}:{seconds:02d}.{centis:02d}'
    if minutes:
        return f'{minutes}:{seconds:02d}.{centis:02d}'
    return f'{seconds}.{centis:02d}'


class RecordViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Record.objects.select_related('swimmer', 'swimmer__nationality', 'event')
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['swimmer__name']
    ordering_fields = ['result_date', 'time_centiseconds']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return RecordCreateSerializer
        return RecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        record_type = self.request.query_params.get('record_type')
        event = self.request.query_params.get('event')
        swimmer = self.request.query_params.get('swimmer')
        is_new = self.request.query_params.get('is_new')
        pool = self.request.query_params.get('pool')
        gender = self.request.query_params.get('gender')
        if record_type:
            qs = qs.filter(record_type=record_type)
        if pool:
            qs = qs.filter(pool=pool)
        if gender:
            qs = qs.filter(swimmer__sex=gender)
        if event:
            qs = qs.filter(event_id=event)
        if swimmer:
            qs = qs.filter(swimmer_id=swimmer)
        if is_new is not None:
            qs = qs.filter(is_new=is_new.lower() == 'true')
        return qs

    @action(detail=False, methods=['get'])
    def new(self, request):
        records = self.get_queryset().filter(is_new=True)
        page = self.paginate_queryset(records)
        if page is not None:
            serializer = RecordSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = RecordSerializer(records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """Blank Excel template (header + one example row) for the records
        import on the New Records page."""
        import io
        from django.http import HttpResponse
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = 'Records'
        headers = ['Swimmer', 'Event', 'Time', 'Scope', 'Pool', 'Age Category',
                   'Date', 'Meet', 'Location', 'Country']
        ws.append(headers)
        ws.append(['Ahmed Ayoub HAFNAOUI', '1500 M Freestyle', '14:31.54',
                   'Arab', 'LCM', 'Open', '2023-07-30',
                   'World Championships', 'Fukuoka, Japan', 'Tunisia'])
        for col, width in zip('ABCDEFGHIJ', (28, 20, 10, 10, 7, 13, 12, 28, 20, 14)):
            ws.column_dimensions[col].width = width
        buf = io.BytesIO()
        wb.save(buf)
        resp = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        resp['Content-Disposition'] = 'attachment; filename="records-import-template.xlsx"'
        return resp

    @action(detail=False, methods=['post'], url_path='import-excel',
            permission_classes=[IsAuthenticated])
    def import_excel(self, request):
        """Import records from an Excel sheet (records only, no results).

        Expected columns (header row, order free, names flexible):
        Swimmer, Event, Time, Scope, Pool, Age Category, Date, Meet,
        Location, Country. Valid rows import; broken rows come back with
        their row number and reason so nothing fails silently. Exact
        duplicates of existing records are skipped.
        """
        import re
        from datetime import date, datetime, time as dtime
        from openpyxl import load_workbook
        from core.models import Country, Event
        from swimmers.models import Swimmer

        f = request.FILES.get('file')
        if not f:
            return Response({'error': 'No file uploaded (field name: file)'}, status=400)
        try:
            wb = load_workbook(f, data_only=True)
        except Exception:
            return Response({'error': 'Could not read the file — is it a valid .xlsx?'}, status=400)
        ws = wb.active

        COL_ALIASES = {
            'swimmer': {'swimmer', 'swimmer name', 'name', 'athlete'},
            'event': {'event', 'event name', 'race'},
            'time': {'time', 'result', 'mark'},
            'record_type': {'scope', 'record type', 'record_type', 'type', 'record'},
            'pool': {'pool', 'course'},
            'age_category': {'age category', 'age_category', 'age', 'category'},
            'date': {'date', 'result date', 'result_date'},
            'meet_name': {'meet', 'meet name', 'meet_name', 'championship', 'competition'},
            'location': {'location', 'city', 'place'},
            'country': {'country', 'nation', 'nationality'},
        }
        header = [str(c.value).strip().lower() if c.value is not None else ''
                  for c in next(ws.iter_rows(min_row=1, max_row=1))]
        colmap = {}
        for idx, h in enumerate(header):
            for field, aliases in COL_ALIASES.items():
                if h in aliases and field not in colmap:
                    colmap[field] = idx
        missing = [f for f in ('swimmer', 'event', 'time', 'record_type', 'date')
                   if f not in colmap]
        if missing:
            return Response({'error': f'Missing required column(s): {", ".join(missing)}. '
                                      'Download the template to see the expected headers.'},
                            status=400)

        STROKES = {
            'free': 'Freestyle', 'freestyle': 'Freestyle', 'fr': 'Freestyle',
            'back': 'Backstroke', 'backstroke': 'Backstroke', 'bk': 'Backstroke',
            'breast': 'Breaststroke', 'breaststroke': 'Breaststroke', 'br': 'Breaststroke',
            'fly': 'Butterfly', 'butterfly': 'Butterfly', 'bf': 'Butterfly',
            'im': 'Individual Medley', 'medley': 'Individual Medley',
            'individual medley': 'Individual Medley',
        }
        TYPES = {c[0].lower(): c[0] for c in Record.RECORD_TYPE_CHOICES}
        TYPES.update({c[1].lower(): c[0] for c in Record.RECORD_TYPE_CHOICES})

        def parse_time_cell(v):
            if v is None:
                return None
            if isinstance(v, dtime):            # Excel time cell
                return ((v.hour * 60 + v.minute) * 60 + v.second) * 100 + v.microsecond // 10000
            if isinstance(v, (int, float)):     # plain seconds e.g. 27.45
                return round(float(v) * 100) if v > 0 else None
            s = str(v).strip().replace(',', '.')
            m = re.match(r'^(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d{1,2}))?$', s)
            if not m:
                return None
            h_or_m, mm, ss, hh = m.groups()
            hh = int((hh or '0').ljust(2, '0'))
            total = int(ss)
            if mm is not None:                  # H:MM:SS
                total += int(mm) * 60 + int(h_or_m) * 3600
            elif h_or_m is not None:            # M:SS
                total += int(h_or_m) * 60
            return total * 100 + hh if total or hh else None

        def parse_date_cell(v):
            if isinstance(v, datetime):
                return v.date()
            if isinstance(v, date):
                return v
            s = str(v or '').strip()
            for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%Y/%m/%d'):
                try:
                    return datetime.strptime(s, fmt).date()
                except ValueError:
                    continue
            return None

        def find_event(raw):
            s = str(raw or '').strip()
            if not s:
                return None
            ev = Event.objects.filter(name__iexact=s).first()
            if ev:
                return ev
            m = re.match(r'^(\d+)\s*m?\s+(.+)$', s, re.I)
            if m:
                dist, stroke_raw = int(m.group(1)), m.group(2).strip().lower()
                stroke = STROKES.get(stroke_raw)
                if stroke:
                    return (Event.objects.filter(name__iexact=f'{dist} M {stroke}').first()
                            or Event.objects.filter(is_relay=False, distance=dist,
                                                    stroke=stroke).first())
            return None

        def norm_name(n):
            return ' '.join(str(n or '').lower().split())

        # Name lookup over all individual swimmers: exact normalized name,
        # plus order-insensitive token key (SURNAME Given vs Given SURNAME)
        by_name, by_tokens = {}, {}
        for s in Swimmer.objects.filter(is_relay_team=False).select_related('nationality'):
            k = norm_name(s.name)
            by_name.setdefault(k, []).append(s)
            by_tokens.setdefault(' '.join(sorted(k.split())), []).append(s)

        created, duplicates, errors = 0, 0, []
        for rownum, row in enumerate(ws.iter_rows(min_row=2), start=2):
            vals = [c.value for c in row]
            if all(v is None or str(v).strip() == '' for v in vals):
                continue

            def cell(field):
                i = colmap.get(field)
                return vals[i] if i is not None and i < len(vals) else None

            raw_name = str(cell('swimmer') or '').strip()
            matches = by_name.get(norm_name(raw_name)) \
                or by_tokens.get(' '.join(sorted(norm_name(raw_name).split()))) or []
            if not raw_name:
                errors.append({'row': rownum, 'error': 'Missing swimmer name'})
                continue
            if not matches:
                errors.append({'row': rownum, 'error': f'Swimmer not found: "{raw_name}"'})
                continue
            if len(matches) > 1:
                errors.append({'row': rownum,
                               'error': f'Several swimmers are named "{raw_name}" — add them manually'})
                continue
            swimmer = matches[0]

            event = find_event(cell('event'))
            if not event:
                errors.append({'row': rownum, 'error': f'Unknown event: "{cell("event")}"'})
                continue

            cs = parse_time_cell(cell('time'))
            if not cs:
                errors.append({'row': rownum,
                               'error': f'Could not read time "{cell("time")}" (use 27.45 or 1:56.30)'})
                continue

            rtype = TYPES.get(str(cell('record_type') or '').strip().lower()
                              .removesuffix(' records').removesuffix(' record'))
            if not rtype:
                errors.append({'row': rownum,
                               'error': f'Unknown scope "{cell("record_type")}" '
                                        '(National, Arab, GCC, African, Asian, Mediterranean, Islamic, World)'})
                continue

            rdate = parse_date_cell(cell('date'))
            if not rdate:
                errors.append({'row': rownum,
                               'error': f'Could not read date "{cell("date")}" (use YYYY-MM-DD or DD/MM/YYYY)'})
                continue

            pool_raw = str(cell('pool') or 'LCM').strip().upper()
            pool = {'LCM': 'LCM', '50M': 'LCM', '50': 'LCM',
                    'SCM': 'SCM', '25M': 'SCM', '25': 'SCM',
                    'OW': 'OW', 'OPEN WATER': 'OW'}.get(pool_raw)
            if not pool:
                errors.append({'row': rownum, 'error': f'Unknown pool "{cell("pool")}" (LCM or SCM)'})
                continue

            age_raw = str(cell('age_category') or 'OPEN').strip().upper()
            m_age = re.match(r'^U?\s*(\d{2})$', age_raw)
            age_cat = 'OPEN' if age_raw in ('', 'OPEN') else (f'U{m_age.group(1)}' if m_age else None)
            if age_cat not in dict(Record.AGE_CATEGORY_CHOICES):
                errors.append({'row': rownum, 'error': f'Unknown age category "{cell("age_category")}"'})
                continue

            country = None
            c_raw = str(cell('country') or '').strip()
            if c_raw:
                country = (Country.objects.filter(name__iexact=c_raw).first()
                           or Country.objects.filter(code__iexact=c_raw).first())
                if not country:
                    errors.append({'row': rownum, 'error': f'Unknown country "{c_raw}"'})
                    continue
            if country is None:
                country = swimmer.nationality

            if Record.objects.filter(swimmer=swimmer, event=event, record_type=rtype,
                                     pool=pool, age_category=age_cat,
                                     time_centiseconds=cs, result_date=rdate).exists():
                duplicates += 1
                continue

            Record.objects.create(
                swimmer=swimmer, event=event, record_type=rtype,
                age_category=age_cat, pool=pool, time_centiseconds=cs,
                result_date=rdate, country=country,
                meet_name=str(cell('meet_name') or '').strip(),
                location=str(cell('location') or '').strip(),
                is_new=True,
            )
            created += 1

        return Response({'created': created, 'duplicates': duplicates, 'errors': errors})

    @action(detail=False, methods=['get'])
    def held(self, request):
        """All computed records held by one swimmer, across every scope
        (national/gcc/arab), pool (LCM/SCM) and age group (U10..U18, OPEN).

        Query params:
          swimmer – swimmer id (required)

        Records that are identical across several age groups (same swim) are
        merged into one entry with a `categories` list.
        """
        from championships.models import Result
        from swimmers.models import Swimmer

        swimmer_id = request.query_params.get('swimmer')
        try:
            swimmer = Swimmer.objects.select_related('nationality').get(id=int(swimmer_id))
        except (Swimmer.DoesNotExist, TypeError, ValueError):
            return Response([])

        region = swimmer.nationality.region if swimmer.nationality else None
        # U18 is the oldest age category shown anywhere on the site (no U19)
        age_groups = [f'U{n}' for n in range(10, 19)] + ['OPEN']

        held = []
        for pool in ('LCM', 'SCM', 'OW'):
            base = Result.objects.filter(
                time_centiseconds__gt=0,
                is_hc=False,
                swimmer__sex=swimmer.sex,
                nationality__region__in=['ARAB', 'GCC'],
            )
            # 'OW' is a virtual pool: open-water swims regardless of the
            # meet's course. Pool records exclude them so they never mix.
            if pool == 'OW':
                base = base.filter(event__stroke='Open Water')
            else:
                base = base.filter(championship__pool=pool).exclude(event__stroke='Open Water')
            rows = list(base.values(
                'event_id', 'event__name', 'event__sort_order', 'event__distance',
                'swimmer_id', 'nationality_id', 'nationality__region',
                'age_at_competition', 'time_centiseconds',
                'championship__name', 'championship__date', 'championship__location',
                'championship__country__name',
                'fina_points',
            ))
            if not rows:
                continue
            # Lead-in split times compete for the SHORTER event's record
            # (first 50 of a 100 — rule 2026-11-04)
            from .models import IntermediateTime
            for ir in IntermediateTime.objects.filter(result__in=base).values(
                'event_id', 'event__name', 'event__sort_order', 'event__distance',
                'result__swimmer_id', 'result__nationality_id',
                'result__nationality__region', 'result__age_at_competition',
                'time_centiseconds', 'result__championship__name',
                'result__championship__date', 'result__championship__location',
                'result__championship__country__name',
            ):
                rows.append({
                    'event_id': ir['event_id'], 'event__name': ir['event__name'],
                    'event__sort_order': ir['event__sort_order'],
                    'event__distance': ir['event__distance'],
                    'swimmer_id': ir['result__swimmer_id'],
                    'nationality_id': ir['result__nationality_id'],
                    'nationality__region': ir['result__nationality__region'],
                    'age_at_competition': ir['result__age_at_competition'],
                    'time_centiseconds': ir['time_centiseconds'],
                    'championship__name': ir['result__championship__name'],
                    'championship__date': ir['result__championship__date'],
                    'championship__location': ir['result__championship__location'],
                    'championship__country__name': ir['result__championship__country__name'],
                    'fina_points': None,
                })

            scopes = [('arab', [r for r in rows])]
            if region == 'GCC':
                scopes.append(('gcc', [r for r in rows if r['nationality__region'] == 'GCC']))
            if swimmer.nationality_id:
                scopes.append(('national', [r for r in rows if r['nationality_id'] == swimmer.nationality_id]))

            for scope, subset in scopes:
                for ag in age_groups:
                    if ag == 'OPEN':
                        pool_rows = subset
                    else:
                        max_age = int(ag[1:])
                        pool_rows = [r for r in subset
                                     if r['age_at_competition'] is not None and r['age_at_competition'] <= max_age]
                    best = {}
                    for r in pool_rows:
                        b = best.get(r['event_id'])
                        if b is None or (r['time_centiseconds'], r['championship__date']) < (b['time_centiseconds'], b['championship__date']):
                            best[r['event_id']] = r
                    for r in best.values():
                        if r['swimmer_id'] == swimmer.id:
                            held.append({'scope': scope, 'pool': pool, 'age_group': ag, 'row': r})

        # Merge identical records (same swim holding several age categories)
        merged = {}
        order = []
        for h in held:
            r = h['row']
            key = (h['scope'], h['pool'], r['event_id'], r['time_centiseconds'], r['championship__date'])
            if key not in merged:
                cs = r['time_centiseconds']
                time_str = _fmt_cs(cs)
                merged[key] = {
                    'scope': h['scope'], 'pool': h['pool'],
                    'event_id': r['event_id'], 'event_name': r['event__name'],
                    'event_sort_order': r['event__sort_order'], 'event_distance': r['event__distance'],
                    'time': time_str, 'time_centiseconds': cs,
                    'championship_name': r['championship__name'],
                    'championship_location': r['championship__location'],
                    'championship_country': r['championship__country__name'] or '',
                    'fina_points': r['fina_points'],
                    'date': r['championship__date'].isoformat() if r['championship__date'] else '',
                    'categories': [],
                }
                order.append(key)
            merged[key]['categories'].append(h['age_group'])

        results = [merged[k] for k in order]
        results.sort(key=lambda r: (r['scope'], r['pool'], r['event_sort_order'], r['event_distance']))
        return Response(results)

    # Which Arab countries are eligible for each continental record scope
    # (IOC codes incl. legacy variants still present in older data).
    CONTINENTAL_ELIGIBILITY = {
        'AFRICAN': {'MTN', 'MAR', 'ALG', 'TUN', 'LBY', 'LBA', 'EGY', 'SUD', 'COM', 'DJI', 'SOM'},
        'ASIAN': {'PLE', 'JOR', 'LBN', 'LIB', 'SYR', 'YEM', 'IRQ', 'QAT', 'KSA',
                  'BHR', 'BRN', 'KWT', 'KUW', 'UAE', 'OMA'},
        'MEDITERRANEAN': {'MAR', 'ALG', 'TUN', 'LBY', 'LBA', 'EGY', 'LBN', 'LIB', 'SYR'},
    }

    @action(detail=False, methods=['get'])
    def gaps(self, request):
        """Gap between a swimmer's all-time best times and the current records
        for every scope the swimmer is eligible for: national/gcc/arab
        (computed from results) plus african/asian/mediterranean (manual
        records, only for swimmers from eligible countries).

        Query params:
          swimmer – swimmer id (required)
        """
        from championships.models import Result
        from swimmers.models import Swimmer
        from django.db.models import Min

        swimmer_id = request.query_params.get('swimmer')
        try:
            swimmer = Swimmer.objects.select_related('nationality').get(id=int(swimmer_id))
        except (Swimmer.DoesNotExist, TypeError, ValueError):
            return Response([])

        region = swimmer.nationality.region if swimmer.nationality else None
        fmt = _fmt_cs

        out = []
        for pool in ('LCM', 'SCM', 'OW'):
            own = Result.objects.filter(
                swimmer=swimmer, time_centiseconds__gt=0, event__is_relay=False,
            )
            others = Result.objects.filter(
                time_centiseconds__gt=0, is_hc=False, swimmer__sex=swimmer.sex,
            )
            # 'OW' is a virtual pool holding open-water swims only; pool
            # scopes exclude them so distances never collide across courses.
            if pool == 'OW':
                own = own.filter(event__stroke='Open Water')
                others = others.filter(event__stroke='Open Water')
            else:
                own = own.filter(championship__pool=pool).exclude(event__stroke='Open Water')
                others = others.filter(championship__pool=pool).exclude(event__stroke='Open Water')

            bests = (
                own
                .values('event_id', 'event__name', 'event__sort_order', 'event__distance')
                .annotate(best=Min('time_centiseconds'))
            )
            best_by_event = {b['event_id']: b for b in bests}
            if not best_by_event:
                continue

            rows = list(others.filter(
                nationality__region__in=['ARAB', 'GCC'],
                event_id__in=best_by_event.keys(),
            ).values(
                'event_id', 'swimmer_id', 'swimmer__name',
                'nationality_id', 'nationality__region',
                'time_centiseconds',
            ))

            scopes = [('arab', rows)]
            if region == 'GCC':
                scopes.append(('gcc', [r for r in rows if r['nationality__region'] == 'GCC']))
            if swimmer.nationality_id:
                scopes.append(('national', [r for r in rows if r['nationality_id'] == swimmer.nationality_id]))

            for scope, subset in scopes:
                best_rec = {}
                for r in subset:
                    b = best_rec.get(r['event_id'])
                    if b is None or r['time_centiseconds'] < b['time_centiseconds']:
                        best_rec[r['event_id']] = r
                for ev_id, rec in best_rec.items():
                    b = best_by_event[ev_id]
                    gap_cs = b['best'] - rec['time_centiseconds']
                    record_cs = rec['time_centiseconds']
                    out.append({
                        'scope': scope,
                        'pool': pool,
                        'event_id': ev_id,
                        'event_name': b['event__name'],
                        'event_sort_order': b['event__sort_order'],
                        'event_distance': b['event__distance'],
                        'swimmer_best_cs': b['best'],
                        'swimmer_best': fmt(b['best']),
                        'record_cs': record_cs,
                        'record_time': fmt(record_cs),
                        'record_holder': rec['swimmer__name'],
                        'gap_cs': gap_cs,
                        'gap_time': fmt(abs(gap_cs)),
                        'gap_pct': round((b['best'] / record_cs - 1) * 100, 2) if record_cs else 0,
                        'holds': rec['swimmer_id'] == swimmer.id,
                    })

            # Continental scopes come from manually-added records; each is only
            # visible to swimmers from an eligible country (per federation lists).
            nat_code = (swimmer.nationality.code or '').upper() if swimmer.nationality else ''
            for record_type, eligible in self.CONTINENTAL_ELIGIBILITY.items():
                if nat_code not in eligible:
                    continue
                manual = Record.objects.filter(
                    record_type=record_type, pool=pool,
                    swimmer__sex=swimmer.sex,
                    event_id__in=best_by_event.keys(),
                ).select_related('swimmer').order_by('event_id', 'time_centiseconds')
                best_manual = {}
                for m in manual:
                    if m.event_id not in best_manual:
                        best_manual[m.event_id] = m
                for ev_id, m in best_manual.items():
                    b = best_by_event[ev_id]
                    record_cs = m.time_centiseconds
                    gap_cs = b['best'] - record_cs
                    out.append({
                        'scope': record_type.lower(),
                        'pool': pool,
                        'event_id': ev_id,
                        'event_name': b['event__name'],
                        'event_sort_order': b['event__sort_order'],
                        'event_distance': b['event__distance'],
                        'swimmer_best_cs': b['best'],
                        'swimmer_best': fmt(b['best']),
                        'record_cs': record_cs,
                        'record_time': fmt(record_cs),
                        'record_holder': m.swimmer.name,
                        'gap_cs': gap_cs,
                        'gap_time': fmt(abs(gap_cs)),
                        'gap_pct': round((b['best'] / record_cs - 1) * 100, 2) if record_cs else 0,
                        'holds': m.swimmer_id == swimmer.id,
                    })

        out.sort(key=lambda g: (g['scope'], g['pool'], g['gap_cs']))
        return Response(out)

    @action(detail=False, methods=['get'])
    def computed(self, request):
        """Return the fastest time per event+gender from existing Result data.

        Query params:
          scope           – national, arab, gcc (default: arab)
          country         – country id (required when scope=national)
          classification  – filter championships by Classification id
          sub_classification – filter by SubClassification id
          pool            – LCM or SCM (default: LCM)
          gender          – M or F (omit for both)
          age_group       – e.g. U10..U17, OPEN (default: OPEN)
        """
        from championships.models import Result, Championship
        from core.models import Event
        from swimmers.models import Swimmer

        pool = request.query_params.get('pool', 'LCM')
        classification = request.query_params.get('classification')
        sub_classification = request.query_params.get('sub_classification')
        gender = request.query_params.get('gender')
        scope = request.query_params.get('scope', 'arab')
        country = request.query_params.get('country')
        age_group = request.query_params.get('age_group')
        year = request.query_params.get('year')
        championship = request.query_params.get('championship')

        # Build base queryset: valid timed results from championships
        qs = Result.objects.filter(
            time_centiseconds__gt=0,
            is_hc=False,
        ).exclude(
            nationality__region='OTHER',
        ).select_related(
            'swimmer', 'swimmer__nationality', 'nationality', 'event', 'championship',
            'championship__country',
        )
        # 'OW' is a virtual pool for open-water swims (any meet course);
        # pool records exclude them so distances never mix across courses.
        if pool == 'OW':
            qs = qs.filter(event__stroke='Open Water')
        else:
            qs = qs.filter(championship__pool=pool).exclude(event__stroke='Open Water')

        # Scope filter
        if scope == 'national':
            if country:
                qs = qs.filter(nationality_id=country)
            else:
                return Response([])
        elif scope == 'gcc':
            if country:
                qs = qs.filter(nationality_id=country)
            else:
                qs = qs.filter(nationality__region='GCC')
        else:  # arab (default)
            if country:
                qs = qs.filter(nationality_id=country)
            else:
                qs = qs.filter(nationality__region__in=['ARAB', 'GCC'])

        if classification:
            qs = qs.filter(championship__classification_id=classification)
        if sub_classification:
            qs = qs.filter(championship__sub_classification_id=sub_classification)
        if year:
            try:
                qs = qs.filter(championship__date__year=int(year))
            except (ValueError, TypeError):
                pass
        if championship:
            qs = qs.filter(championship_id=championship)
        if gender:
            from django.db.models import Q
            qs = qs.filter(Q(swimmer__sex=gender) | Q(swimmer__sex='X'))

        # Age group filter
        if age_group and age_group != 'OPEN':
            try:
                max_age = int(age_group.replace('U', ''))
                qs = qs.filter(age_at_competition__lte=max_age)
            except (ValueError, AttributeError):
                pass

        # Exclude non-standard relays (4x50) — only 4x100 and 4x200 are
        # recognised for record purposes
        qs = qs.exclude(event__is_relay=True, event__distance__lt=400)

        # For each (event, gender): find the minimum time
        best_per_event = (
            qs.values('event_id', 'swimmer__sex')
            .annotate(best_time=Min('time_centiseconds'))
        )

        # Now fetch the actual result rows that match those bests
        records = []
        for entry in best_per_event:
            result = (
                qs.filter(
                    event_id=entry['event_id'],
                    swimmer__sex=entry['swimmer__sex'],
                    time_centiseconds=entry['best_time'],
                )
                .order_by('championship__date')
                .first()
            )
            if result:
                time_str = _fmt_cs(result.time_centiseconds)

                records.append({
                    'result_id': result.id,
                    'championship_id': result.championship_id,
                    'event_id': result.event_id,
                    'event_name': result.event.name,
                    'event_distance': result.event.distance,
                    'event_sort_order': result.event.sort_order,
                    'is_relay': result.event.is_relay,
                    'gender': result.swimmer.sex,
                    'swimmer_name': result.swimmer.name,
                    'swimmer_id': result.swimmer_id,
                    'is_relay_team': result.swimmer.is_relay_team,
                    'nationality': (result.nationality or result.swimmer.nationality).name if (result.nationality or result.swimmer.nationality) else '',
                    'nationality_code': (result.nationality or result.swimmer.nationality).code if (result.nationality or result.swimmer.nationality) else '',
                    'nationality_flag': (result.nationality or result.swimmer.nationality).flag_url if (result.nationality or result.swimmer.nationality) else '',
                    'time': time_str,
                    'time_centiseconds': result.time_centiseconds,
                    'fina_points': result.fina_points,
                    'championship_name': result.championship.name,
                    'championship_country': result.championship.country.name if result.championship.country else '',
                    'championship_country_code': result.championship.country.code if result.championship.country else '',
                    'championship_country_flag': result.championship.country.flag_url if result.championship.country else '',
                    'date': result.championship.date.isoformat(),
                })

        # Lead-in split records: a time from the START of a longer race at a
        # shorter standard distance competes for that shorter event's record
        # (the first 50 of a 100 can beat the 50 record — rule 2026-11-04).
        from .models import IntermediateTime
        iqs = IntermediateTime.objects.filter(result__in=qs).select_related(
            'event', 'result', 'result__swimmer', 'result__nationality',
            'result__swimmer__nationality', 'result__event',
            'result__championship', 'result__championship__country')
        ibest = (iqs.values('event_id', 'result__swimmer__sex')
                 .annotate(best_time=Min('time_centiseconds')))
        by_key = {(r['event_id'], r['gender']): r for r in records}
        for entry in ibest:
            key = (entry['event_id'], entry['result__swimmer__sex'])
            cur = by_key.get(key)
            if cur and cur['time_centiseconds'] <= entry['best_time']:
                continue
            it = (iqs.filter(event_id=entry['event_id'],
                             result__swimmer__sex=entry['result__swimmer__sex'],
                             time_centiseconds=entry['best_time'])
                  .order_by('result__championship__date').first())
            if not it:
                continue
            res = it.result
            nat2 = res.nationality or res.swimmer.nationality
            row = {
                'result_id': res.id,
                'championship_id': res.championship_id,
                'event_id': it.event_id,
                'event_name': it.event.name,
                'event_distance': it.event.distance,
                'event_sort_order': it.event.sort_order,
                'is_relay': False,
                'gender': res.swimmer.sex,
                'swimmer_name': res.swimmer.name,
                'swimmer_id': res.swimmer_id,
                'is_relay_team': res.swimmer.is_relay_team,
                'nationality': nat2.name if nat2 else '',
                'nationality_code': nat2.code if nat2 else '',
                'nationality_flag': nat2.flag_url if nat2 else '',
                'time': _fmt_cs(it.time_centiseconds),
                'time_centiseconds': it.time_centiseconds,
                'fina_points': None,
                'championship_name': res.championship.name,
                'championship_country': res.championship.country.name if res.championship.country else '',
                'championship_country_code': res.championship.country.code if res.championship.country else '',
                'championship_country_flag': res.championship.country.flag_url if res.championship.country else '',
                'date': res.championship.date.isoformat() if res.championship.date else '',
                'from_split': True,
                'source_event_name': res.event.name,
                # deep links must open the PARENT swim (filed under the
                # longer source event) in the meet results view
                'source_event_id': res.event_id,
            }
            if cur:
                records.remove(cur)
            records.append(row)
            by_key[key] = row

        # Sort by event sort_order then distance
        records.sort(key=lambda r: (r['gender'], r['event_sort_order'], r['event_distance']))
        return Response(records)
