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
                  'country_detail', 'category', 'era', 'inducted_year',
                  'achievements', 'display_order', 'created_at']


from .models import AwardPoll, AwardNominee


class AwardNomineeSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    photo_url = serializers.SerializerMethodField()

    def get_photo_url(self, obj):
        """The nominee's own photo, or the linked swimmer's."""
        if obj.photo:
            return obj.photo.url
        if obj.swimmer_id and obj.swimmer.photo:
            return obj.swimmer.photo.url
        return None

    class Meta:
        model = AwardNominee
        fields = ['id', 'poll', 'swimmer', 'name', 'photo', 'photo_url', 'country',
                  'country_detail', 'note', 'display_order']
        extra_kwargs = {'photo': {'required': False}}


class AwardPollSerializer(serializers.ModelSerializer):
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = AwardPoll
        fields = ['id', 'title', 'year', 'slug', 'description', 'status', 'closes_at',
                  'show_results', 'winner', 'is_open', 'created_at']
        read_only_fields = ['slug', 'winner']
