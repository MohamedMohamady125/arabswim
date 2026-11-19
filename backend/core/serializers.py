from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.apps import apps
from .models import Country, Event, ProfileClaim, ChangeLog

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    swimmer_name = serializers.CharField(source='swimmer.name', read_only=True, default=None)
    team_name = serializers.CharField(source='team.name', read_only=True, default=None)
    country_name = serializers.CharField(source='country.name', read_only=True, default=None)
    academy_name = serializers.CharField(source='academy.name', read_only=True, default=None)
    # a club account whose team is flagged as an academy is "an academy" to its owner
    team_is_academy = serializers.BooleanField(source='team.is_academy', read_only=True, default=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'swimmer', 'swimmer_name',
                  'team', 'team_name', 'team_is_academy', 'country', 'country_name',
                  'academy', 'academy_name']


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

    def validate(self, attrs):
        from .social import clean_social_fields
        return clean_social_fields(attrs, prefix='federation_', suffix='')


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = '__all__'


# Foreign-key fields whose id we resolve to a readable label in the edit log.
_FK_LABELS = {
    'nationality_id': ('core', 'Country'),
    'country_id': ('core', 'Country'),
    'event_id': ('core', 'Event'),
    'championship_id': ('championships', 'Championship'),
    'swimmer_id': ('swimmers', 'Swimmer'),
    'team_id': ('teams', 'Team'),
}


def _fk_display(field, value):
    if value in (None, ''):
        return '—'
    spec = _FK_LABELS.get(field)
    if not spec:
        return value
    try:
        obj = apps.get_model(*spec).objects.filter(pk=value).first()
        return str(obj) if obj else value
    except Exception:
        return value


def _field_label(field):
    return field[:-3].replace('_', ' ') if field.endswith('_id') else field.replace('_', ' ')


class ChangeLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True, default=None)
    pretty_changes = serializers.SerializerMethodField()

    class Meta:
        model = ChangeLog
        fields = [
            'id', 'model_label', 'object_id', 'object_repr', 'action',
            'changes', 'pretty_changes', 'user', 'user_name',
            'created_at', 'reverted', 'reverted_at',
        ]

    def get_pretty_changes(self, obj):
        out = []
        for field, ch in (obj.changes or {}).items():
            ov, nv = ch.get('old'), ch.get('new')
            if field.endswith('_id'):
                ov_disp, nv_disp = _fk_display(field, ov), _fk_display(field, nv)
            else:
                ov_disp = '—' if ov in (None, '') else ov
                nv_disp = '—' if nv in (None, '') else nv
            out.append({
                'field': field, 'label': _field_label(field),
                'old': ov_disp, 'new': nv_disp,
            })
        return out


class KeepDefaultFlagsMixin:
    """For serializers fed by multipart forms (anything with an image upload).

    A form that leaves a checkbox out is read by DRF as False, so a record
    created without sending its on/off flags was silently saved hidden or
    inactive. On create, any model BooleanField the request did not mention
    keeps the model's own default instead."""

    def create(self, validated_data):
        from django.db import models
        sent = getattr(self, 'initial_data', {}) or {}
        for f in self.Meta.model._meta.concrete_fields:
            if isinstance(f, models.BooleanField) and f.name not in sent:
                validated_data.pop(f.name, None)
        return super().create(validated_data)
