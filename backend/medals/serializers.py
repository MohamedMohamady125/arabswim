from rest_framework import serializers
from .models import Medal
from core.serializers import EventSerializer
from swimmers.serializers import SwimmerListSerializer
from championships.serializers import ChampionshipListSerializer


class MedalSerializer(serializers.ModelSerializer):
    swimmer_detail = SwimmerListSerializer(source='swimmer', read_only=True)
    championship_detail = ChampionshipListSerializer(source='championship', read_only=True)
    event_detail = EventSerializer(source='event', read_only=True)
    # Club + represented-country of THIS medal, so frontends can group the raw
    # medal list under the same entities as the club-summary/summary tallies.
    team = serializers.SerializerMethodField()
    team_key = serializers.SerializerMethodField()
    nationality_code = serializers.SerializerMethodField()

    class Meta:
        model = Medal
        fields = ['id', 'swimmer', 'swimmer_detail', 'championship', 'championship_detail',
                  'event', 'event_detail', 'medal_type', 'result', 'scope',
                  'team', 'team_key', 'nationality_code']

    def get_team(self, obj):
        from teams.utils import strip_squad_number
        t = obj.result.team if obj.result_id else ''
        return strip_squad_number((t or '').strip())

    def get_team_key(self, obj):
        # Same canonical key club-summary merges name variants with
        from teams.utils import normalize_team_key
        name = self.get_team(obj)
        return (normalize_team_key(name) or name.casefold()) if name else ''

    def get_nationality_code(self, obj):
        return obj.nationality.code if obj.nationality_id else None


class MedalCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medal
        fields = ['id', 'swimmer', 'championship', 'event', 'medal_type', 'result']
