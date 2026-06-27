from rest_framework import serializers
from .models import Record
from core.serializers import EventSerializer
from swimmers.serializers import SwimmerListSerializer


class RecordSerializer(serializers.ModelSerializer):
    swimmer_detail = SwimmerListSerializer(source='swimmer', read_only=True)
    event_detail = EventSerializer(source='event', read_only=True)
    formatted_time = serializers.CharField(read_only=True)

    class Meta:
        model = Record
        fields = ['id', 'swimmer', 'swimmer_detail', 'event', 'event_detail',
                  'record_type', 'time_centiseconds', 'formatted_time', 'location',
                  'result_date', 'result', 'is_new', 'created_at']


class RecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Record
        fields = ['id', 'swimmer', 'event', 'record_type', 'time_centiseconds',
                  'location', 'result_date', 'result', 'is_new']
