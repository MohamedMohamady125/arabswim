from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Q, Exists, OuterRef
from .models import Medal
from .serializers import MedalSerializer, MedalCreateSerializer


class MedalPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 10000


class MedalViewSet(viewsets.ModelViewSet):
    queryset = Medal.objects.select_related(
        'swimmer', 'swimmer__nationality', 'championship', 'championship__country', 'event'
    )
    pagination_class = MedalPagination

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return MedalCreateSerializer
        return MedalSerializer

    def _apply_filters(self, qs):
        championship = self.request.query_params.get('championship')
        classification = self.request.query_params.get('classification')
        sub_classification = self.request.query_params.get('sub_classification')
        gender = self.request.query_params.get('gender')
        if championship:
            qs = qs.filter(championship_id=championship)
        if classification:
            qs = qs.filter(championship__classification_id=classification)
        if sub_classification:
            qs = qs.filter(championship__sub_classification_id=sub_classification)
        if gender:
            qs = qs.filter(swimmer__sex=gender)
        return qs

    @staticmethod
    def _dedupe_relay_placeholders(qs):
        """A relay medal exists both on the relay-team placeholder and on
        each individual athlete. In tallies the relay counts once per
        athlete, so drop the placeholder row when individual rows exist."""
        individual = Medal.objects.filter(
            result=OuterRef('result'), swimmer__is_relay_team=False)
        return qs.exclude(Q(swimmer__is_relay_team=True) & Q(Exists(individual)))

    def get_queryset(self):
        qs = super().get_queryset()
        qs = self._apply_filters(qs)
        swimmer = self.request.query_params.get('swimmer')
        country = self.request.query_params.get('country')
        if swimmer:
            qs = qs.filter(swimmer_id=swimmer)
        if country:
            qs = qs.filter(swimmer__nationality_id=country)
        # Only restrict to Arab countries on the global medals page, not per-championship
        if not self.request.query_params.get('championship') and not swimmer and not country:
            qs = qs.filter(swimmer__nationality__region__in=['ARAB', 'GCC'])
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self._apply_filters(Medal.objects.all())
        qs = self._dedupe_relay_placeholders(qs)
        # Only restrict to Arab countries on the global medals page, not per-championship
        if not request.query_params.get('championship'):
            qs = qs.filter(swimmer__nationality__region__in=['ARAB', 'GCC'])
        summary = qs.values(
            'swimmer__nationality__name', 'swimmer__nationality__code',
            'swimmer__nationality__flag_url', 'swimmer__nationality__region',
        ).annotate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        ).order_by('-gold', '-silver', '-bronze')
        return Response(list(summary))

    @action(detail=False, methods=['get'], url_path='swimmer-summary')
    def swimmer_summary(self, request):
        """Swimmers by medal count (top 10 by default, ?limit=all for all)."""
        qs = self._apply_filters(Medal.objects.all())
        # Exclude relay teams — they are not individual swimmers
        qs = qs.filter(swimmer__is_relay_team=False)
        # Only restrict to Arab countries on the global medals page, not per-championship
        if not request.query_params.get('championship'):
            qs = qs.filter(swimmer__nationality__region__in=['ARAB', 'GCC'])
        summary = qs.values(
            'swimmer__id', 'swimmer__name', 'swimmer__sex',
            'swimmer__nationality__name', 'swimmer__nationality__code',
            'swimmer__nationality__flag_url',
        ).annotate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        ).order_by('-gold', '-silver', '-bronze')
        limit = request.query_params.get('limit', '10')
        if limit != 'all':
            try:
                summary = summary[:max(int(limit), 1)]
            except (TypeError, ValueError):
                summary = summary[:10]
        return Response(list(summary))

    @action(detail=False, methods=['get'], url_path='club-summary')
    def club_summary(self, request):
        qs = self._apply_filters(Medal.objects.all())
        qs = self._dedupe_relay_placeholders(qs)
        # Only include medals that have a team/club via result
        qs = qs.filter(
            result__isnull=False,
        ).exclude(result__team='').exclude(result__team__isnull=True)
        summary = qs.values('result__team').annotate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        ).order_by('-gold', '-silver', '-bronze')
        # Merge club-name variants ('MC ALGER' / 'Mc Alger' / 'MC ALGER 2')
        # into one row via the canonical team key
        from teams.utils import normalize_team_key, strip_squad_number
        merged = {}
        for row in summary:
            name = strip_squad_number((row['result__team'] or '').strip())
            key = normalize_team_key(name) or name.casefold()
            entry = merged.get(key)
            if entry:
                entry['gold'] += row['gold']
                entry['silver'] += row['silver']
                entry['bronze'] += row['bronze']
                entry['total'] += row['total']
                if name.isupper() and not entry['result__team'].isupper():
                    entry['result__team'] = name
            else:
                merged[key] = {
                    'result__team': name,
                    'gold': row['gold'], 'silver': row['silver'],
                    'bronze': row['bronze'], 'total': row['total'],
                }
        out = sorted(merged.values(),
                     key=lambda r: (-r['gold'], -r['silver'], -r['bronze']))
        return Response(out)
