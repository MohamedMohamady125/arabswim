from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views, invites

router = DefaultRouter()
router.register(r'countries', views.CountryViewSet)
router.register(r'events', views.EventViewSet)
router.register(r'claims', views.ProfileClaimViewSet, basename='claims')
router.register(r'photo-requests', views.PhotoRequestViewSet, basename='photo-requests')
router.register(r'changelog', views.ChangeLogViewSet, basename='changelog')

urlpatterns = [
    path('auth/me/', views.me, name='auth-me'),
    path('auth/register/', views.register, name='auth-register'),
    path('auth/org-accounts/', views.create_org_account, name='auth-org-accounts'),
    path('auth/invites/', invites.invites, name='auth-invites'),
    path('auth/invites/<int:pk>/revoke/', invites.revoke_invite, name='auth-invite-revoke'),
    path('auth/invites/open/<str:token>/', invites.open_invite, name='auth-invite-open'),
    path('fina-points/', views.fina_points_preview, name='fina-points-preview'),
    path('features/', views.site_features, name='site-features'),
    path('', include(router.urls)),
]
