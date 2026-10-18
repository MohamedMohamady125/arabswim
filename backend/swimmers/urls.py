from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'swimmers', views.SwimmerViewSet)

urlpatterns = [
    # Explicit name-match routes must precede the router so "name-match" is
    # never captured as a swimmer pk by the detail route.
    path('swimmers/name-match/countries/', views.NameMatchCountriesView.as_view()),
    path('swimmers/name-match/apply/', views.NameMatchApplyView.as_view()),
    path('swimmers/name-match/', views.NameMatchListView.as_view()),
    path('', include(router.urls)),
]
