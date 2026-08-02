from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Country, Event, ProfileClaim

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    swimmer_name = serializers.CharField(source='swimmer.name', read_only=True, default=None)
    team_name = serializers.CharField(source='team.name', read_only=True, default=None)
    country_name = serializers.CharField(source='country.name', read_only=True, default=None)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'swimmer', 'swimmer_name',
                  'team', 'team_name', 'country', 'country_name']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def validate_email(self, value):
        if not value:
            raise serializers.ValidationError('Email is required')
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            role='VIEWER',
        )


class ProfileClaimSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    swimmer_name = serializers.CharField(source='swimmer.name', read_only=True)
    id_document = serializers.ImageField(read_only=True)

    class Meta:
        model = ProfileClaim
        fields = ['id', 'user', 'username', 'user_email', 'swimmer', 'swimmer_name',
                  'id_document', 'status', 'note', 'created_at', 'reviewed_at']
        read_only_fields = ['user', 'status', 'note', 'created_at', 'reviewed_at']


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = '__all__'


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = '__all__'
