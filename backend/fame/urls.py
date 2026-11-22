from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'hall-of-fame', views.InducteeViewSet)
router.register(r'awards/polls', views.AwardPollViewSet)
router.register(r'awards/nominees', views.AwardNomineeViewSet)

urlpatterns = [
    path('awards/vote/', views.OpenPollsView.as_view()),
    path('awards/vote/<str:slug>/', views.VoteView.as_view()),
    path('', include(router.urls)),
]
