from datetime import date, timedelta
from django.db.models import Count
from django.db.models.functions import TruncDate
from apps.entries.models import Entry

def calculate_streak(user, today=None):
    if today is None:
        today = date.today()

    # Get all unique dates where the user made an entry, ordered by date descending
    entry_dates = Entry.objects.filter(user=user, created_at__date__lte=today)
    entry_dates = entry_dates.annotate(day=TruncDate('created_at')).values_list('day', flat=True).distinct().order_by('-day')

    streak = 0
    current_date = today

    for entry_date in entry_dates:
        if entry_date == current_date:
            streak += 1
            current_date -= timedelta(days=1)
        elif entry_date < current_date:
            # Gap in dates, streak broken
            break
        # If entry_date > current_date, it means we skipped a day, continue to next entry_date

    return streak
