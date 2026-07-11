from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from .models import ClassificationCategory, Classification, SubClassification, Championship, Result
from .serializers import (
    ClassificationCategorySerializer, ClassificationSerializer, SubClassificationSerializer,
    ChampionshipListSerializer, ChampionshipDetailSerializer,
    ResultSerializer, ResultCreateSerializer
)


class ClassificationCategoryViewSet(viewsets.ModelViewSet):
    queryset = ClassificationCategory.objects.all()
    serializer_class = ClassificationCategorySerializer
    pagination_class = None


class ClassificationViewSet(viewsets.ModelViewSet):
    queryset = Classification.objects.all()
    serializer_class = ClassificationSerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        return qs


class SubClassificationViewSet(viewsets.ModelViewSet):
    queryset = SubClassification.objects.all()
    serializer_class = SubClassificationSerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        classification = self.request.query_params.get('classification')
        if classification:
            qs = qs.filter(classification_id=classification)
        return qs


class ChampionshipPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 200


class ChampionshipViewSet(viewsets.ModelViewSet):
    queryset = Championship.objects.select_related('country', 'classification', 'sub_classification')
    pagination_class = ChampionshipPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['date', 'name']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.action == 'list':
            return ChampionshipListSerializer
        return ChampionshipDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # List-only filters. They must NOT apply to detail actions: e.g.
        # country-swimmers is called with ?country=<nationality>, and
        # filtering the base queryset by host country would 404 get_object.
        if self.action != 'list':
            return qs
        from django.db.models import Count, Q
        qs = qs.annotate(
            results_count_annotated=Count('results'),
            swimmers_count_annotated=Count(
                'results__swimmer',
                filter=Q(results__swimmer__is_relay_team=False),
                distinct=True,
            ),
        )
        pool = self.request.query_params.get('pool')
        country = self.request.query_params.get('country')
        year = self.request.query_params.get('year')
        classification = self.request.query_params.get('classification')
        sub_classification = self.request.query_params.get('sub_classification')
        if pool:
            qs = qs.filter(pool=pool)
        if country:
            qs = qs.filter(country_id=country)
        if year:
            qs = qs.filter(date__year=int(year))
        if classification:
            qs = qs.filter(classification_id=classification)
        if sub_classification:
            qs = qs.filter(sub_classification_id=sub_classification)
        return qs

    def destroy(self, request, *args, **kwargs):
        championship = self.get_object()
        # Get swimmers who have results ONLY in this championship
        from swimmers.models import Swimmer
        from django.db.models import Count, Q
        swimmer_ids = list(
            championship.results.values_list('swimmer_id', flat=True).distinct()
        )
        # Delete the championship (cascades to results, medals, calendar_events, imports)
        response = super().destroy(request, *args, **kwargs)
        # Clean up orphan swimmers — but only truly orphaned rows: no
        # results in any other championship AND no medals, records or
        # hall-of-fame entries pointing at them.
        if swimmer_ids:
            orphans = Swimmer.objects.filter(
                id__in=swimmer_ids,
                results__isnull=True,
                medals__isnull=True,
                records__isnull=True,
                hall_of_fame_entries__isnull=True,
            )
            orphans.delete()
        return response

    @action(detail=True, methods=['post'], url_path='upload-pdf')
    def upload_pdf(self, request, pk=None):
        championship = self.get_object()
        pdf_file = request.FILES.get('pdf_file')
        from core.uploads import validate_pdf
        err = validate_pdf(pdf_file)
        if err:
            return Response({'error': err}, status=400)
        championship.pdf_file = pdf_file
        championship.save()
        return Response({'message': 'PDF uploaded successfully'})

    @action(detail=True, methods=['post'], url_path='import-excel')
    def import_excel(self, request, pk=None):
        championship = self.get_object()
        excel_file = request.FILES.get('excel_file')
        if not excel_file:
            return Response({'error': 'No Excel file provided'}, status=400)
        # TODO: Parse excel and create results
        return Response({'message': 'Excel import started'})

    @action(detail=True, methods=['get', 'post'])
    def results(self, request, pk=None):
        championship = self.get_object()
        if request.method == 'GET':
            event_id = request.query_params.get('event')
            gender = request.query_params.get('gender')
            show_all_rounds = request.query_params.get('all_rounds')
            results = championship.results.select_related('swimmer', 'swimmer__nationality', 'event')
            if event_id:
                results = results.filter(event_id=event_id)
            if gender:
                # Mixed relays have both M and F placeholder swimmers;
                # don't filter by sex when the caller requests 'X' (Mixed).
                if gender != 'X':
                    results = results.filter(swimmer__sex=gender)
            # By default, show only the best round per swimmer per event
            # If Finals exist for this event, show only Finals
            # Otherwise show all (timed finals / single round)
            if not show_all_rounds and event_id:
                rounds = set(results.values_list('round_type', flat=True))
                if 'Finals' in rounds and len(rounds) > 1:
                    results = results.filter(round_type='Finals')
                elif 'Prelims' in rounds and '' in rounds and len(rounds) > 1:
                    # Has both prelims and unlabeled — keep unlabeled (likely timed finals)
                    results = results.exclude(round_type='Prelims')
            serializer = ResultSerializer(results, many=True)
            return Response(serializer.data)
        else:
            serializer = ResultCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(championship=championship)
            return Response(serializer.data, status=201)

    @action(detail=True, methods=['post'], url_path='add-results')
    def add_results(self, request, pk=None):
        """Bulk-add results for one event/round (manual data entry).

        Payload: {event, gender, round_type, category, rows: [
            {name, birth_year, country, team, time}, ...]}
        Swimmers are matched with the same rules as the PDF importer
        (exact name + birth year / age band), created when new.
        """
        from datetime import date as _date
        from core.models import Event
        from swimmers.models import Swimmer
        from importer.parsers.base import parse_time_to_centiseconds, ParsedResult
        from importer.matcher import find_matching_swimmer, resolve_country, category_band
        from importer.points import calculate_points

        championship = self.get_object()
        data = request.data
        try:
            event = Event.objects.get(id=int(data.get('event')))
        except (Event.DoesNotExist, TypeError, ValueError):
            return Response({'error': 'Valid event id required'}, status=400)
        gender = data.get('gender', 'M')
        if gender not in ('M', 'F'):
            gender = 'M'
        round_type = data.get('round_type', '') or ''
        category = (data.get('category', '') or '').strip()
        rows = data.get('rows') or []
        if not rows:
            return Response({'error': 'rows required'}, status=400)

        band = category_band(category)
        created = updated = 0
        created_swimmers = matched_swimmers = 0
        errors = []

        for i, row in enumerate(rows):
            from teams.utils import strip_squad_number
            name = (row.get('name') or '').strip()
            if event.is_relay:
                name = strip_squad_number(name)
            time_text = (row.get('time') or '').strip()
            if not name or not time_text:
                errors.append({'row': i + 1, 'reason': 'Name and time are required'})
                continue
            time_cs = parse_time_to_centiseconds(time_text)
            if not time_cs or time_cs <= 0:
                errors.append({'row': i + 1, 'reason': f'Invalid time "{time_text}"'})
                continue
            try:
                birth_year = int(row.get('birth_year') or 0)
            except (TypeError, ValueError):
                birth_year = 0
            team = strip_squad_number(row.get('team') or '')

            if event.is_relay:
                swimmer = Swimmer.objects.filter(
                    name__iexact=name, sex=gender, is_relay_team=True).first()
            else:
                pr = ParsedResult(
                    swimmer_name=name, time_text='', birth_year=birth_year,
                    nationality_code=(row.get('country') or '').strip(),
                )
                swimmer, _conf, _mtype = find_matching_swimmer(
                    pr, category=band, meet_date=championship.date)
            if swimmer:
                matched_swimmers += 1
            else:
                nationality = resolve_country((row.get('country') or '').strip()) \
                    or championship.country
                swimmer = Swimmer.objects.create(
                    name=name,
                    birth_year=birth_year or None,
                    nationality=nationality,
                    sex=gender,
                    club=name if event.is_relay else team,
                    is_relay_team=event.is_relay,
                )
                created_swimmers += 1

            fina = calculate_points(time_cs, event.name, gender, championship.pool)
            age = None
            if birth_year and championship.date:
                age = championship.date.year - birth_year

            existing = Result.objects.filter(
                swimmer=swimmer, championship=championship, event=event,
                round_type=round_type, category=category,
            ).first()
            if existing:
                if time_cs < existing.time_centiseconds:
                    existing.time_centiseconds = time_cs
                    existing.fina_points = fina or existing.fina_points
                    if team:
                        existing.team = team
                    existing.save()
                    updated += 1
                else:
                    errors.append({'row': i + 1,
                                   'reason': f'{name}: already has an equal or better time in this event/round'})
                continue

            Result.objects.create(
                swimmer=swimmer, championship=championship, event=event,
                round_type=round_type, category=category,
                team=name if event.is_relay else team,
                time_centiseconds=time_cs,
                fina_points=fina or None,
                age_at_competition=age,
            )
            created += 1

        if created or updated:
            from medals.utils import recompute_medals
            recompute_medals(championship)

        return Response({
            'created': created,
            'updated': updated,
            'created_swimmers': created_swimmers,
            'matched_swimmers': matched_swimmers,
            'errors': errors,
        })

    @action(detail=True, methods=['get'], url_path='country-swimmers')
    def country_swimmers(self, request, pk=None):
        """Swimmers from one country at this championship, with their best swim."""
        from django.db.models import Count, Max
        from importer.parsers.base import format_centiseconds
        championship = self.get_object()
        country_id = request.query_params.get('country')
        if not country_id:
            return Response({'error': 'country query param required'}, status=400)
        results = championship.results.filter(
            swimmer__nationality_id=country_id,
            event__is_relay=False,  # relay rows use team pseudo-swimmers
        ).select_related('swimmer', 'event')

        swimmers = {}
        for r in results:
            s = swimmers.setdefault(r.swimmer_id, {
                'swimmer_id': r.swimmer_id,
                'name': r.swimmer.name,
                'sex': r.swimmer.sex,
                'birth_year': r.swimmer.birth_year,
                'photo': r.swimmer.photo.url if r.swimmer.photo else None,
                'events': set(),
                'results_count': 0,
                'best_fina': 0,
                'best_event': '',
                'best_time': '',
            })
            s['events'].add(r.event_id)
            s['results_count'] += 1
            if (r.fina_points or 0) > s['best_fina']:
                s['best_fina'] = r.fina_points or 0
                s['best_event'] = r.event.name
                s['best_time'] = format_centiseconds(r.time_centiseconds)

        data = sorted(swimmers.values(), key=lambda s: (-s['best_fina'], s['name']))
        for s in data:
            s['events_count'] = len(s.pop('events'))
        return Response(data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get comprehensive stats for a championship."""
        from django.db.models import Count, Min, Q
        championship = self.get_object()
        results = championship.results.select_related('swimmer', 'swimmer__nationality', 'event')

        # Basic counts
        total_results = results.count()
        # Relay-team placeholders are not athletes — count real swimmers only
        athletes = results.filter(swimmer__is_relay_team=False)
        total_swimmers = athletes.values('swimmer').distinct().count()
        total_events = results.values('event').distinct().count()
        male_count = athletes.filter(swimmer__sex='M').values('swimmer').distinct().count()
        female_count = athletes.filter(swimmer__sex='F').values('swimmer').distinct().count()

        # Events split by gender.
        # Mixed relays contain both male and female placeholder swimmers;
        # group them under gender 'X' so they appear once, not twice.
        from django.db.models import Case, When, Value, CharField
        events = results.annotate(
            effective_gender=Case(
                When(event__name__icontains='mixed', then=Value('X')),
                default='swimmer__sex',
                output_field=CharField(),
            ),
        ).values(
            'event__id', 'event__name', 'event__distance', 'event__stroke',
            'event__sort_order', 'effective_gender'
        ).annotate(
            results_count=Count('id'),
            best_time=Min('time_centiseconds'),
        ).order_by('effective_gender', 'event__sort_order', 'event__distance')

        events_list = []
        for e in events:
            cs = e['best_time']
            mins = cs // 6000
            secs = (cs % 6000) // 100
            cent = cs % 100
            best = f'{mins}:{secs:02d}.{cent:02d}' if mins else f'{secs}.{cent:02d}'
            gender = e['effective_gender']
            gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(gender, 'Men')
            events_list.append({
                'event_id': e['event__id'],
                'event_name': e['event__name'],
                'gender': gender,
                'gender_label': gender_label,
                'display_name': f"{e['event__name']} - {gender_label}",
                'results_count': e['results_count'],
                'best_time': best,
            })

        # Country breakdown
        countries = athletes.values(
            'swimmer__nationality__id',
            'swimmer__nationality__name', 'swimmer__nationality__code', 'swimmer__nationality__flag_url'
        ).annotate(
            swimmers_count=Count('swimmer', distinct=True),
            results_count=Count('id'),
        ).order_by('-swimmers_count')

        # Top performers (best FINA points, deduplicated per swimmer+event)
        from django.db.models import Max, Subquery, OuterRef
        best_per_swimmer_event = (
            athletes.filter(fina_points__isnull=False, fina_points__gt=0)
            .values('swimmer_id', 'event_id')
            .annotate(max_fina=Max('fina_points'))
        )
        # Build lookup of best fina per (swimmer, event)
        best_lookup = {(r['swimmer_id'], r['event_id']): r['max_fina'] for r in best_per_swimmer_event}
        # Get all results, filter to only the best per swimmer+event
        top_candidates = athletes.filter(
            fina_points__isnull=False, fina_points__gt=0
        ).order_by('-fina_points').select_related('swimmer', 'swimmer__nationality', 'event')
        top_list = []
        seen = set()
        for r in top_candidates:
            key = (r.swimmer_id, r.event_id)
            if key in seen:
                continue
            if r.fina_points == best_lookup.get(key):
                seen.add(key)
                top_list.append({
                    'swimmer_id': r.swimmer.id,
                    'swimmer_name': r.swimmer.name,
                    'nationality': r.swimmer.nationality.name,
                    'nationality_code': r.swimmer.nationality.code,
                    'flag_url': r.swimmer.nationality.flag_url,
                    'event_name': r.event.name,
                    'time': r.formatted_time,
                    'fina_points': r.fina_points,
                })
                if len(top_list) >= 10:
                    break

        return Response({
            'total_results': total_results,
            'total_swimmers': total_swimmers,
            'total_events': total_events,
            'male_count': male_count,
            'female_count': female_count,
            'events': events_list,
            'countries': list(countries),
            'top_performers': top_list,
        })


class ResultViewSet(viewsets.ModelViewSet):
    queryset = Result.objects.select_related('swimmer', 'swimmer__nationality', 'championship', 'event')

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ResultCreateSerializer
        return ResultSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        swimmer = self.request.query_params.get('swimmer')
        championship = self.request.query_params.get('championship')
        event = self.request.query_params.get('event')
        if swimmer:
            qs = qs.filter(swimmer_id=swimmer)
        if championship:
            qs = qs.filter(championship_id=championship)
        if event:
            qs = qs.filter(event_id=event)
        return qs

    def perform_create(self, serializer):
        result = serializer.save()
        self._recompute(result.championship)

    def perform_update(self, serializer):
        result = serializer.save()
        self._recompute(result.championship)

    def perform_destroy(self, instance):
        championship = instance.championship
        instance.delete()
        self._recompute(championship)

    @staticmethod
    def _recompute(championship):
        from medals.utils import recompute_medals
        recompute_medals(championship)
