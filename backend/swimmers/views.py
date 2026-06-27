from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Swimmer
from .serializers import SwimmerListSerializer, SwimmerDetailSerializer, SwimmerCreateUpdateSerializer


class SwimmerViewSet(viewsets.ModelViewSet):
    queryset = Swimmer.objects.select_related('nationality').prefetch_related('nicknames')
    pagination_class = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'date_of_birth', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return SwimmerListSerializer
        if self.action == 'retrieve':
            return SwimmerDetailSerializer
        return SwimmerCreateUpdateSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        nationality = self.request.query_params.get('nationality')
        sex = self.request.query_params.get('sex')
        if nationality:
            qs = qs.filter(nationality_id=nationality)
        if sex:
            qs = qs.filter(sex=sex)
        return qs

    @action(detail=False, methods=['get'])
    def search(self, request):
        q = request.query_params.get('q', '')
        swimmers = Swimmer.objects.filter(name__icontains=q)[:20]
        serializer = SwimmerListSerializer(swimmers, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def birthdays(self, request):
        month = request.query_params.get('month')
        if not month:
            return Response({'error': 'month parameter required'}, status=400)
        swimmers = Swimmer.objects.filter(
            date_of_birth__month=int(month)
        ).select_related('nationality')
        data = []
        for s in swimmers:
            data.append({
                'id': s.id,
                'name': s.name,
                'date_of_birth': s.date_of_birth,
                'day': s.date_of_birth.day,
                'age': s.age,
                'nationality': s.nationality.name,
                'photo': s.photo.url if s.photo else None,
            })
        return Response(data)

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """Get all events this swimmer has competed in, with result counts."""
        swimmer = self.get_object()
        from championships.models import Result
        from django.db.models import Count, Min

        events = Result.objects.filter(swimmer=swimmer).values(
            'event__id', 'event__name', 'event__distance', 'event__stroke'
        ).annotate(
            times_count=Count('id'),
            best_time=Min('time_centiseconds'),
        ).order_by('event__sort_order', 'event__distance')

        data = []
        for e in events:
            best_cs = e['best_time']
            minutes = best_cs // 6000
            seconds = (best_cs % 6000) // 100
            centis = best_cs % 100
            if minutes:
                best_formatted = f'{minutes}:{seconds:02d}.{centis:02d}'
            else:
                best_formatted = f'{seconds}.{centis:02d}'

            data.append({
                'event_id': e['event__id'],
                'event_name': e['event__name'],
                'distance': e['event__distance'],
                'stroke': e['event__stroke'],
                'times_count': e['times_count'],
                'best_time': best_formatted,
                'best_time_centiseconds': best_cs,
            })
        return Response(data)

    @action(detail=True, methods=['get'], url_path='events/(?P<event_id>[^/.]+)/history')
    def event_history(self, request, pk=None, event_id=None):
        """Get all times for a swimmer in a specific event, with championship details."""
        swimmer = self.get_object()
        from championships.models import Result

        results = Result.objects.filter(
            swimmer=swimmer, event_id=event_id
        ).select_related('championship', 'championship__country', 'event').order_by('championship__date')

        data = []
        for r in results:
            cs = r.time_centiseconds
            minutes = cs // 6000
            seconds = (cs % 6000) // 100
            centis = cs % 100
            if minutes:
                formatted = f'{minutes}:{seconds:02d}.{centis:02d}'
            else:
                formatted = f'{seconds}.{centis:02d}'

            data.append({
                'id': r.id,
                'time': formatted,
                'time_centiseconds': cs,
                'round_type': r.round_type,
                'fina_points': r.fina_points,
                'team': r.team,
                'championship_id': r.championship.id,
                'championship_name': r.championship.name,
                'championship_date': r.championship.date,
                'championship_location': r.championship.location,
                'championship_country': r.championship.country.name if r.championship.country else '',
                'pool': r.championship.pool,
                'age_at_competition': r.age_at_competition,
            })
        return Response(data)

    @action(detail=True, methods=['post'])
    def upload_photo(self, request, pk=None):
        swimmer = self.get_object()
        photo = request.FILES.get('photo')
        if not photo:
            return Response({'error': 'No photo provided'}, status=400)
        swimmer.photo = photo
        swimmer.save()
        return Response({'photo': swimmer.photo.url})
