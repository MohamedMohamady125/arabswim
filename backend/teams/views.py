from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Count, Max, Q

from .models import Team, Trophy, BoardMember
from .serializers import (
    TeamListSerializer, TeamDetailSerializer, TeamCreateUpdateSerializer, TrophySerializer,
    BoardMemberSerializer
)
from swimmers.serializers import SwimmerListSerializer
from swimmers.models import Swimmer
from championships.models import Result
from medals.models import Medal


class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.select_related('country').prefetch_related('trophies')
    pagination_class = None

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        # Batch swimmer counts in 1 query instead of N+1 (club is a text
        # field, not FK, so Django annotation doesn't work here).
        from django.db.models.functions import Lower
        counts = dict(
            Swimmer.objects.values(club_lower=Lower('club'))
            .annotate(n=Count('id')).values_list('club_lower', 'n')
        )
        teams = list(qs)
        for t in teams:
            t.swimmers_count_annotated = counts.get(t.name.lower(), 0)
        serializer = self.get_serializer(teams, many=True)
        return Response(serializer.data)

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'founded_year']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        # Club/federation accounts may edit their own team's portal;
        # everything else (create/destroy/merge/dedupe) stays admin-only.
        if self.action in ('update', 'partial_update', 'upload_logo', 'upload_banner'):
            from core.permissions import CanManageTeamPortal
            return [CanManageTeamPortal()]
        return super().get_permissions()

    def perform_update(self, serializer):
        # Renaming a club must carry its roster along: swimmers/results are
        # linked to clubs by name string, not FK.
        old_name = serializer.instance.name
        team = serializer.save()
        if team.name != old_name:
            Result.objects.filter(team__iexact=old_name).update(team=team.name)
            Swimmer.objects.filter(club__iexact=old_name).update(club=team.name)

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


    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """Delete several teams at once.
        POST /api/v1/teams/bulk-delete/  Body: { ids: [int, ...] }
        Only Team records (and their trophies) are removed — results and
        swimmers keep their club names as plain text.
        """
        ids = request.data.get('ids', [])
        if not isinstance(ids, list) or not ids:
            return Response({'error': 'ids (non-empty list) required'}, status=400)
        deleted, _ = Team.objects.filter(id__in=ids).delete()
        return Response({'deleted': deleted})

    @action(detail=False, methods=['post'], url_path='sync-from-results')
    def sync_from_results(self, request):
        """Create missing Team records from swimmer clubs and result team
        names, then drop orphan auto-created teams.
        POST /api/v1/teams/sync-from-results/
        """
        from .utils import auto_create_teams, cleanup_orphan_teams
        created = auto_create_teams()
        deleted = cleanup_orphan_teams()
        return Response({'created': created, 'deleted_orphans': deleted})

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

        from .utils import merge_team_records
        remove_name = remove.name
        stats = merge_team_records(keep, remove)

        return Response({
            'message': f'Merged "{remove_name}" into "{keep.name}"',
            'team_id': keep.id,
            **stats,
        })

    @action(detail=False, methods=['post'], url_path='auto-dedupe')
    def auto_dedupe(self, request):
        """Find and merge all duplicate teams in one pass.

        Groups teams by a normalized name key (case/punctuation/squad-suffix
        insensitive) and consolidates national-team variants ("Bahrain Team A",
        "BRN Bahrain") into a single "<Country>" national team.

        POST /api/v1/teams/auto-dedupe/  Body: { dry_run: bool }
        dry_run=true returns the merge plan without changing anything.
        """
        from .utils import normalize_team_key, national_team_country, merge_team_records, rename_team

        dry_run = bool(request.data.get('dry_run'))

        # Group every team by its dedupe key
        groups = {}
        nat_countries = {}
        for t in Team.objects.select_related('country'):
            country = national_team_country(t.name)
            if country:
                key = f'__national__{country.code}'
                nat_countries[key] = country
            else:
                key = normalize_team_key(t.name)
            if not key:
                continue
            groups.setdefault(key, []).append(t)

        def team_weight(t):
            linked = (Result.objects.filter(team__iexact=t.name).count()
                      + Swimmer.objects.filter(club__iexact=t.name).count())
            return (linked, 1 if t.logo else 0, -t.id)

        plan = []
        totals = {'teams_merged': 0, 'results_updated': 0, 'swimmers_updated': 0, 'trophies_transferred': 0}

        for key, teams in groups.items():
            country = nat_countries.get(key)
            if len(teams) < 2 and not country:
                continue

            teams_sorted = sorted(teams, key=team_weight, reverse=True)
            keep = teams_sorted[0]
            if country:
                # Prefer the team already named exactly after the country
                exact = [t for t in teams if t.name.strip().lower() == country.name.lower()]
                if exact:
                    keep = exact[0]
            removes = [t for t in teams_sorted if t.id != keep.id]

            final_name = country.name if country else keep.name
            if not removes and keep.name == final_name and (not country or keep.is_national_team):
                continue

            plan.append({
                'keep': keep.name,
                'keep_id': keep.id,
                'final_name': final_name,
                'remove': [t.name for t in removes],
                'national_team': country.name if country else None,
            })

            if not dry_run:
                for r in removes:
                    stats = merge_team_records(keep, r)
                    totals['teams_merged'] += 1
                    for k in ('results_updated', 'swimmers_updated', 'trophies_transferred'):
                        totals[k] += stats[k]
                if country:
                    rename_team(keep, country.name)
                    if not keep.is_national_team:
                        keep.is_national_team = True
                        keep.save()

        return Response({'dry_run': dry_run, 'groups': plan, **totals})

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

    @action(detail=True, methods=['get'])
    def records(self, request, pk=None):
        """Records held by swimmers of this team."""
        from records.models import Record
        from importer.parsers.base import format_centiseconds
        team = self.get_object()
        records = Record.objects.filter(
            Q(swimmer__club__iexact=team.name) |
            Q(swimmer__results__team__iexact=team.name)
        ).select_related(
            'swimmer', 'swimmer__nationality', 'event'
        ).distinct().order_by('event__sort_order', 'event__distance')
        data = [{
            'id': r.id,
            'record_type': r.record_type,
            'event_name': r.event.name,
            'swimmer_id': r.swimmer_id,
            'swimmer_name': r.swimmer.name,
            'nationality_code': r.swimmer.nationality.code if r.swimmer.nationality else '',
            'nationality_flag': r.swimmer.nationality.flag_url if r.swimmer.nationality else '',
            'time': format_centiseconds(r.time_centiseconds),
            'pool': r.pool,
            'date': r.result_date,
        } for r in records]
        return Response(data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Aggregate stats for a team."""
        from django.db.models import Min
        team = self.get_object()
        swimmers = Swimmer.objects.filter(
            Q(club__iexact=team.name) | Q(results__team__iexact=team.name)
        ).exclude(is_relay_team=True).distinct()
        swimmer_ids = list(swimmers.values_list('id', flat=True))
        results_qs = Result.objects.filter(swimmer_id__in=swimmer_ids)
        medals_qs = Medal.objects.filter(swimmer_id__in=swimmer_ids)
        total_medals = medals_qs.aggregate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        )
        champ_count = results_qs.values('championship').distinct().count()
        best_fina = results_qs.filter(fina_points__isnull=False).order_by('-fina_points').select_related('swimmer', 'event').first()
        # Most decorated swimmer
        top_medalist = medals_qs.values('swimmer_id', 'swimmer__name').annotate(
            count=Count('id')
        ).order_by('-count').first()
        return Response({
            'swimmers': len(swimmer_ids),
            'results': results_qs.count(),
            'championships': champ_count,
            'medals': total_medals,
            'records': Result.objects.none().count(),  # placeholder
            'best_fina': {
                'points': best_fina.fina_points,
                'swimmer_name': best_fina.swimmer.name,
                'swimmer_id': best_fina.swimmer_id,
                'event_name': best_fina.event.name,
            } if best_fina else None,
            'top_medalist': {
                'swimmer_id': top_medalist['swimmer_id'],
                'swimmer_name': top_medalist['swimmer__name'],
                'count': top_medalist['count'],
            } if top_medalist else None,
        })

    @action(detail=True, methods=['get'])
    def ranking(self, request, pk=None):
        """Rank this team among clubs in the same country by medal count."""
        team = self.get_object()
        country_teams = Team.objects.filter(country=team.country, is_national_team=False)
        ranking = []
        for t in country_teams:
            t_swimmers = Swimmer.objects.filter(
                Q(club__iexact=t.name) | Q(results__team__iexact=t.name)
            ).exclude(is_relay_team=True).distinct().values_list('id', flat=True)
            counts = Medal.objects.filter(swimmer_id__in=t_swimmers).aggregate(
                gold=Count('id', filter=Q(medal_type='GOLD')),
                silver=Count('id', filter=Q(medal_type='SILVER')),
                bronze=Count('id', filter=Q(medal_type='BRONZE')),
                total=Count('id'),
            )
            ranking.append({
                'team_id': t.id,
                'team_name': t.name,
                'is_current': t.id == team.id,
                **counts,
            })
        ranking.sort(key=lambda r: (-(r['gold']), -(r['silver']), -(r['bronze'])))
        for i, r in enumerate(ranking):
            r['rank'] = i + 1
        return Response(ranking)

    @action(detail=True, methods=['get'])
    def prediction(self, request, pk=None):
        """Project next-season best times per swimmer/event.

        Linear fit over seasonal bests (min 2 seasons, active within the
        last 2 years). Returns items sorted by projected improvement.
        """
        team = self.get_object()
        pool = request.query_params.get('pool', 'LCM')
        from datetime import date
        current_year = date.today().year

        def _fmt_cs(cs):
            cs = int(round(cs))
            minutes = cs // 6000
            seconds = (cs % 6000) // 100
            centis = cs % 100
            if minutes:
                return f'{minutes}:{seconds:02d}.{centis:02d}'
            return f'{seconds}.{centis:02d}'

        from django.db.models import Min
        seasonal = (
            self._full_report_results(team)
            .filter(swimmer__is_relay_team=False, event__is_relay=False,
                    championship__pool=pool, time_centiseconds__gt=0)
            .values('swimmer_id', 'swimmer__name', 'event_id', 'event__name',
                    'championship__date__year')
            .annotate(best_cs=Min('time_centiseconds'))
            .order_by('swimmer_id', 'event_id', 'championship__date__year')
        )

        groups = {}
        for row in seasonal:
            key = (row['swimmer_id'], row['event_id'])
            groups.setdefault(key, {
                'swimmer_id': row['swimmer_id'],
                'swimmer_name': row['swimmer__name'],
                'event_id': row['event_id'],
                'event_name': row['event__name'],
                'seasons': [],
            })['seasons'].append(
                {'year': row['championship__date__year'], 'best_cs': row['best_cs']})

        items = []
        for g in groups.values():
            seasons = g['seasons']
            last_year = seasons[-1]['year']
            if len(seasons) < 2 or last_year < current_year - 2:
                continue
            # Least-squares fit best_cs = a + b*year over the last 4 seasons
            fit = seasons[-4:]
            n = len(fit)
            mean_x = sum(s['year'] for s in fit) / n
            mean_y = sum(s['best_cs'] for s in fit) / n
            sxx = sum((s['year'] - mean_x) ** 2 for s in fit)
            if sxx == 0:
                continue
            slope = sum((s['year'] - mean_x) * (s['best_cs'] - mean_y) for s in fit) / sxx
            current_best = seasons[-1]['best_cs']
            predicted_cs = current_best + slope
            # A projection can't be slower than a total collapse or absurdly
            # fast — clamp within ±8% of the current best.
            predicted_cs = max(current_best * 0.92, min(current_best * 1.08, predicted_cs))
            delta_cs = predicted_cs - current_best
            delta_pct = round((delta_cs / current_best) * 100, 2)
            trend = 'improving' if delta_cs < -25 else 'declining' if delta_cs > 25 else 'steady'
            items.append({
                'swimmer_id': g['swimmer_id'],
                'swimmer_name': g['swimmer_name'],
                'event_id': g['event_id'],
                'event_name': g['event_name'],
                'pool': pool,
                'seasons': [
                    {'year': s['year'], 'best_cs': s['best_cs'], 'best': _fmt_cs(s['best_cs'])}
                    for s in seasons
                ],
                'current_best': _fmt_cs(current_best),
                'current_best_cs': current_best,
                'predicted': _fmt_cs(predicted_cs),
                'predicted_cs': int(round(predicted_cs)),
                'delta_cs': int(round(delta_cs)),
                'delta_pct': delta_pct,
                'target_year': last_year + 1,
                'trend': trend,
            })

        items.sort(key=lambda x: x['delta_cs'])
        return Response({'pool': pool, 'items': items[:60]})


class TrophyViewSet(viewsets.ModelViewSet):
    queryset = Trophy.objects.all()
    serializer_class = TrophySerializer
    pagination_class = None

    def get_permissions(self):
        from core.permissions import CanManageTeamPortal
        return [CanManageTeamPortal()]

    def get_queryset(self):
        qs = super().get_queryset()
        team = self.request.query_params.get('team')
        if team:
            qs = qs.filter(team_id=team)
        return qs


class BoardMemberViewSet(viewsets.ModelViewSet):
    queryset = BoardMember.objects.select_related('team')
    serializer_class = BoardMemberSerializer
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        from core.permissions import CanManageTeamPortal
        return [CanManageTeamPortal()]

    def get_queryset(self):
        qs = super().get_queryset()
        team = self.request.query_params.get('team')
        if team:
            qs = qs.filter(team_id=team)
        return qs
