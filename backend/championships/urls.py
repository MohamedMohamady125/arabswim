from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'championships', views.ChampionshipViewSet)
router.register(r'results', views.ResultViewSet)
router.register(r'classification-categories', views.ClassificationCategoryViewSet)
router.register(r'classifications', views.ClassificationViewSet)
router.register(r'sub-classifications', views.SubClassificationViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
