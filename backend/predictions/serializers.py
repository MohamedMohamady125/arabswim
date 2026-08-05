from rest_framework import serializers
from .models import PredictionEntry


class PredictionEntrySerializer(serializers.ModelSerializer):
    swimmer_name = serializers.CharField(source='swimmer.name', read_only=True)
    event_name = serializers.CharField(source='event.name', read_only=True)
    gender = serializers.CharField(source='swimmer.sex', read_only=True)
    nationality_code = serializers.CharField(source='swimmer.nationality.code', read_only=True)

    class Meta:
        model = PredictionEntry
        fields = ['id', 'championship', 'swimmer', 'event', 'entry_time_cs', 'withdrawn',
                  'swimmer_name', 'event_name', 'gender', 'nationality_code']
