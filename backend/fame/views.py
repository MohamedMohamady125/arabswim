from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Inductee
from .serializers import InducteeSerializer


class InducteeViewSet(viewsets.ModelViewSet):
    queryset = Inductee.objects.select_related('country', 'swimmer', 'swimmer__nationality')
    serializer_class = InducteeSerializer
    pagination_class = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['display_order', 'inducted_year', 'name']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        country = self.request.query_params.get('country')
        if country:
            qs = qs.filter(country_id=country)
        return qs

    @action(detail=True, methods=['post'], url_path='upload-photo')
    def upload_photo(self, request, pk=None):
        inductee = self.get_object()
        photo = request.FILES.get('photo')
        from core.uploads import validate_image
        err = validate_image(photo)
        if err:
            return Response({'error': err}, status=400)
        inductee.photo = photo
        inductee.save()
        return Response({'message': 'Photo uploaded successfully', 'photo': inductee.photo.url})
