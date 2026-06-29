from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
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


class ChampionshipViewSet(viewsets.ModelViewSet):
    queryset = Championship.objects.select_related('country')
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['date', 'name']
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action == 'list':
            return ChampionshipListSerializer
        return ChampionshipDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        pool = self.request.query_params.get('pool')
        country = self.request.query_params.get('country')
        year = self.request.query_params.get('year')
        page_size = self.request.query_params.get('page_size')
        if pool:
            qs = qs.filter(pool=pool)
        if country:
            qs = qs.filter(country_id=country)
        if year:
            qs = qs.filter(date__year=int(year))
        if page_size:
            self.pagination_class.page_size = int(page_size)
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
        # Clean up orphan swimmers (no results left in any championship)
        if swimmer_ids:
            orphans = Swimmer.objects.filter(
                id__in=swimmer_ids
            ).annotate(
                result_count=Count('results')
            ).filter(result_count=0)
            orphan_count = orphans.count()
            orphans.delete()
        return response

    @action(detail=True, methods=['post'], url_path='upload-pdf')
    def upload_pdf(self, request, pk=None):
        championship = self.get_object()
        pdf_file = request.FILES.get('pdf_file')
        if not pdf_file:
            return Response({'error': 'No PDF file provided'}, status=400)
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
            results = championship.results.select_related('swimmer', 'swimmer__nationality', 'event')
            if event_id:
                results = results.filter(event_id=event_id)
            if gender:
                results = results.filter(swimmer__sex=gender)
            serializer = ResultSerializer(results, many=True)
            return Response(serializer.data)
        else:
            serializer = ResultCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(championship=championship)
            return Response(serializer.data, status=201)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get comprehensive stats for a championship."""
        from django.db.models import Count, Min, Q
        championship = self.get_object()
        results = championship.results.select_related('swimmer', 'swimmer__nationality', 'event')

        # Basic counts
        total_results = results.count()
        total_swimmers = results.values('swimmer').distinct().count()
        total_events = results.values('event').distinct().count()
        male_count = results.filter(swimmer__sex='M').values('swimmer').distinct().count()
        female_count = results.filter(swimmer__sex='F').values('swimmer').distinct().count()

        # Events split by gender
        events = results.values(
            'event__id', 'event__name', 'event__distance', 'event__stroke',
            'event__sort_order', 'swimmer__sex'
        ).annotate(
            results_count=Count('id'),
            best_time=Min('time_centiseconds'),
        ).order_by('swimmer__sex', 'event__sort_order', 'event__distance')

        events_list = []
        for e in events:
            cs = e['best_time']
            mins = cs // 6000
            secs = (cs % 6000) // 100
            cent = cs % 100
            best = f'{mins}:{secs:02d}.{cent:02d}' if mins else f'{secs}.{cent:02d}'
            gender = e['swimmer__sex']
            gender_label = 'Men' if gender == 'M' else 'Women'
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
        countries = results.values(
            'swimmer__nationality__name', 'swimmer__nationality__code', 'swimmer__nationality__flag_url'
        ).annotate(
            swimmers_count=Count('swimmer', distinct=True),
            results_count=Count('id'),
        ).order_by('-swimmers_count')

        # Top performers (best FINA points)
        top = results.filter(fina_points__isnull=False, fina_points__gt=0).order_by('-fina_points')[:10]
        top_list = []
        for r in top:
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
