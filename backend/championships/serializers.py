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
    date = serializers.DateField(format='%d/%m/%Y')
    end_date = serializers.DateField(format='%d/%m/%Y', allow_null=True)
    classification_name = serializers.CharField(source='classification.name', read_only=True, default=None)
    sub_classification_name = serializers.CharField(source='sub_classification.name', read_only=True, default=None)

    class Meta:
        model = Championship
        fields = ['id', 'name', 'date', 'end_date', 'pool', 'country', 'country_detail',
                  'location', 'classification_category', 'classification', 'sub_classification',
                  'classification_name', 'sub_classification_name',
                  'results_count', 'swimmers_count', 'created_at']

    def get_results_count(self, obj):
        # Annotated by the list view (single query); fall back for other callers
        annotated = getattr(obj, 'results_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.results.count()

    def get_swimmers_count(self, obj):
        annotated = getattr(obj, 'swimmers_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.results.filter(
            swimmer__is_relay_team=False).values('swimmer').distinct().count()


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
                  'round_type', 'category', 'team', 'time_centiseconds', 'formatted_time', 'fina_points',
                  'age_at_competition', 'relay_swimmers', 'created_at']


class ResultCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Result
        fields = ['id', 'swimmer', 'championship', 'event', 'round_type', 'category', 'team', 'time_centiseconds',
                  'fina_points', 'age_at_competition', 'relay_swimmers']
