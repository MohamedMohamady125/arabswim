from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from .models import Swimmer
from .serializers import SwimmerListSerializer, SwimmerDetailSerializer, SwimmerCreateUpdateSerializer


class SwimmerPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 10000


class SwimmerViewSet(viewsets.ModelViewSet):
    queryset = Swimmer.objects.select_related('nationality').prefetch_related('nicknames')
    pagination_class = SwimmerPagination
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
        if self.action == 'list':
            # Non-Arab swimmers hold meet results but get no profile in
            # the Swimmers section; relay-team placeholders are not athletes
            qs = qs.exclude(nationality__region='OTHER').exclude(is_relay_team=True)
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
        swimmers = Swimmer.objects.filter(name__icontains=q).exclude(
            nationality__region='OTHER').exclude(is_relay_team=True)[:20]
        serializer = SwimmerListSerializer(swimmers, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def birthdays(self, request):
        month = request.query_params.get('month')
        if not month:
            return Response({'error': 'month parameter required'}, status=400)
        swimmers = Swimmer.objects.filter(
            date_of_birth__isnull=False,
            date_of_birth__month=int(month)
        ).exclude(is_relay_team=True).select_related('nationality')
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
        """Get all events this swimmer has competed in, with result counts.
        Also includes relay events where this swimmer appears in relay_swimmers."""
        swimmer = self.get_object()
        from championships.models import Result
        from django.db.models import Count, Min, Q
        from importer.parsers.base import format_centiseconds

        # Individual events, split per pool (SCM and LCM times are not
        # comparable, so each gets its own entry and best time)
        events = Result.objects.filter(swimmer=swimmer).values(
            'event__id', 'event__name', 'event__distance', 'event__stroke',
            'championship__pool',
        ).annotate(
            times_count=Count('id'),
            best_time=Min('time_centiseconds'),
        ).order_by('event__sort_order', 'event__distance', '-championship__pool')

        data = []
        seen_keys = set()
        for e in events:
            pool = e['championship__pool'] or ''
            seen_keys.add((e['event__id'], pool))
            data.append({
                'event_id': e['event__id'],
                'event_name': e['event__name'],
                'distance': e['event__distance'],
                'stroke': e['event__stroke'],
                'pool': pool,
                'times_count': e['times_count'],
                'best_time': format_centiseconds(e['best_time']),
                'best_time_centiseconds': e['best_time'],
                'is_relay': False,
            })

        # Relay events where this swimmer appears in relay_swimmers JSON.
        # Prefilter in the DB with a text match on the JSON column, then
        # verify the exact name in Python (works on Postgres and sqlite).
        from django.db.models import TextField
        from django.db.models.functions import Cast
        relay_results = Result.objects.filter(
            relay_swimmers__isnull=False,
            event__is_relay=True,
        ).annotate(
            relay_swimmers_text=Cast('relay_swimmers', TextField()),
        ).filter(
            relay_swimmers_text__icontains=swimmer.name,
        ).select_related('event', 'championship')

        matched_relays = {}
        for r in relay_results:
            if not r.relay_swimmers:
                continue
            for s in r.relay_swimmers:
                name = s.get('name', '') if isinstance(s, dict) else (s if isinstance(s, str) else '')
                if name.upper() == swimmer.name.upper():
                    key = (r.event_id, r.championship.pool or '')
                    if key not in matched_relays:
                        matched_relays[key] = {'results': [], 'event': r.event}
                    matched_relays[key]['results'].append(r)
                    break

        for (eid, pool), info in matched_relays.items():
            if (eid, pool) in seen_keys:
                continue
            ev = info['event']
            best_cs = min(r.time_centiseconds for r in info['results'])
            data.append({
                'event_id': ev.id,
                'event_name': ev.name,
                'distance': ev.distance,
                'stroke': ev.stroke,
                'pool': pool,
                'times_count': len(info['results']),
                'best_time': format_centiseconds(best_cs),
                'best_time_centiseconds': best_cs,
                'is_relay': True,
            })

        return Response(data)

    @action(detail=True, methods=['get'], url_path='events/(?P<event_id>[^/.]+)/history')
    def event_history(self, request, pk=None, event_id=None):
        """Get all times for a swimmer in a specific event.
        For relay events, finds results where swimmer appears in relay_swimmers."""
        swimmer = self.get_object()
        from championships.models import Result
        from core.models import Event
        from importer.parsers.base import format_centiseconds

        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response({'error': 'Event not found'}, status=404)
        data = []
        pool = request.query_params.get('pool')

        if event.is_relay:
            # Search relay results for this swimmer's name
            relay_results = Result.objects.filter(
                event_id=event_id,
                relay_swimmers__isnull=False,
            ).select_related('championship', 'championship__country', 'event').order_by('championship__date')
            if pool:
                relay_results = relay_results.filter(championship__pool=pool)

            for r in relay_results:
                if not r.relay_swimmers:
                    continue
                # Find this swimmer in the relay
                swimmer_split = None
                found = False
                for s in r.relay_swimmers:
                    if isinstance(s, dict):
                        if s.get('name', '').upper() == swimmer.name.upper():
                            swimmer_split = s.get('split_time', '')
                            found = True
                            break
                    elif isinstance(s, str) and s.upper() == swimmer.name.upper():
                        found = True
                        break

                if not found:
                    continue

                data.append({
                    'id': r.id,
                    'time': format_centiseconds(r.time_centiseconds),
                    'time_centiseconds': r.time_centiseconds,
                    'split_time': swimmer_split or '',
                    'round_type': r.round_type,
                    'fina_points': r.fina_points,
                    'team': r.swimmer.name,  # Team/club name
                    'is_relay': True,
                    'relay_swimmers': r.relay_swimmers,
                    'championship_id': r.championship.id,
                    'championship_name': r.championship.name,
                    'championship_date': r.championship.date,
                    'championship_location': r.championship.location,
                    'championship_country': r.championship.country.name if r.championship.country else '',
                    'pool': r.championship.pool,
                    'age_at_competition': r.age_at_competition,
                })
        else:
            # Individual event
            results = Result.objects.filter(
                swimmer=swimmer, event_id=event_id
            ).select_related('championship', 'championship__country', 'event').order_by('championship__date')
            if pool:
                results = results.filter(championship__pool=pool)

            for r in results:
                data.append({
                    'id': r.id,
                    'time': format_centiseconds(r.time_centiseconds),
                    'time_centiseconds': r.time_centiseconds,
                    'round_type': r.round_type,
                    'fina_points': r.fina_points,
                    'team': r.team,
                    'is_relay': False,
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
        from core.uploads import validate_image
        err = validate_image(photo)
        if err:
            return Response({'error': err}, status=400)
        swimmer.photo = photo
        swimmer.save()
        return Response({'photo': swimmer.photo.url})
