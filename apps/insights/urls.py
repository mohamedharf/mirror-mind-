from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DailyReflectionViewSet, WeeklyInsightViewSet, MonthlyInsightViewSet

router = DefaultRouter()
router.register(r'daily', DailyReflectionViewSet, basename='daily_reflection')
router.register(r'weekly', WeeklyInsightViewSet, basename='weekly_insight')
router.register(r'monthly', MonthlyInsightViewSet, basename='monthly_insight')

urlpatterns = [
    path('', include(router.urls)),
]
