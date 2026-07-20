from rest_framework import serializers
from .models import Swimmer, SwimmerNickname
from core.serializers import CountrySerializer


class SwimmerNicknameSerializer(serializers.ModelSerializer):
    class Meta:
        model = SwimmerNickname
        fields = ['id', 'nickname']


class SwimmerListSerializer(serializers.ModelSerializer):
    nationality_detail = CountrySerializer(source='nationality', read_only=True)
    age = serializers.IntegerField(read_only=True)

    class Meta:
        model = Swimmer
        fields = ['id', 'name', 'date_of_birth', 'birth_year', 'nationality', 'nationality_detail',
                  'sex', 'club', 'photo', 'email', 'phone', 'age', 'is_relay_team', 'is_retired']


class SwimmerDetailSerializer(serializers.ModelSerializer):
    nationality_detail = CountrySerializer(source='nationality', read_only=True)
    age = serializers.IntegerField(read_only=True)
    nicknames = SwimmerNicknameSerializer(many=True, read_only=True)

    class Meta:
        model = Swimmer
        fields = ['id', 'name', 'date_of_birth', 'birth_year', 'nationality', 'nationality_detail',
                  'sex', 'club', 'photo', 'email', 'phone', 'age', 'nicknames',
                  'is_relay_team', 'is_retired', 'created_at', 'updated_at']


class SwimmerCreateUpdateSerializer(serializers.ModelSerializer):
    nicknames = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)

    class Meta:
        model = Swimmer
        fields = ['id', 'name', 'date_of_birth', 'birth_year', 'nationality', 'sex',
                  'club', 'photo', 'email', 'phone', 'nicknames', 'is_retired']

    def create(self, validated_data):
        nicknames = validated_data.pop('nicknames', [])
        swimmer = Swimmer.objects.create(**validated_data)
        for nick in nicknames:
            SwimmerNickname.objects.create(swimmer=swimmer, nickname=nick)
        return swimmer

    def update(self, instance, validated_data):
        nicknames = validated_data.pop('nicknames', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if nicknames is not None:
            instance.nicknames.all().delete()
            for nick in nicknames:
                SwimmerNickname.objects.create(swimmer=instance, nickname=nick)
        return instance
