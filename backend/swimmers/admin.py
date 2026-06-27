from django.contrib import admin
from .models import Swimmer, SwimmerNickname


class NicknameInline(admin.TabularInline):
    model = SwimmerNickname
    extra = 0


@admin.register(Swimmer)
class SwimmerAdmin(admin.ModelAdmin):
    list_display = ['name', 'nationality', 'sex', 'date_of_birth']
    list_filter = ['sex', 'nationality']
    search_fields = ['name']
    inlines = [NicknameInline]
