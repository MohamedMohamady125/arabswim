from rest_framework import serializers
from .models import Coach
from core.serializers import CountrySerializer


class CoachSerializer(serializers.ModelSerializer):
    nationality_detail = CountrySerializer(source='nationality', read_only=True)

    class Meta:
        model = Coach
        fields = [
            'id', 'name', 'photo', 'nationality', 'nationality_detail',
            'date_of_birth', 'city', 'level', 'years_experience',
            'current_club', 'specializations', 'certifications', 'bio',
            'achievements', 'cv_file', 'email', 'phone', 'instagram',
            'linkedin', 'is_available', 'is_active', 'created_at', 'updated_at',
        ]
