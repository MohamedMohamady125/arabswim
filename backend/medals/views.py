from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q
from .models import Medal
from .serializers import MedalSerializer, MedalCreateSerializer


class MedalViewSet(viewsets.ModelViewSet):
    queryset = Medal.objects.select_related(
        'swimmer', 'swimmer__nationality', 'championship', 'championship__country', 'event'
    )

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return MedalCreateSerializer
        return MedalSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        championship = self.request.query_params.get('championship')
        swimmer = self.request.query_params.get('swimmer')
        country = self.request.query_params.get('country')
        if championship:
            qs = qs.filter(championship_id=championship)
        if swimmer:
            qs = qs.filter(swimmer_id=swimmer)
        if country:
            qs = qs.filter(swimmer__nationality_id=country)
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        championship = request.query_params.get('championship')
        qs = Medal.objects.all()
        if championship:
            qs = qs.filter(championship_id=championship)
        summary = qs.values(
            'swimmer__nationality__name', 'swimmer__nationality__code'
        ).annotate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        ).order_by('-gold', '-silver', '-bronze')
        return Response(list(summary))
