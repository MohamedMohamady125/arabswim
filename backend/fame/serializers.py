from rest_framework import serializers
from .models import Inductee
from core.serializers import CountrySerializer
from swimmers.serializers import SwimmerListSerializer


class InducteeSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    swimmer_detail = SwimmerListSerializer(source='swimmer', read_only=True)

    class Meta:
        model = Inductee
        fields = ['id', 'swimmer', 'swimmer_detail', 'name', 'photo', 'country',
                  'country_detail', 'era', 'inducted_year', 'achievements',
                  'display_order', 'created_at']
