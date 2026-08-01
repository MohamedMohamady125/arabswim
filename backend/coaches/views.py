from rest_framework import viewsets, filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import Coach
from .serializers import CoachSerializer


class CoachViewSet(viewsets.ModelViewSet):
    queryset = Coach.objects.select_related('nationality')
    serializer_class = CoachSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'current_club', 'specializations', 'city']
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
        team = self.request.query_params.get('team')
        if team:
            qs = qs.filter(team_id=team)
        return qs
