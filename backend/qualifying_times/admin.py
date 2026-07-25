from django.contrib import admin
from .models import QualifyingStandard, QualifyingTime


class QualifyingTimeInline(admin.TabularInline):
    model = QualifyingTime
    extra = 0


@admin.register(QualifyingStandard)
class QualifyingStandardAdmin(admin.ModelAdmin):
    list_display = ['name', 'competition_type', 'year']
    list_filter = ['competition_type', 'year']
    inlines = [QualifyingTimeInline]


@admin.register(QualifyingTime)
class QualifyingTimeAdmin(admin.ModelAdmin):
    list_display = ['standard', 'event', 'gender', 'cut', 'formatted_time']
    list_filter = ['standard', 'gender', 'cut', 'event']
