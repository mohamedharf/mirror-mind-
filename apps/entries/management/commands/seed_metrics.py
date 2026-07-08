from django.core.management.base import BaseCommand
from apps.entries.models import MetricDefinition

class Command(BaseCommand):
    help = 'Seeds the initial system metric definitions'

    def handle(self, *args, **kwargs):
        metrics = [
            {"name": "نوم", "unit": "ساعة", "category": "health", "aliases": ["نمت", "نوم", "صحيان"]},
            {"name": "عمل", "unit": "ساعة", "category": "productivity", "aliases": ["شغل", "تاسك", "مذاكرة", "عملت", "عمل"]},
            {"name": "قهوة", "unit": "فنجان", "category": "nutrition", "aliases": ["قهوة", "نسكافيه", "اسبريسو"]},
            {"name": "ماء", "unit": "لتر", "category": "nutrition", "aliases": ["مياه", "مية", "ماء"]},
            {"name": "سجائر", "unit": "سيجارة", "category": "health", "aliases": ["تدخين", "سجارة", "سجائر", "سيجارة"]},
            {"name": "قراءة", "unit": "صفحة", "category": "habit", "aliases": ["قريت", "كتاب", "قراءة"]},
            {"name": "رياضة", "unit": "دقيقة", "category": "activity", "aliases": ["تمرين", "جيم", "رياضة", "مشي"]}
        ]

        count = 0
        for m in metrics:
            obj, created = MetricDefinition.objects.update_or_create(
                name=m['name'],
                defaults={
                    'unit': m['unit'],
                    'category': m.get('category', 'habit'),
                    'aliases': m.get('aliases', []),
                    'is_system': True
                }
            )
            if created:
                count += 1
                self.stdout.write(self.style.SUCCESS(f'Created metric: {m["name"]}'))
            else:
                self.stdout.write(f'Updated metric: {m["name"]}')
        
        self.stdout.write(self.style.SUCCESS(f'Successfully seeded {count} new metrics.'))
