from rest_framework import serializers
from .models import CalendarEvent


class CalendarEventSerializer(serializers.ModelSerializer):
    # photo of the meet this entry points at, so the Calendar can show it
    meet_photo = serializers.SerializerMethodField()

    def get_meet_photo(self, obj):
        champ = getattr(obj, 'championship', None)
        if not champ or not champ.meet_photo:
            return None
        request = self.context.get('request')
        url = champ.meet_photo.url
        return request.build_absolute_uri(url) if request else url

    class Meta:
        model = CalendarEvent
        fields = '__all__'
