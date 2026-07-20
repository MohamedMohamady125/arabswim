from django.contrib import admin
from .models import Swimmer, SwimmerNickname, NationalityChange


class NicknameInline(admin.TabularInline):
    model = SwimmerNickname
    extra = 0


class NationalityChangeInline(admin.TabularInline):
    model = NationalityChange
    extra = 0
    raw_id_fields = ['from_country', 'to_country']


@admin.register(Swimmer)
class SwimmerAdmin(admin.ModelAdmin):
    list_display = ['name', 'nationality', 'sex', 'date_of_birth']
    list_filter = ['sex', 'nationality']
    search_fields = ['name']
    inlines = [NicknameInline, NationalityChangeInline]
