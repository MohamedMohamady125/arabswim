from django.urls import path
from . import views

urlpatterns = [
    path('import/upload/', views.FileUploadView.as_view(), name='import-upload'),
    path('import/match/', views.MatchSwimmersView.as_view(), name='import-match'),
    path('import/confirm/', views.ConfirmImportView.as_view(), name='import-confirm'),
    path('import/duplicates/', views.DuplicateSwimmersView.as_view(), name='import-duplicates'),
    path('import/merge/', views.MergeSwimmersView.as_view(), name='import-merge'),
    path('import/history/', views.ImportHistoryView.as_view(), name='import-history'),
]
