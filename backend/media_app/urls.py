from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'media/albums', views.AlbumViewSet)
router.register(r'media/items', views.MediaItemViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
