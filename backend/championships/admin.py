from django.contrib import admin
from .models import ClassificationCategory, Classification, SubClassification, Championship, Result

admin.site.register(ClassificationCategory)
admin.site.register(Classification)
admin.site.register(SubClassification)

@admin.register(Championship)
class ChampionshipAdmin(admin.ModelAdmin):
    list_display = ['name', 'date', 'pool', 'country', 'location']
    list_filter = ['pool', 'country']
    search_fields = ['name']

@admin.register(Result)
class ResultAdmin(admin.ModelAdmin):
    list_display = ['swimmer', 'championship', 'event', 'time_centiseconds', 'fina_points']
    list_filter = ['championship', 'event']
    search_fields = ['swimmer__name']
