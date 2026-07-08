from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from datetime import date, timedelta
from apps.insights.tasks import generate_daily_reflection, generate_weekly_insight, generate_monthly_insight

User = get_user_model()

class Command(BaseCommand):
    help = 'إعادة توليد التحليلات (Daily, Weekly, Monthly) لأيام معينة'

    def add_arguments(self, parser):
        parser.add_argument('--type', type=str, choices=['daily', 'weekly', 'monthly'], required=True)
        parser.add_argument('--days', type=int, default=7, help='كم يوم لورا؟')

    def handle(self, *args, **options):
        itype = options['type']
        days = options['days']
        users = User.objects.all()

        for user in users:
            for d in range(days):
                target_date = date.today() - timedelta(days=d)

                if itype == 'daily':
                    generate_daily_reflection.delay(user.id, target_date.isoformat())
                
                elif itype == 'weekly':
                    # تأكد إن اليوم ده بداية أسبوع (الأحد) أو نفّذ لكل أسبوع مرة
                    week_start = target_date - timedelta(days=(target_date.weekday() + 1) % 7)
                    if target_date == week_start:
                        generate_weekly_insight.delay(user.id, week_start.isoformat())

                elif itype == 'monthly':
                    # نفّذ لكل شهر مرة
                    if target_date.day == 1:
                        generate_monthly_insight.delay(user.id, target_date.month, target_date.year)

        self.stdout.write(self.style.SUCCESS(f'تم إرسال مهام {itype} لآخر {days} يوم'))
