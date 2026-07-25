from django.contrib import admin
from .models import SponsorTier, Sponsor


class SponsorInline(admin.TabularInline):
    model = Sponsor
    extra = 0


@admin.register(SponsorTier)
class SponsorTierAdmin(admin.ModelAdmin):
    list_display = ['name', 'sort_order']
    inlines = [SponsorInline]


@admin.register(Sponsor)
class SponsorAdmin(admin.ModelAdmin):
    list_display = ['name', 'tier', 'is_active', 'sort_order']
    list_filter = ['tier', 'is_active']
    search_fields = ['name']
