from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Album, MediaItem
from .serializers import AlbumListSerializer, AlbumDetailSerializer, MediaItemSerializer


class AlbumViewSet(viewsets.ModelViewSet):
    queryset = Album.objects.prefetch_related('items')
    pagination_class = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title']
    ordering_fields = ['created_at', 'title']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.action == 'list':
            return AlbumListSerializer
        return AlbumDetailSerializer

    @action(detail=False, methods=['post'], url_path='for-championship')
    def for_championship(self, request):
        """Get or create an album for a championship."""
        from championships.models import Championship
        champ_id = request.data.get('championship')
        if not champ_id:
            return Response({'error': 'championship is required'}, status=400)
        try:
            champ = Championship.objects.get(pk=champ_id)
        except Championship.DoesNotExist:
            return Response({'error': 'Championship not found'}, status=404)
        album, _ = Album.objects.get_or_create(
            championship=champ,
            defaults={'title': champ.name},
        )
        return Response(AlbumDetailSerializer(album).data)


class MediaItemViewSet(viewsets.ModelViewSet):
    queryset = MediaItem.objects.all()
    serializer_class = MediaItemSerializer
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        album = self.request.query_params.get('album')
        swimmer = self.request.query_params.get('swimmer')
        if album:
            qs = qs.filter(album_id=album)
        if swimmer:
            qs = qs.filter(swimmer_id=swimmer)
        return qs

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        album_id = request.data.get('album')
        if not album_id:
            return Response({'error': 'album is required'}, status=400)
        try:
            album = Album.objects.get(pk=album_id)
        except Album.DoesNotExist:
            return Response({'error': 'Album not found'}, status=404)
        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response({'error': 'No image files provided'}, status=400)
        from core.uploads import validate_image
        for f in files:
            err = validate_image(f)
            if err:
                return Response({'error': f'{f.name}: {err}'}, status=400)
        start = album.items.count()
        created = []
        for i, f in enumerate(files):
            item = MediaItem.objects.create(
                album=album, media_type='PHOTO', image=f, sort_order=start + i)
            created.append(MediaItemSerializer(item).data)
        return Response({'items': created}, status=201)
