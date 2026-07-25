from rest_framework import viewsets, filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import Sponsor
from .serializers import SponsorSerializer


class SponsorViewSet(viewsets.ModelViewSet):
    queryset = Sponsor.objects.all()
    serializer_class = SponsorSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'sort_order', 'created_at']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        active = self.request.query_params.get('is_active')
        if active is not None:
            qs = qs.filter(is_active=active.lower() == 'true')
        return qs
