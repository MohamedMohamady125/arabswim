import re
from rest_framework import serializers
from .models import Album, MediaItem

YOUTUBE_RE = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([\w-]{11})'
)


def youtube_thumbnail(url):
    m = YOUTUBE_RE.search(url or '')
    if m:
        return f'https://img.youtube.com/vi/{m.group(1)}/hqdefault.jpg'
    return None


class MediaItemSerializer(serializers.ModelSerializer):
    embed_thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = MediaItem
        fields = ['id', 'album', 'media_type', 'image', 'video_url', 'caption',
                  'swimmer', 'sort_order', 'embed_thumbnail', 'created_at']

    def get_embed_thumbnail(self, obj):
        if obj.media_type == 'VIDEO':
            return youtube_thumbnail(obj.video_url)
        return None


class AlbumListSerializer(serializers.ModelSerializer):
    items_count = serializers.IntegerField(source='items.count', read_only=True)
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Album
        fields = ['id', 'title', 'description', 'championship', 'items_count', 'cover', 'created_at']

    def get_cover(self, obj):
        first = obj.items.first()
        if not first:
            return None
        if first.image:
            request = self.context.get('request')
            url = first.image.url
            return request.build_absolute_uri(url) if request else url
        return youtube_thumbnail(first.video_url)


class AlbumDetailSerializer(AlbumListSerializer):
    items = MediaItemSerializer(many=True, read_only=True)

    class Meta(AlbumListSerializer.Meta):
        fields = AlbumListSerializer.Meta.fields + ['items']
