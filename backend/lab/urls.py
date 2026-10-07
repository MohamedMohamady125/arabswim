from django.urls import path
from . import views

urlpatterns = [
    path('lab/swimmer/<int:swimmer_id>/dna/', views.swimmer_dna, name='lab_dna'),
    path('lab/swimmer/<int:swimmer_id>/chase/', views.swimmer_chase, name='lab_chase'),
    path('lab/swimmer/<int:swimmer_id>/rivals/', views.swimmer_rivals, name='lab_rivals'),
    path('lab/swimmer/<int:swimmer_id>/consistency/', views.swimmer_consistency, name='lab_consistency'),
    path('lab/result/<int:result_id>/xray/', views.result_xray, name='lab_xray'),
    path('lab/whatif/', views.whatif, name='lab_whatif'),
    path('lab/one-percent-club/', views.one_percent_club, name='lab_one_percent'),
    path('lab/depth-ranking/', views.depth_ranking, name='lab_depth'),
]
