from django.contrib import admin
from .models import Sponsor


@admin.register(Sponsor)
class SponsorAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'sort_order']
    list_filter = ['is_active']
    search_fields = ['name']
