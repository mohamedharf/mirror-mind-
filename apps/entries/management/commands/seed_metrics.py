from django.core.management.base import BaseCommand
from apps.entries.models import MetricDefinition

class Command(BaseCommand):
    help = 'Seeds the initial system metric definitions'

    def handle(self, *args, **kwargs):
        metrics = [
            {
                "name": "نوم", "unit": "ساعة", "category": "health",
                "aliases": ["نمت", "نوم", "صحيان", "هنام", "صحيت", "ساعات نوم"],
                "is_duration_based": True
            },
            {
                "name": "عمل", "unit": "ساعة", "category": "activity",
                "aliases": ["شغل", "اشتغلت", "هشتغل", "بشتغل", "جلسة عمل", "تاسك", "مذاكرة", "عملت"],
                "is_duration_based": True
            },
            {
                "name": "رياضة", "unit": "دقيقة", "category": "activity",
                "aliases": ["تمرين", "جيم", "رياضة", "مشي", "جري"],
                "is_duration_based": True
            },
            {
                "name": "قهوة", "unit": "فنجان", "category": "nutrition",
                "aliases": ["قهوة", "نسكافيه", "اسبريسو", "فنجان", "كوب قهوة"],
                "is_duration_based": False
            },
            {
                "name": "ماء", "unit": "لتر", "category": "nutrition",
                "aliases": ["مياه", "مية", "ماء"],
                "is_duration_based": False
            },
            {
                "name": "سجائر", "unit": "سيجارة", "category": "health",
                "aliases": ["تدخين", "سجارة", "سجائر", "سيجارة", "سجيرة"],
                "is_duration_based": False
            },
            {
                "name": "قراءة", "unit": "صفحة", "category": "habit",
                "aliases": ["قريت", "كتاب", "قراءة"],
                "is_duration_based": False
            },
        ]

        for m in metrics:
            is_duration = m.pop('is_duration_based', False)
            obj, created = MetricDefinition.objects.update_or_create(
                name=m['name'],
                defaults={
                    'unit': m['unit'],
                    'category': m.get('category', 'habit'),
                    'aliases': m.get('aliases', []),
                    'is_system': True,
                    'is_duration_based': is_duration,
                }
            )
            status = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(f'{status}: {obj.name} (duration_based={is_duration})'))

        self.stdout.write(self.style.SUCCESS('Seed complete.'))

