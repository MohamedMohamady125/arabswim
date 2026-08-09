from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'countries', views.CountryViewSet)
router.register(r'events', views.EventViewSet)
router.register(r'claims', views.ProfileClaimViewSet, basename='claims')

urlpatterns = [
    path('auth/me/', views.me, name='auth-me'),
    path('auth/register/', views.register, name='auth-register'),
    path('auth/org-accounts/', views.create_org_account, name='auth-org-accounts'),
    path('fina-points/', views.fina_points_preview, name='fina-points-preview'),
    path('features/', views.site_features, name='site-features'),
    path('', include(router.urls)),
]
