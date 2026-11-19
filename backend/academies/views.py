from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from core.permissions import CanManageOwnAcademy
from .models import Academy
from .serializers import AcademySerializer


class AcademyViewSet(viewsets.ModelViewSet):
    queryset = Academy.objects.select_related('country')
    serializer_class = AcademySerializer
    permission_classes = [CanManageOwnAcademy]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'city']
    ordering_fields = ['name', 'created_at']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        country = self.request.query_params.get('country')
        # Postel's Law: a malformed id matches nothing instead of a 500
        if country:
            qs = qs.filter(country_id=country) if country.isdigit() else qs.none()
        return qs

    def perform_update(self, serializer):
        # the academy account fills in its page; name, country and whether it
        # is listed stay with Arab Swim
        from core.permissions import is_admin
        if not is_admin(self.request.user):
            for locked in ('name', 'country', 'is_active'):
                serializer.validated_data.pop(locked, None)
        serializer.save()

    @action(detail=True, methods=['post'], url_path='upload-logo')
    def upload_logo(self, request, pk=None):
        academy = self.get_object()
        logo = request.FILES.get('logo')
        from core.uploads import validate_image
        err = validate_image(logo)
        if err:
            return Response({'error': err}, status=400)
        academy.logo = logo
        academy.save()
        return Response({'message': 'Logo uploaded successfully', 'logo': academy.logo.url})
