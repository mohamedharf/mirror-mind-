from rest_framework import serializers
from .models import DailyReflection, WeeklyInsight, MonthlyInsight

class DailyReflectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyReflection
        fields = ["date", "avg_mood", "top_tags", "tag_alerts", "summary", "entry_count"]

class WeeklyInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyInsight
        fields = ["week_start", "mood_trend", "mood_avg", "top_tags", "patterns", "entry_count"]

class MonthlyInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonthlyInsight
        fields = ["month", "year", "mood_avg", "mood_trend", "top_tags", "patterns", "suggestions", "prev_month_comparison", "entry_count"]
