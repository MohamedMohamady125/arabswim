from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.db.models import Count, Max, Q

from .models import Team, Trophy
from .serializers import (
    TeamListSerializer, TeamDetailSerializer, TeamCreateUpdateSerializer, TrophySerializer
)
from swimmers.serializers import SwimmerListSerializer
from swimmers.models import Swimmer
from championships.models import Result
from medals.models import Medal


class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.select_related('country').prefetch_related('trophies')
    pagination_class = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'founded_year']
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action == 'list':
            return TeamListSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return TeamCreateUpdateSerializer
        return TeamDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        country = self.request.query_params.get('country')
        is_national = self.request.query_params.get('is_national_team')
        if country:
            qs = qs.filter(country_id=country)
        if is_national and is_national.lower() in ('true', 'false'):
            qs = qs.filter(is_national_team=is_national.lower() == 'true')
        return qs

    @action(detail=True, methods=['get'])
    def profile(self, request, pk=None):
        team = self.get_object()
        serializer = TeamDetailSerializer(team)

        # Roster: swimmers whose club matches this team
        roster = Swimmer.objects.filter(
            Q(club__iexact=team.name), is_relay_team=False,
        ).select_related('nationality')
        roster_data = SwimmerListSerializer(roster, many=True).data

        # Best swimmers: by max FINA points from results with this team
        best_swimmers = (
            Result.objects.filter(team__iexact=team.name, swimmer__is_relay_team=False)
            .values('swimmer__id', 'swimmer__name', 'swimmer__nationality__name',
                    'swimmer__nationality__code', 'swimmer__nationality__flag_url')
            .annotate(max_fina=Max('fina_points'))
            .filter(max_fina__isnull=False, max_fina__gt=0)
            .order_by('-max_fina')[:10]
        )
        best_list = [
            {
                'swimmer_id': s['swimmer__id'],
                'name': s['swimmer__name'],
                'nationality': s['swimmer__nationality__name'],
                'nationality_code': s['swimmer__nationality__code'],
                'flag_url': s['swimmer__nationality__flag_url'],
                'fina_points': s['max_fina'],
            }
            for s in best_swimmers
        ]

        # Medal breakdown
        team_medals = Medal.objects.filter(
            Q(swimmer__club__iexact=team.name) | Q(result__team__iexact=team.name)
        ).select_related('championship', 'championship__classification_category')

        medal_counts = {'national': {'GOLD': 0, 'SILVER': 0, 'BRONZE': 0},
                        'international': {'GOLD': 0, 'SILVER': 0, 'BRONZE': 0}}
        for m in team_medals:
            cat = 'international'
            if m.championship.classification_category:
                cat_name = m.championship.classification_category.name.lower()
                if 'national' in cat_name or 'local' in cat_name:
                    cat = 'national'
            medal_counts[cat][m.medal_type] += 1

        return Response({
            'team': serializer.data,
            'roster': roster_data,
            'best_swimmers': best_list,
            'medal_counts': medal_counts,
        })

    @action(detail=True, methods=['get'])
    def times(self, request, pk=None):
        team = self.get_object()
        results = (
            Result.objects.filter(team__iexact=team.name)
            .select_related('swimmer', 'swimmer__nationality', 'championship', 'championship__country', 'event')
            .order_by('event__sort_order', 'event__distance', 'time_centiseconds')
        )

        event_filter = request.query_params.get('event')
        gender = request.query_params.get('gender')
        if event_filter:
            results = results.filter(event_id=event_filter)
        if gender:
            results = results.filter(swimmer__sex=gender)

        data = []
        for r in results:
            data.append({
                'id': r.id,
                'event_name': r.event.name,
                'event_id': r.event.id,
                'is_relay': r.event.is_relay,
                'swimmer_id': r.swimmer.id,
                'swimmer_name': r.swimmer.name,
                'swimmer_sex': r.swimmer.sex,
                'time': r.formatted_time,
                'time_centiseconds': r.time_centiseconds,
                'fina_points': r.fina_points,
                'championship_name': r.championship.name,
                'championship_date': str(r.championship.date),
                'championship_location': r.championship.location,
                'championship_country': r.championship.country.name if r.championship.country else '',
                'pool': r.championship.pool,
                'age_at_competition': r.age_at_competition,
            })

        return Response(data)

    @action(detail=True, methods=['get'])
    def medals(self, request, pk=None):
        team = self.get_object()
        team_medals = (
            Medal.objects.filter(
                Q(swimmer__club__iexact=team.name) | Q(result__team__iexact=team.name)
            )
            .select_related('swimmer', 'championship', 'championship__country', 'event')
            .order_by('-championship__date')
        )

        data = []
        for m in team_medals:
            data.append({
                'id': m.id,
                'medal_type': m.medal_type,
                'swimmer_id': m.swimmer.id,
                'swimmer_name': m.swimmer.name,
                'event_name': m.event.name,
                'event_id': m.event.id,
                'championship_name': m.championship.name,
                'championship_date': str(m.championship.date),
                'championship_location': m.championship.location,
                'championship_country': m.championship.country.name if m.championship.country else '',
            })

        return Response(data)

    @action(detail=True, methods=['post'], url_path='upload_logo')
    def upload_logo(self, request, pk=None):
        team = self.get_object()
        logo = request.FILES.get('logo')
        from core.uploads import validate_image
        err = validate_image(logo)
        if err:
            return Response({'error': err}, status=400)
        team.logo = logo
        team.save()
        return Response({'message': 'Logo uploaded successfully', 'logo': team.logo.url})

    @action(detail=True, methods=['post'], url_path='upload_banner')
    def upload_banner(self, request, pk=None):
        team = self.get_object()
        banner = request.FILES.get('banner')
        from core.uploads import validate_image
        err = validate_image(banner)
        if err:
            return Response({'error': err}, status=400)
        team.banner = banner
        team.save()
        return Response({'message': 'Banner uploaded successfully', 'banner': team.banner.url})


class TrophyViewSet(viewsets.ModelViewSet):
    queryset = Trophy.objects.all()
    serializer_class = TrophySerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        team = self.request.query_params.get('team')
        if team:
            qs = qs.filter(team_id=team)
        return qs
