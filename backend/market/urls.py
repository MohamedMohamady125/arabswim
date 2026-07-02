from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'market/listings', views.ListingViewSet)
router.register(r'market/images', views.ListingImageViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
