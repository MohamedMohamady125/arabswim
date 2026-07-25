from rest_framework import viewsets, filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import Sponsor, SponsorTier
from .serializers import SponsorSerializer, SponsorTierSerializer


class SponsorTierViewSet(viewsets.ModelViewSet):
    queryset = SponsorTier.objects.all()
    serializer_class = SponsorTierSerializer
    pagination_class = None


class SponsorViewSet(viewsets.ModelViewSet):
    queryset = Sponsor.objects.select_related('tier')
    serializer_class = SponsorSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'sort_order', 'created_at']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        tier = self.request.query_params.get('tier')
        active = self.request.query_params.get('is_active')
        if tier:
            qs = qs.filter(tier_id=tier)
        if active is not None:
            qs = qs.filter(is_active=active.lower() == 'true')
        return qs
