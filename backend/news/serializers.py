from rest_framework import serializers
from .models import Article
from core.serializers import CountrySerializer


class ArticleSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)

    class Meta:
        model = Article
        fields = ['id', 'title', 'cover_image', 'body', 'country', 'country_detail',
                  'status', 'published_at', 'created_at', 'updated_at']
