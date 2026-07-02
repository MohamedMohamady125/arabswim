from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'hall-of-fame', views.InducteeViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
