from django.contrib import admin
from .models import Record

@admin.register(Record)
class RecordAdmin(admin.ModelAdmin):
    list_display = ['swimmer', 'event', 'record_type', 'time_centiseconds', 'result_date', 'is_new']
    list_filter = ['record_type', 'is_new', 'event']
    search_fields = ['swimmer__name']
