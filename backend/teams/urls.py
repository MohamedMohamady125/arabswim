from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'teams', views.TeamViewSet)
router.register(r'trophies', views.TrophyViewSet)
router.register(r'board-members', views.BoardMemberViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
