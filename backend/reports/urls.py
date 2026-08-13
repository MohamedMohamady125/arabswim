from django.urls import path

from . import views

urlpatterns = [
    path('reports/overview/', views.overview),
    path('reports/medal-table/', views.medal_table),
    path('reports/top-times/', views.top_times),
    path('reports/participation/', views.participation),
    path('reports/records/', views.records_report),
]
