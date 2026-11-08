from rest_framework import viewsets, filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import Referee
from .serializers import RefereeSerializer


class RefereeViewSet(viewsets.ModelViewSet):
    """Mirrors CoachViewSet: public reads, admin writes (site default
    IsAdminOrReadOnly), same country/level/availability filters."""
    queryset = Referee.objects.select_related('nationality')
    serializer_class = RefereeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'organization', 'specializations', 'city']
    ordering_fields = ['name', 'years_experience', 'created_at']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        country = self.request.query_params.get('country')
        level = self.request.query_params.get('level')
        available = self.request.query_params.get('is_available')
        if country:
            qs = qs.filter(nationality_id=country)
        if level:
            qs = qs.filter(level=level)
        if available is not None:
            qs = qs.filter(is_available=available.lower() == 'true')
        return qs
