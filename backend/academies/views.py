from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Academy
from .serializers import AcademySerializer


class AcademyViewSet(viewsets.ModelViewSet):
    queryset = Academy.objects.select_related('country')
    serializer_class = AcademySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'city']
    ordering_fields = ['name', 'created_at']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        country = self.request.query_params.get('country')
        if country:
            qs = qs.filter(country_id=country)
        return qs

    @action(detail=True, methods=['post'], url_path='upload-logo')
    def upload_logo(self, request, pk=None):
        academy = self.get_object()
        logo = request.FILES.get('logo')
        if not logo:
            return Response({'error': 'No logo file provided'}, status=400)
        academy.logo = logo
        academy.save()
        return Response({'message': 'Logo uploaded successfully', 'logo': academy.logo.url})
