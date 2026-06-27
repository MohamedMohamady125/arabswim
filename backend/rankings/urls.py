from django.urls import path
from . import views

urlpatterns = [
    path('rankings/', views.RankingView.as_view(), name='rankings'),
]
