import logging
from celery import shared_task
from django.db import models as django_models
from django.utils.timezone import now
from google.api_core import exceptions as google_exceptions

from .models import Entry, MetricDefinition, Metric, MetricBaseline, MetricDefinitionContributor
from .ai import safe_gemini_call, EXTRACTION_SYSTEM, EXTRACTION_DEFAULT, build_extraction_prompt

logger = logging.getLogger(__name__)

PROMOTION_THRESHOLD = 3


@shared_task(bind=True, max_retries=3)
def extract_entry_data(self, entry_id: int):
    """
    مهمة Celery تُستدعى فور حفظ Entry جديد.
    تستخرج: mood, tags, entities, reflection, entry_type, metrics.
    ⚠️ لا تضع faster-whisper هنا أبداً.
    """
    try:
        entry = Entry.objects.get(id=entry_id)
        entry.processing_status = 'processing'
        entry.save(update_fields=['processing_status'])

        prompt = build_extraction_prompt(entry.text, entry.user_id)

        result = safe_gemini_call(
            prompt=prompt,
            system=EXTRACTION_SYSTEM,
            default=EXTRACTION_DEFAULT
        )

        # ── حفظ بيانات Entry ──────────────────────────────────
        entry.mood_score        = max(1.0, min(5.0, float(result.get('mood_score', 3.0))))
        entry.tags              = result.get('tags', [])[:5]
        entry.entities          = result.get('entities', {})
        entry.ai_reflection     = str(result.get('reflection', ''))[:300]
        entry.entry_type        = result.get('entry_type', 'event')
        entry.is_open_event     = bool(result.get('is_open_event', False))
        entry.processing_status = 'done'
        entry.save()

        # ── معالجة Metrics ────────────────────────────────────
        for m in result.get('metrics', []):
            name   = str(m.get('name', '')).strip()
            value  = float(m.get('value', 0))
            unit   = str(m.get('unit', '')).strip()
            is_new = bool(m.get('is_new', False))

            if not name or value <= 0:
                continue

            _process_new_metric(name, unit, user_id=entry.user_id)

            try:
                definition = MetricDefinition.objects.get(name=name)
                Metric.objects.create(
                    user=entry.user,
                    entry=entry,
                    definition=definition,
                    value=value,
                    recorded_at=entry.created_at
                )
            except MetricDefinition.DoesNotExist:
                logger.warning(f"MetricDefinition '{name}' not found, skipping.")

        logger.info(f"Entry {entry_id} processed OK.")
        return f"Entry {entry_id} processed."

    except google_exceptions.ResourceExhausted:
        try:
            entry = Entry.objects.get(id=entry_id)
            entry.processing_status = 'rate_limited'
            entry.save(update_fields=['processing_status'])
        except Exception:
            pass
        logger.warning(f"Entry {entry_id} rate limited — will retry.")
        raise self.retry(countdown=60 * (self.request.retries + 1))

    except Entry.DoesNotExist:
        logger.error(f"Entry {entry_id} not found.")

    except Exception as exc:
        logger.exception(f"Entry {entry_id} failed: {exc}")
        if self.request.retries >= self.max_retries:
            try:
                entry = Entry.objects.get(id=entry_id)
                entry.processing_status = 'failed'
                entry.save(update_fields=['processing_status'])
            except Exception:
                pass
        raise self.retry(exc=exc, countdown=30)


def _process_new_metric(name: str, unit: str, user_id: int):
    """
    يُستدعى لكل metric في كل entry — سواء كان جديداً أو موجوداً.
    يتتبع المستخدمين الفريدين ويرقّي الـ metric تلقائياً.
    """
    definition, created = MetricDefinition.objects.get_or_create(
        name=name,
        defaults={
            'unit': unit,
            'category': 'habit',
            'is_system': False,
            'suggested_by_count': 0,
        }
    )

    # سجّل المستخدم كـ contributor (get_or_create يمنع التكرار)
    _, new_contribution = MetricDefinitionContributor.objects.get_or_create(
        definition=definition,
        user_id=user_id
    )

    if new_contribution:
        # مستخدم جديد → حدّث العداد
        new_count = MetricDefinitionContributor.objects.filter(
            definition=definition
        ).count()

        MetricDefinition.objects.filter(pk=definition.pk).update(
            suggested_by_count=new_count
        )

        # ترقية تلقائية عند الوصول للـ threshold
        if new_count >= PROMOTION_THRESHOLD and not definition.is_system:
            MetricDefinition.objects.filter(pk=definition.pk).update(
                is_system=True,
                promoted_at=now()
            )
            logger.info(f"MetricDefinition '{name}' promoted to system.")


@shared_task
def update_metric_baselines():
    """
    كل أحد 01:30 — SQL بحت، صفر LLM.
    يحسب المعدل الطبيعي لكل مستخدم من آخر 30 يوم.
    """
    from django.db.models import Avg, Min, Max, Count
    from django.contrib.auth import get_user_model
    from datetime import date, timedelta

    User = get_user_model()
    cutoff = date.today() - timedelta(days=30)

    for user in User.objects.all():
        baselines = Metric.objects.filter(
            user=user,
            recorded_at__date__gte=cutoff
        ).values('definition').annotate(
            avg=Avg('value'),
            min_val=Min('value'),
            max_val=Max('value'),
            days=Count('recorded_at__date', distinct=True)
        )
        for b in baselines:
            MetricBaseline.objects.update_or_create(
                user=user,
                definition_id=b['definition'],
                defaults={
                    'daily_avg':   b['avg'],
                    'daily_min':   b['min_val'],
                    'daily_max':   b['max_val'],
                    'sample_days': b['days'],
                }
            )
    logger.info("Metric baselines updated.")


@shared_task
def reprocess_stuck_entries():
    """
    كل ساعة — يعيد معالجة الـ entries العالقة > 10 دقائق.
    """
    from datetime import timedelta
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
    logger.info(f"Reprocessed {count} stuck entries.")
    return f"Reprocessed {count} entries."
