from rest_framework import serializers
from .models import ClassificationCategory, Classification, SubClassification, Championship, ProgramItem, Result, LiveSession
from core.serializers import CountrySerializer, EventSerializer
from swimmers.serializers import SwimmerListSerializer


class ClassificationCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassificationCategory
        fields = '__all__'


class ClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classification
        fields = '__all__'


class SubClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubClassification
        fields = '__all__'


class ChampionshipListSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    results_count = serializers.SerializerMethodField()
    swimmers_count = serializers.SerializerMethodField()
    date = serializers.DateField(format='%d/%m/%Y')
    end_date = serializers.DateField(format='%d/%m/%Y', allow_null=True)
    classification_name = serializers.CharField(source='classification.name', read_only=True, default=None)
    sub_classification_name = serializers.CharField(source='sub_classification.name', read_only=True, default=None)

    class Meta:
        model = Championship
        fields = ['id', 'name', 'date', 'end_date', 'pool', 'meet_category', 'country', 'country_detail',
                  'location', 'classification_category', 'classification', 'sub_classification',
                  'classification_name', 'sub_classification_name',
                  'website', 'policy_pdf', 'live_results_url', 'meet_guide_pdf', 'meet_photo',
                  'registration_url', 'results_count', 'swimmers_count', 'is_calendar_only', 'is_published',
                  'has_open_podium', 'has_double_podium', 'b_final_no_medals', 'is_live', 'created_at']

    def get_results_count(self, obj):
        # Annotated by the list view (single query); fall back for other callers
        annotated = getattr(obj, 'results_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.results.count()

    def get_swimmers_count(self, obj):
        annotated = getattr(obj, 'swimmers_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.results.filter(
            swimmer__is_relay_team=False).values('swimmer').distinct().count()


class ChampionshipDetailSerializer(serializers.ModelSerializer):
    country_detail = CountrySerializer(source='country', read_only=True)
    classification_name = serializers.CharField(source='classification.name', read_only=True, default=None)
    sub_classification_name = serializers.CharField(source='sub_classification.name', read_only=True, default=None)

    class Meta:
        model = Championship
        fields = '__all__'


class LiveSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveSession
        fields = ['id', 'day', 'round_summary', 'source', 'label',
                  'results_added', 'created_at']


class ProgramItemSerializer(serializers.ModelSerializer):
    event_name = serializers.CharField(source='event.name', read_only=True)
    is_relay = serializers.BooleanField(source='event.is_relay', read_only=True)

    class Meta:
        model = ProgramItem
        fields = ['id', 'day', 'event', 'event_name', 'is_relay', 'gender', 'session', 'age_category', 'order']


class ResultSerializer(serializers.ModelSerializer):
    swimmer_detail = SwimmerListSerializer(source='swimmer', read_only=True)
    event_detail = EventSerializer(source='event', read_only=True)
    formatted_time = serializers.CharField(read_only=True)
    relay_swimmers_detail = serializers.SerializerMethodField()

    class Meta:
        model = Result
        fields = ['id', 'swimmer', 'swimmer_detail', 'championship', 'event', 'event_detail',
                  'round_type', 'category', 'team', 'time_centiseconds', 'formatted_time', 'fina_points',
                  'age_at_competition', 'relay_swimmers', 'relay_swimmers_detail', 'splits',
                  'is_hc', 'hc_type', 'is_manual', 'original_rank', 'created_at']

    def get_relay_swimmers_detail(self, obj):
        legs = obj.relay_swimmers
        if not legs:
            return None
        from swimmers.models import Swimmer
        nat_id = obj.swimmer.nationality_id if obj.swimmer_id else None
        result = []
        for leg in legs:
            name = (leg.get('name') or '').strip() if isinstance(leg, dict) else str(leg).strip()
            split_time = leg.get('split_time', '') if isinstance(leg, dict) else ''
            swimmer_id = None
            if name:
                # Try exact match first
                qs = Swimmer.objects.filter(is_relay_team=False, name__iexact=name)
                match = qs.filter(nationality_id=nat_id).first() if nat_id else None
                if not match:
                    match = qs.first()
                # Duplicated surname: "Billel Benyahia Benyahia" → "Billel Benyahia"
                if not match:
                    words = name.split()
                    if len(words) >= 3 and words[-1].lower() == words[-2].lower():
                        deduped = ' '.join(words[:-1])
                        qs2 = Swimmer.objects.filter(is_relay_team=False, name__iexact=deduped)
                        match = qs2.filter(nationality_id=nat_id).first() if nat_id else None
                        if not match:
                            match = qs2.first()
                # Hyphen vs space: "Al-Sulaiti" ↔ "AL SULAITI"
                if not match and ('-' in name or ' ' in name):
                    alt = name.replace('-', ' ')
                    qs3 = Swimmer.objects.filter(is_relay_team=False, name__iexact=alt)
                    match = qs3.filter(nationality_id=nat_id).first() if nat_id else None
                    if not match:
                        match = qs3.first()
                if not match and '-' not in name and ' ' in name:
                    # Try adding hyphens: "Al Sulaiti" → "Al-Sulaiti"
                    import re
                    alt2 = re.sub(r'\b(Al|El)\s+', r'\1-', name, flags=re.IGNORECASE)
                    if alt2 != name:
                        qs4 = Swimmer.objects.filter(is_relay_team=False, name__iexact=alt2)
                        match = qs4.filter(nationality_id=nat_id).first() if nat_id else None
                        if not match:
                            match = qs4.first()
                if match:
                    swimmer_id = match.id
            result.append({'name': name, 'split_time': split_time, 'swimmer_id': swimmer_id})
        return result


class ResultCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Result
        fields = ['id', 'swimmer', 'championship', 'event', 'round_type', 'category', 'team', 'time_centiseconds',
                  'fina_points', 'age_at_competition', 'relay_swimmers', 'splits', 'original_rank',
                  'is_hc', 'hc_type', 'is_manual']
