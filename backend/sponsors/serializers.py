from rest_framework import serializers
from .models import Sponsor, SponsorTier


class SponsorTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = SponsorTier
        fields = '__all__'


class SponsorSerializer(serializers.ModelSerializer):
    tier_detail = SponsorTierSerializer(source='tier', read_only=True)

    class Meta:
        model = Sponsor
        fields = ['id', 'name', 'tier', 'tier_detail', 'logo', 'description',
                  'website', 'is_active', 'sort_order', 'created_at']
