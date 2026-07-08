from rest_framework import viewsets, permissions
from .models import DailyReflection, WeeklyInsight, MonthlyInsight
from .serializers import (
    DailyReflectionSerializer,
    WeeklyInsightSerializer,
    MonthlyInsightSerializer,
)


class DailyReflectionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DailyReflectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = DailyReflection.objects.filter(user=self.request.user)
        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(date=date_param)
        return qs


class WeeklyInsightViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WeeklyInsightSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = WeeklyInsight.objects.filter(user=self.request.user)
        week_start = self.request.query_params.get('week_start')
        if week_start:
            qs = qs.filter(week_start=week_start)
        return qs


class MonthlyInsightViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MonthlyInsightSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = MonthlyInsight.objects.filter(user=self.request.user)
        # format: YYYY-MM
        month_param = self.request.query_params.get('month')
        if month_param:
            try:
                year, month = month_param.split('-')
                qs = qs.filter(year=int(year), month=int(month))
            except ValueError:
                pass
        return qs
