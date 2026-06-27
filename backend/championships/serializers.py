from rest_framework import serializers
from .models import ClassificationCategory, Classification, SubClassification, Championship, Result
from core.serializers import CountrySerializer, EventSerializer
from swimmers.serializers import SwimmerListSerializer


class ClassificationCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassificationCategory
        fields = '__all__'


class ClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classification
        fields = '__all__'


class SubClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubClassification
        fields = '__all__'


class ChampionshipListSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    results_count = serializers.SerializerMethodField()
    swimmers_count = serializers.SerializerMethodField()

    class Meta:
        model = Championship
        fields = ['id', 'name', 'date', 'end_date', 'pool', 'country', 'country_detail',
                  'location', 'classification_category', 'classification', 'sub_classification',
                  'results_count', 'swimmers_count', 'created_at']

    def get_results_count(self, obj):
        return obj.results.count()

    def get_swimmers_count(self, obj):
        return obj.results.values('swimmer').distinct().count()


class ChampionshipDetailSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)

    class Meta:
        model = Championship
        fields = '__all__'


class ResultSerializer(serializers.ModelSerializer):
    swimmer_detail = SwimmerListSerializer(source='swimmer', read_only=True)
    event_detail = EventSerializer(source='event', read_only=True)
    formatted_time = serializers.CharField(read_only=True)

    class Meta:
        model = Result
        fields = ['id', 'swimmer', 'swimmer_detail', 'championship', 'event', 'event_detail',
                  'round_type', 'team', 'time_centiseconds', 'formatted_time', 'fina_points',
                  'age_at_competition', 'relay_swimmers', 'created_at']


class ResultCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Result
        fields = ['id', 'swimmer', 'championship', 'event', 'round_type', 'team', 'time_centiseconds',
                  'fina_points', 'age_at_competition', 'relay_swimmers']
