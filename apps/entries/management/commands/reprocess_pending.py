from django.core.management.base import BaseCommand
from django.utils.timezone import now
from datetime import timedelta
from apps.entries.models import Entry
from apps.entries.tasks import extract_entry_data


class Command(BaseCommand):
    help = 'يعيد معالجة الـ entries التي فشل تحليلها أو علقت'

    def handle(self, *args, **kwargs):
        cutoff = now() - timedelta(minutes=10)
        stuck = Entry.objects.filter(
            processing_status__in=['pending', 'processing', 'failed', 'rate_limited'],
            created_at__lt=cutoff
        )
        count = stuck.count()
        for entry in stuck:
            entry.processing_status = 'pending'
            entry.save(update_fields=['processing_status'])
            extract_entry_data.delay(entry.id)
        self.stdout.write(self.style.SUCCESS(f'تمت إعادة معالجة {count} entry'))
