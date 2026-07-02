from rest_framework import serializers
from .models import Academy
from core.serializers import CountrySerializer


class AcademySerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)

    class Meta:
        model = Academy
        fields = ['id', 'name', 'country', 'country_detail', 'city', 'logo',
                  'description', 'phone', 'email', 'website', 'instagram',
                  'address', 'is_active', 'created_at']
