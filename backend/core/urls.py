from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'countries', views.CountryViewSet)
router.register(r'events', views.EventViewSet)

urlpatterns = [
    path('auth/me/', views.me, name='auth-me'),
    path('', include(router.urls)),
]
