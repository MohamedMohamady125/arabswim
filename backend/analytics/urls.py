from django.urls import path
from . import views

urlpatterns = [
    path('track/', views.track),
    path('summary/', views.summary),
]
