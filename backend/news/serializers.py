from rest_framework import serializers
from .models import Article
from core.serializers import CountrySerializer


class ArticleSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)

    class Meta:
        model = Article
        fields = ['id', 'title', 'cover_image', 'attachment', 'body', 'country', 'country_detail',
                  'team', 'status', 'published_at', 'created_at', 'updated_at']

    def validate_attachment(self, f):
        if f:
            from core.uploads import validate_pdf
            err = validate_pdf(f)
            if err:
                raise serializers.ValidationError(err)
        return f

    def validate_cover_image(self, f):
        if f:
            from core.uploads import validate_image
            err = validate_image(f)
            if err:
                raise serializers.ValidationError(err)
        return f
