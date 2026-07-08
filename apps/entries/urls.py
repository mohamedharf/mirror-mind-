from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EntryViewSet
from .metrics_views import TodayMetricsView, MetricHistoryView, MetricDefinitionsView

router = DefaultRouter()
router.register(r'entries', EntryViewSet, basename='entry')

urlpatterns = [
    path('', include(router.urls)),
    path('metrics/today/',       TodayMetricsView.as_view(),      name='metrics-today'),
    path('metrics/history/',     MetricHistoryView.as_view(),     name='metrics-history'),
    path('metrics/definitions/', MetricDefinitionsView.as_view(), name='metrics-definitions'),
]
