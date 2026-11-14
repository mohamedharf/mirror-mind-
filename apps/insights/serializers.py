from rest_framework import serializers
from .models import DailyReflection, WeeklyInsight, MonthlyInsight
from apps.entries.models import Entry

class DailyReflectionSerializer(serializers.ModelSerializer):
    entry_count = serializers.SerializerMethodField()

    class Meta:
        model = DailyReflection
        fields = ["date", "avg_mood", "top_tags", "tag_alerts", "summary", "entry_count"]

    def get_entry_count(self, obj):
        return Entry.objects.filter(user=obj.user, created_at__date=obj.date).count()

class WeeklyInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyInsight
        fields = ["week_start", "mood_trend", "mood_avg", "top_tags", "patterns", "entry_count"]

class MonthlyInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonthlyInsight
        fields = ["month", "year", "mood_avg", "mood_trend", "top_tags", "patterns", "suggestions", "prev_month_comparison", "entry_count"]
