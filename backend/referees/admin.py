from django.contrib import admin
from .models import Referee


@admin.register(Referee)
class RefereeAdmin(admin.ModelAdmin):
    list_display = ['name', 'nationality', 'level', 'organization', 'is_available', 'is_active']
    list_filter = ['level', 'is_available', 'is_active', 'nationality']
    search_fields = ['name', 'organization']
