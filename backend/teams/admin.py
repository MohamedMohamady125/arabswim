from django.contrib import admin
from .models import Team, Trophy


class TrophyInline(admin.TabularInline):
    model = Trophy
    extra = 1


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ['name', 'country', 'founded_year', 'is_national_team']
    list_filter = ['country', 'is_national_team']
    search_fields = ['name']
    inlines = [TrophyInline]


@admin.register(Trophy)
class TrophyAdmin(admin.ModelAdmin):
    list_display = ['name', 'team', 'year']
    list_filter = ['team']
