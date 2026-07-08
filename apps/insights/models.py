from django.db import models
from django.conf import settings

class DailyReflection(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    date = models.DateField()
    avg_mood = models.FloatField(null=True, blank=True)
    top_tags = models.JSONField(default=list)
    tag_alerts = models.JSONField(default=list)
    summary = models.TextField(blank=True)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["user", "date"]]
        ordering = ["-date"]

    def __str__(self):
        return f"Daily Reflection for {self.user.username} on {self.date}"

class WeeklyInsight(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    week_start = models.DateField()
    mood_trend = models.JSONField(default=list)
    mood_avg = models.FloatField(null=True, blank=True)
    top_tags = models.JSONField(default=list)
    patterns = models.JSONField(default=list)
    metrics_summary = models.JSONField(default=dict)
    entry_count = models.IntegerField(default=0)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["user", "week_start"]]
        ordering = ["-week_start"]

    def __str__(self):
        return f"Weekly Insight for {self.user.username} starting {self.week_start}"

class MonthlyInsight(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    month = models.IntegerField()
    year = models.IntegerField()
    mood_avg = models.FloatField(null=True, blank=True)
    mood_trend = models.JSONField(default=list)
    top_tags = models.JSONField(default=list)
    patterns = models.JSONField(default=list)
    suggestions = models.JSONField(default=list)
    prev_month_comparison = models.JSONField(default=dict)
    entry_count = models.IntegerField(default=0)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["user", "month", "year"]]
        ordering = ["-year", "-month"]

    def __str__(self):
        return f"Monthly Insight for {self.user.username} {self.month}/{self.year}"
