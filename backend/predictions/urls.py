from rest_framework.routers import DefaultRouter
from .views import PredictionViewSet

router = DefaultRouter()
router.register('predictions', PredictionViewSet, basename='predictions')

urlpatterns = router.urls
