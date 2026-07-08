from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum
from .models import Metric, MetricDefinition, MetricBaseline

LOWER_IS_BETTER = {'سجاير', 'دواء'}


def _get_direction(deviation_pct):
    if deviation_pct is None:
        return "no_baseline"
    if abs(deviation_pct) <= 20:
        return "normal"
    return "up" if deviation_pct > 0 else "down"


def _get_label(name, direction):
    lib = name in LOWER_IS_BETTER
    labels = {
        "no_baseline": "جارٍ حساب معدلك...",
        "normal":      "طبيعي",
        "up":   "أعلى من المعتاد ↑" if not lib else "أكثر من المعتاد ↑",
        "down": "أقل من المعتاد ↓" if not lib else "أقل من المعتاد ↓ ✓",
    }
    return labels.get(direction, "")


class TodayMetricsView(APIView):
    """GET /api/v1/metrics/today/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()

        today_metrics = Metric.objects.filter(
            user=request.user,
            recorded_at__date=today
        ).values('definition__name', 'definition__unit').annotate(
            today_total=Sum('value')
        )

        result = []
        for m in today_metrics:
            name  = m['definition__name']
            unit  = m['definition__unit']
            total = m['today_total']

            try:
                bl = MetricBaseline.objects.get(user=request.user, definition__name=name)
                deviation_pct = (total - bl.daily_avg) / bl.daily_avg * 100
                baseline_avg  = bl.daily_avg
            except MetricBaseline.DoesNotExist:
                deviation_pct = None
                baseline_avg  = None

            direction = _get_direction(deviation_pct)
            label     = _get_label(name, direction)

            result.append({
                "name":            name,
                "unit":            unit,
                "today_total":     total,
                "baseline_avg":    baseline_avg,
                "deviation_pct":   round(deviation_pct, 1) if deviation_pct is not None else None,
                "direction":       direction,
                "lower_is_better": name in LOWER_IS_BETTER,
                "label":           label,
            })

        return Response({"date": str(today), "metrics": result})


class MetricHistoryView(APIView):
    """GET /api/v1/metrics/history/?name=سجاير&days=30"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        name = request.query_params.get('name')
        days = int(request.query_params.get('days', 30))

        if not name:
            return Response({"error": "name مطلوب"}, status=400)

        from datetime import date, timedelta
        from django.db.models.functions import TruncDate

        cutoff = date.today() - timedelta(days=days)

        daily_data = Metric.objects.filter(
            user=request.user,
            definition__name=name,
            recorded_at__date__gte=cutoff
        ).annotate(
            day=TruncDate('recorded_at')
        ).values('day').annotate(value=Sum('value')).order_by('day')

        try:
            bl = MetricBaseline.objects.get(user=request.user, definition__name=name)
            baseline_avg = bl.daily_avg
            unit = bl.definition.unit
        except MetricBaseline.DoesNotExist:
            baseline_avg = None
            try:
                unit = MetricDefinition.objects.get(name=name).unit
            except MetricDefinition.DoesNotExist:
                unit = ""

        return Response({
            "name":         name,
            "unit":         unit,
            "baseline_avg": baseline_avg,
            "data": [
                {"date": str(d['day']), "value": d['value']}
                for d in daily_data
            ]
        })


class MetricDefinitionsView(APIView):
    """GET /api/v1/metrics/definitions/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        system = MetricDefinition.objects.filter(is_system=True).values(
            'name', 'unit', 'category'
        )
        user_pending = MetricDefinition.objects.filter(
            is_system=False,
            suggested_by_count__gte=1
        ).values('name', 'unit', 'suggested_by_count')

        return Response({
            "system":       list(system),
            "user_pending": list(user_pending),
        })
