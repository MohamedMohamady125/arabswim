from rest_framework import serializers
from .models import Team, Trophy
from core.serializers import CountrySerializer


class TrophySerializer(serializers.ModelSerializer):
    class Meta:
        model = Trophy
        fields = ['id', 'team', 'name', 'year']
        extra_kwargs = {'team': {'required': False}}


class TeamListSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    swimmers_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = ['id', 'name', 'country', 'country_detail', 'logo', 'banner',
                  'is_national_team', 'founded_year', 'swimmers_count']

    def get_swimmers_count(self, obj):
        from swimmers.models import Swimmer
        return Swimmer.objects.filter(club__iexact=obj.name).count()


class TeamDetailSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    trophies = TrophySerializer(many=True, read_only=True)

    class Meta:
        model = Team
        fields = '__all__'


class TeamCreateUpdateSerializer(serializers.ModelSerializer):
    trophies_data = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Team
        fields = ['id', 'name', 'country', 'logo', 'banner', 'founded_year',
                  'website', 'address', 'email', 'phone', 'is_national_team', 'trophies_data']

    def _parse_trophies(self, value):
        if not value:
            return []
        if isinstance(value, list):
            return value
        import json
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def create(self, validated_data):
        trophies_raw = validated_data.pop('trophies_data', '')
        trophies_data = self._parse_trophies(trophies_raw)
        team = Team.objects.create(**validated_data)
        for t in trophies_data:
            if t.get('name') and t.get('year'):
                Trophy.objects.create(team=team, name=t['name'], year=int(t['year']))
        return team

    def update(self, instance, validated_data):
        trophies_raw = validated_data.pop('trophies_data', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if trophies_raw is not None:
            trophies_data = self._parse_trophies(trophies_raw)
            instance.trophies.all().delete()
            for t in trophies_data:
                if t.get('name') and t.get('year'):
                    Trophy.objects.create(team=instance, name=t['name'], year=int(t['year']))
        return instance
