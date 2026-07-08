import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')

app = Celery('maraya')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # Insights — كل يوم 23:50
    'daily-reflections': {
        'task': 'apps.insights.tasks.run_daily_reflections',
        'schedule': crontab(hour=23, minute=50),
    },
    # Weekly — كل أحد 00:30
    'weekly-insights': {
        'task': 'apps.insights.tasks.run_weekly_insights',
        'schedule': crontab(hour=0, minute=30, day_of_week='sun'),
    },
    # Monthly — أول كل شهر 01:00
    'monthly-insights': {
        'task': 'apps.insights.tasks.run_monthly_insights',
        'schedule': crontab(hour=1, minute=0, day_of_month=1),
    },
    # Baselines — كل أحد 01:30 — SQL فقط، صفر LLM
    'update-baselines': {
        'task': 'apps.entries.tasks.update_metric_baselines',
        'schedule': crontab(hour=1, minute=30, day_of_week='sun'),
    },
    # Reprocess stuck entries — كل ساعة
    'reprocess-stuck': {
        'task': 'apps.entries.tasks.reprocess_stuck_entries',
        'schedule': crontab(minute=0),
    },
}
