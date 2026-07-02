from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Listing, ListingImage
from .serializers import ListingSerializer, ListingImageSerializer


class ListingViewSet(viewsets.ModelViewSet):
    queryset = Listing.objects.select_related('country').prefetch_related('images')
    serializer_class = ListingSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'seller_name']
    ordering_fields = ['created_at', 'price', 'title']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        category = self.request.query_params.get('category')
        if status_param:
            qs = qs.filter(status=status_param)
        if category:
            qs = qs.filter(category=category)
        return qs

    @action(detail=True, methods=['post'], url_path='upload-image')
    def upload_image(self, request, pk=None):
        listing = self.get_object()
        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response({'error': 'No image files provided'}, status=400)
        start = listing.images.count()
        created = []
        for i, f in enumerate(files):
            img = ListingImage.objects.create(listing=listing, image=f, sort_order=start + i)
            created.append(ListingImageSerializer(img).data)
        return Response({'images': created}, status=201)


class ListingImageViewSet(viewsets.ModelViewSet):
    queryset = ListingImage.objects.all()
    serializer_class = ListingImageSerializer
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]
