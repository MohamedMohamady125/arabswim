from django.contrib import admin
from .models import Medal

@admin.register(Medal)
class MedalAdmin(admin.ModelAdmin):
    list_display = ['swimmer', 'championship', 'event', 'medal_type']
    list_filter = ['medal_type', 'championship']
    search_fields = ['swimmer__name']
