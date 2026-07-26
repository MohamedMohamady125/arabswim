from rest_framework import serializers
from .models import QualifyingStandard, QualifyingTime


class QualifyingTimeSerializer(serializers.ModelSerializer):
    event_name = serializers.CharField(source='event.name', read_only=True)
    event_distance = serializers.IntegerField(source='event.distance', read_only=True)
    event_stroke = serializers.CharField(source='event.stroke', read_only=True)
    formatted_time = serializers.CharField(read_only=True)

    class Meta:
        model = QualifyingTime
        fields = ['id', 'standard', 'event', 'event_name', 'event_distance',
                  'event_stroke', 'gender', 'cut', 'pool', 'time_centiseconds', 'formatted_time']


class QualifyingStandardSerializer(serializers.ModelSerializer):
    times = QualifyingTimeSerializer(many=True, read_only=True)
    times_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = QualifyingStandard
        fields = ['id', 'name', 'competition_type', 'year',
                  'qualifying_period_start', 'qualifying_period_end',
                  'times', 'times_count', 'created_at']


class QualifyingStandardListSerializer(serializers.ModelSerializer):
    times_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = QualifyingStandard
        fields = ['id', 'name', 'competition_type', 'year',
                  'qualifying_period_start', 'qualifying_period_end',
                  'times_count', 'created_at']
