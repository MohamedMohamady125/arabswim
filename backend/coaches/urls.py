from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'coaches', views.CoachViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
