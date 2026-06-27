from rest_framework import serializers
from .models import Medal
from core.serializers import EventSerializer
from swimmers.serializers import SwimmerListSerializer
from championships.serializers import ChampionshipListSerializer


class MedalSerializer(serializers.ModelSerializer):
    swimmer_detail = SwimmerListSerializer(source='swimmer', read_only=True)
    championship_detail = ChampionshipListSerializer(source='championship', read_only=True)
    event_detail = EventSerializer(source='event', read_only=True)

    class Meta:
        model = Medal
        fields = ['id', 'swimmer', 'swimmer_detail', 'championship', 'championship_detail',
                  'event', 'event_detail', 'medal_type', 'result']


class MedalCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medal
        fields = ['id', 'swimmer', 'championship', 'event', 'medal_type', 'result']
