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

    # ── helpers for full-report logic ──────────────────────────────
    def _roster_ids(self, team):
        """Swimmer IDs (non-relay) who have competed for this team."""
        return (
            Result.objects.filter(team__iexact=team.name, swimmer__is_relay_team=False)
            .values_list('swimmer_id', flat=True).distinct()
        )

    def _other_arab_club_names(self, team):
        """Names of other Arab clubs (non-national) in the system."""
        return list(
            Team.objects.filter(is_national_team=False)
            .exclude(name__iexact=team.name)
            .values_list('name', flat=True)
        )

    def _full_report_results(self, team):
        """All results for roster swimmers, excluding other Arab clubs.

        Includes: this club, foreign clubs, national teams.
        Excludes: other Arab clubs in our system.
        """
        roster = self._roster_ids(team)
        qs = Result.objects.filter(swimmer_id__in=roster)
        for name in self._other_arab_club_names(team):
            qs = qs.exclude(team__iexact=name)
        return qs

    def _full_report_medals(self, team):
        """All medals for roster swimmers, excluding other Arab clubs."""
        roster = self._roster_ids(team)
        qs = Medal.objects.filter(swimmer_id__in=roster, result__isnull=False)
        for name in self._other_arab_club_names(team):
            qs = qs.exclude(result__team__iexact=name)
        return qs

    # ── endpoints ───────────────────────────────────────────────
    @action(detail=True, methods=['get'])
    def profile(self, request, pk=None):
        team = self.get_object()
        serializer = TeamDetailSerializer(team)

        # Roster
        roster = Swimmer.objects.filter(
            id__in=self._roster_ids(team), is_relay_team=False,
        ).select_related('nationality')
        roster_data = SwimmerListSerializer(roster, many=True).data

        # Best swimmers: by max FINA points across full report
        best_swimmers = (
            self._full_report_results(team)
            .filter(swimmer__is_relay_team=False)
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

        # Medal breakdown — exclude "Other" classification entirely
        team_medals = self._full_report_medals(team).select_related(
            'championship', 'championship__classification_category',
            'championship__classification')
        # Exclude medals from "Other" classification
        team_medals = team_medals.exclude(
            championship__classification__name__iexact='other')

        medal_counts = {'national': {'GOLD': 0, 'SILVER': 0, 'BRONZE': 0},
                        'international': {'GOLD': 0, 'SILVER': 0, 'BRONZE': 0}}
        # Detailed breakdown by classification name
        classification_breakdown = {}
        for m in team_medals:
            cat = 'international'
            if m.championship.classification_category:
                cat_name = m.championship.classification_category.name.lower()
                if 'national' in cat_name or 'local' in cat_name:
                    cat = 'national'
            medal_counts[cat][m.medal_type] += 1

            # Track by classification name
            cls_name = (m.championship.classification.name
                        if m.championship.classification else 'Uncategorized')
            if cls_name not in classification_breakdown:
                classification_breakdown[cls_name] = {'GOLD': 0, 'SILVER': 0, 'BRONZE': 0}
            classification_breakdown[cls_name][m.medal_type] += 1

        # Convert to sorted list
        classification_list = [
            {'name': name, **counts}
            for name, counts in sorted(
                classification_breakdown.items(),
                key=lambda x: -(x[1]['GOLD'] + x[1]['SILVER'] + x[1]['BRONZE'])
            )
        ]

        return Response({
            'team': serializer.data,
            'roster': roster_data,
            'best_swimmers': best_list,
            'medal_counts': medal_counts,
            'classification_breakdown': classification_list,
        })

    @action(detail=True, methods=['get'])
    def times(self, request, pk=None):
        team = self.get_object()
        results = (
            self._full_report_results(team)
            .select_related('swimmer', 'swimmer__nationality', 'championship', 'championship__country', 'event')
            .order_by('event__sort_order', 'event__distance', 'time_centiseconds')
        )

        event_filter = request.query_params.get('event')
        gender = request.query_params.get('gender')
        year = request.query_params.get('year')
        if event_filter:
            results = results.filter(event_id=event_filter)
        if gender:
            results = results.filter(swimmer__sex=gender)
        if year:
            results = results.filter(championship__date__year=int(year))

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
                'team': r.team,
                'age_at_competition': r.age_at_competition,
            })

        return Response(data)

    @action(detail=True, methods=['get'])
    def medals(self, request, pk=None):
        team = self.get_object()
        team_medals = (
            self._full_report_medals(team)
            .select_related('swimmer', 'championship', 'championship__country', 'event', 'result')
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
                'team': m.result.team if m.result else '',
            })

        return Response(data)

    @action(detail=True, methods=['get'])
    def progression(self, request, pk=None):
        """Time progression for a team's swimmers by stroke."""
        team = self.get_object()
        from django.db.models import Min, Count

        stroke = request.query_params.get('stroke', 'Freestyle')
        pool = request.query_params.get('pool', 'LCM')

        def _fmt_cs(cs):
            minutes = cs // 6000
            seconds = (cs % 6000) // 100
            centis = cs % 100
            if minutes:
                return f'{minutes}:{seconds:02d}.{centis:02d}'
            return f'{seconds}.{centis:02d}'

        base_qs = self._full_report_results(team).filter(
            swimmer__is_relay_team=False,
            championship__pool=pool, event__is_relay=False,
            event__stroke=stroke, time_centiseconds__gt=0,
        )

        event_stats = (
            base_qs
            .values('event_id', 'event__name', 'event__sort_order')
            .annotate(count=Count('id'), best=Min('time_centiseconds'))
            .order_by('event__sort_order', 'event__distance')
        )

        lines = []
        for es in event_stats:
            chrono_results = (
                base_qs.filter(event_id=es['event_id'])
                .select_related('championship', 'swimmer')
                .order_by('-championship__date')[:5]
            )
            points = []
            for r in reversed(list(chrono_results)):
                points.append({
                    'date': r.championship.date.isoformat(),
                    'time': _fmt_cs(r.time_centiseconds),
                    'time_cs': r.time_centiseconds,
                    'meet': r.championship.name,
                    'swimmer': r.swimmer.name,
                    'fina': r.fina_points,
                })
            if points:
                lines.append({
                    'event_id': es['event_id'],
                    'event_name': es['event__name'],
                    'points': points,
                })

        return Response(lines)

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


    @action(detail=False, methods=['post'], url_path='merge')
    def merge_teams(self, request):
        """Merge two duplicate teams. Keeps one, transfers everything from the other.
        POST /api/v1/teams/merge/
        Body: { keep_id: int, remove_id: int }
        """
        keep_id = request.data.get('keep_id')
        remove_id = request.data.get('remove_id')
        if not keep_id or not remove_id:
            return Response({'error': 'keep_id and remove_id required'}, status=400)
        if int(keep_id) == int(remove_id):
            return Response({'error': 'Cannot merge a team with itself'}, status=400)

        try:
            keep = Team.objects.get(id=keep_id)
            remove = Team.objects.get(id=remove_id)
        except Team.DoesNotExist:
            return Response({'error': 'Team not found'}, status=404)

        remove_name = remove.name

        # 1. Update all Result.team strings that match the removed team's name
        results_updated = Result.objects.filter(team__iexact=remove.name).update(team=keep.name)

        # 2. Update all Swimmer.club strings that match the removed team's name
        swimmers_updated = Swimmer.objects.filter(club__iexact=remove.name).update(club=keep.name)

        # 3. Transfer trophies from remove to keep
        trophies_transferred = Trophy.objects.filter(team=remove).update(team=keep)

        # 4. Fill missing fields on keep from remove
        fill_fields = ['logo', 'banner', 'founded_year', 'website', 'address', 'email', 'phone']
        for field in fill_fields:
            keep_val = getattr(keep, field)
            remove_val = getattr(remove, field)
            if not keep_val and remove_val:
                setattr(keep, field, remove_val)
        # If keep is not national but remove is, promote
        if not keep.is_national_team and remove.is_national_team:
            keep.is_national_team = True
        keep.save()

        # 5. Delete the removed team
        remove.delete()

        return Response({
            'message': f'Merged "{remove_name}" into "{keep.name}"',
            'team_id': keep.id,
            'results_updated': results_updated,
            'swimmers_updated': swimmers_updated,
            'trophies_transferred': trophies_transferred,
        })

    @action(detail=False, methods=['get'], url_path='find-duplicates')
    def find_duplicates(self, request):
        """Find teams with similar names for merge suggestions."""
        from django.db.models.functions import Lower
        teams = Team.objects.select_related('country').order_by('name')
        # Also find Result.team values that don't match any Team.name
        team_names_lower = set(t.name.lower() for t in teams)
        orphan_clubs = (
            Result.objects.exclude(team='')
            .exclude(team__isnull=True)
            .values('team')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        orphans = [
            {'name': o['team'], 'result_count': o['count']}
            for o in orphan_clubs
            if o['team'].lower() not in team_names_lower
        ]

        return Response({
            'teams': TeamListSerializer(teams, many=True).data,
            'orphan_clubs': orphans[:50],
        })


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
