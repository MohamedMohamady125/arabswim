from rest_framework import serializers
from .models import Listing, ListingImage
from core.serializers import CountrySerializer


class ListingImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListingImage
        fields = ['id', 'listing', 'image', 'sort_order']
        extra_kwargs = {'listing': {'required': False}}


class ListingSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    images = ListingImageSerializer(many=True, read_only=True)

    class Meta:
        model = Listing
        fields = ['id', 'title', 'description', 'price', 'currency', 'category',
                  'condition', 'seller_name', 'seller_contact', 'country',
                  'country_detail', 'status', 'images', 'created_at']
