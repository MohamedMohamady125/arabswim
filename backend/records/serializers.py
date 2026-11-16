from rest_framework import serializers
from .models import Record
from core.serializers import CountrySerializer, EventSerializer
from swimmers.serializers import SwimmerListSerializer


class RecordSerializer(serializers.ModelSerializer):
    swimmer_detail = SwimmerListSerializer(source='swimmer', read_only=True)
    event_detail = EventSerializer(source='event', read_only=True)
    country_detail = CountrySerializer(source='country', read_only=True)
    formatted_time = serializers.CharField(read_only=True)

    class Meta:
        model = Record
        fields = ['id', 'swimmer', 'swimmer_detail', 'event', 'event_detail',
                  'record_type', 'age_category', 'pool', 'time_centiseconds',
                  'formatted_time', 'location', 'meet_name', 'country',
                  'country_detail', 'result_date', 'result', 'is_new', 'source',
                  'created_at']


class RecordCreateSerializer(serializers.ModelSerializer):
    """Records typed in on the New Records page. `result` and `source` are
    read-only on purpose: a hand-entered record is never tied to a meet
    result, so it shows on New Records and in the record books but can never
    appear inside a meet."""

    class Meta:
        model = Record
        fields = ['id', 'swimmer', 'event', 'record_type', 'age_category', 'pool',
                  'time_centiseconds', 'location', 'meet_name', 'country',
                  'result_date', 'result', 'is_new', 'source']
        read_only_fields = ['result', 'source']

    def validate(self, attrs):
        rtype = attrs.get('record_type', getattr(self.instance, 'record_type', None))
        country = attrs.get('country', getattr(self.instance, 'country', None))
        if rtype == 'NATIONAL' and not country:
            # a national record belongs to one federation's book
            swimmer = attrs.get('swimmer', getattr(self.instance, 'swimmer', None))
            if swimmer is not None and swimmer.nationality_id:
                attrs['country'] = swimmer.nationality
            else:
                raise serializers.ValidationError(
                    {'country': 'Choose the country this national record belongs to.'})
        return attrs

    def create(self, validated_data):
        validated_data['source'] = 'MANUAL'
        return super().create(validated_data)
