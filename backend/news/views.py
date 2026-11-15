from rest_framework import viewsets, filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Article
from .serializers import ArticleSerializer


class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.select_related('country')
    serializer_class = ArticleSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    # the reader searches for what a story says, not only its headline
    search_fields = ['title', 'body']
    ordering_fields = ['published_at', 'created_at', 'title']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        from core.permissions import CanManageTeamPortal
        return [CanManageTeamPortal()]

    def get_queryset(self):
        qs = super().get_queryset()
        def _int(name):
            raw = self.request.query_params.get(name)
            try:
                return int(raw) if raw else None
            except (TypeError, ValueError):
                return None  # ignore malformed numeric params instead of 500ing

        # Drafts are not public: visitors only ever get published articles;
        # admins see everything; club / federation accounts also see the
        # drafts of the team they manage (so they can keep editing them).
        from core.permissions import is_admin
        from django.db.models import Q
        user = self.request.user
        if not is_admin(user):
            visible = Q(status='PUBLISHED')
            if user and user.is_authenticated:
                if getattr(user, 'role', None) == 'CLUB' and getattr(user, 'team_id', None):
                    visible |= Q(team_id=user.team_id)
                elif getattr(user, 'role', None) == 'FEDERATION' and getattr(user, 'country_id', None):
                    visible |= Q(team__is_national_team=True, team__country_id=user.country_id)
            qs = qs.filter(visible)

        status_param = self.request.query_params.get('status')
        country = _int('country')
        if status_param:
            qs = qs.filter(status=status_param)
        if country:
            # Federation pages: an article belongs to a federation if it is
            # tagged with the country directly OR written about one of that
            # country's clubs.
            qs = qs.filter(Q(country_id=country) | Q(team__country_id=country))
        team = _int('team')
        if team:
            qs = qs.filter(team_id=team)
        return qs
