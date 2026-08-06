from rest_framework import serializers
from .models import PredictionAgeGroup, PredictionEntry


class PredictionAgeGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = PredictionAgeGroup
        fields = ['id', 'championship', 'label', 'min_age', 'max_age']

    def validate(self, attrs):
        lo, hi = attrs.get('min_age'), attrs.get('max_age')
        if lo is None and hi is None:
            raise serializers.ValidationError('Set a minimum age, a maximum age, or both')
        if lo is not None and hi is not None and lo > hi:
            raise serializers.ValidationError('Minimum age cannot exceed maximum age')
        return attrs


class PredictionEntrySerializer(serializers.ModelSerializer):
    swimmer_name = serializers.CharField(source='swimmer.name', read_only=True)
    event_name = serializers.CharField(source='event.name', read_only=True)
    gender = serializers.CharField(source='swimmer.sex', read_only=True)
    nationality_code = serializers.CharField(source='swimmer.nationality.code', read_only=True)

    class Meta:
        model = PredictionEntry
        fields = ['id', 'championship', 'swimmer', 'event', 'entry_time_cs', 'withdrawn',
                  'swimmer_name', 'event_name', 'gender', 'nationality_code']
