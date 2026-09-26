from rest_framework import viewsets, filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Article
from .serializers import ArticleSerializer


class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.select_related('country')
    serializer_class = ArticleSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title']
    ordering_fields = ['published_at', 'created_at', 'title']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        from core.permissions import CanManageTeamPortal
        return [CanManageTeamPortal()]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        country = self.request.query_params.get('country')
        if status_param:
            qs = qs.filter(status=status_param)
        if country:
            # Federation pages: an article belongs to a federation if it is
            # tagged with the country directly OR written about one of that
            # country's clubs.
            from django.db.models import Q
            qs = qs.filter(Q(country_id=country) | Q(team__country_id=country))
        team = self.request.query_params.get('team')
        if team:
            qs = qs.filter(team_id=team)
        return qs
