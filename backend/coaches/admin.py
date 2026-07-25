from django.contrib import admin
from .models import Coach


@admin.register(Coach)
class CoachAdmin(admin.ModelAdmin):
    list_display = ['name', 'nationality', 'level', 'current_club', 'is_available', 'is_active']
    list_filter = ['level', 'is_available', 'is_active', 'nationality']
    search_fields = ['name', 'current_club']
