import logging
from celery import shared_task
from django.db import models as django_models
from django.utils.timezone import now
from google.api_core import exceptions as google_exceptions

from .models import Entry, MetricDefinition, Metric, MetricBaseline, MetricDefinitionContributor
from .ai import safe_gemini_call, EXTRACTION_SYSTEM, EXTRACTION_DEFAULT, build_extraction_prompt

logger = logging.getLogger(__name__)

PROMOTION_THRESHOLD = 3

# ── كلمات تدل على إغلاق حدث مفتوح ──────────────────────────────
CLOSING_KEYWORDS = [
    'صحيت', 'صحيان', 'قومت', 'قمت',
    'وقفت', 'خلصت', 'انهيت', 'كملت', 'انتهيت',
    'رجعت', 'خرجت',
]

# ── Mapping: كلمة الإغلاق → keywords الحدث المفتوح ─────────────
CLOSE_OPEN_MAP = {
    'صحيت':    ['نوم', 'نمت', 'هنام'],
    'قومت':    ['نوم', 'نمت', 'هنام'],
    'قمت':     ['نوم', 'نمت', 'هنام'],
    'وقفت':    ['شغل', 'عمل', 'مشروع', 'هشتغل', 'بشتغل'],
    'خلصت':    ['شغل', 'عمل', 'مشروع', 'جيم', 'تمرين', 'رياضة'],
    'انتهيت':  ['شغل', 'عمل', 'مشروع'],
    'انهيت':   ['شغل', 'عمل', 'مشروع'],
    'رجعت':    ['جيم', 'تمرين', 'رياضة', 'شغل', 'عمل'],
    'خرجت':    ['جيم', 'تمرين', 'رياضة'],
}

# ── اسم الـ metric من نص الحدث المفتوح ─────────────────────────
DURATION_KEYWORD_MAP = {
    'نوم':   ['نوم', 'نمت', 'هنام', 'نايم', 'أنام'],
    'عمل':   ['شغل', 'عمل', 'اشتغل', 'هشتغل', 'بشتغل', 'مشروع', 'تاسك'],
    'رياضة': ['جيم', 'تمرين', 'جري', 'رياضة', 'مشي'],
}


@shared_task(bind=True, max_retries=3)
def extract_entry_data(self, entry_id: int):
    """
    مهمة Celery تُستدعى فور حفظ Entry جديد.
    تستخرج: mood, tags, entities, reflection, entry_type, metrics.
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

            if not name or value <= 0:
                continue

            _process_new_metric(name, unit, user_id=entry.user_id)

            try:
                definition = MetricDefinition.objects.get(name=name)
                
                # منع تسجيل قيمة مبدئية (مثل 1) للحدث المفتوح إذا كان الـ Metric يُحسب بالمدة
                if entry.is_open_event and definition.is_duration_based:
                    continue

                Metric.objects.create(
                    user=entry.user,
                    entry=entry,
                    definition=definition,
                    value=value,
                    recorded_at=entry.created_at
                )
            except MetricDefinition.DoesNotExist:
                logger.warning(f"MetricDefinition '{name}' not found, skipping.")

        # ── اكتشاف نية إغلاق حدث مفتوح ──────────────────────
        if detect_closing_intent(entry.text):
            matching_event = find_matching_open_event(entry.user, entry.text)
            if matching_event:
                duration_hours = _get_duration_preview(matching_event, entry)
                metric_name = _detect_duration_metric_name(matching_event)
                if duration_hours > 0 and metric_name:
                    from django.core.cache import cache
                    cache_key = f"close_suggestion:{entry.user_id}:{entry.id}"
                    cache.set(cache_key, {
                        'open_entry_id':    matching_event.id,
                        'open_entry_text':  matching_event.text[:100],
                        'closing_entry_id': entry.id,
                        'duration_hours':   duration_hours,
                        'metric_name':      metric_name,
                    }, timeout=600)
                    logger.info(f"Close suggestion cached for entry {entry_id}: {metric_name} {duration_hours}h")

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
    يُستدعى لكل metric في كل entry.
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

    _, new_contribution = MetricDefinitionContributor.objects.get_or_create(
        definition=definition,
        user_id=user_id
    )

    if new_contribution:
        new_count = MetricDefinitionContributor.objects.filter(
            definition=definition
        ).count()
        MetricDefinition.objects.filter(pk=definition.pk).update(
            suggested_by_count=new_count
        )
        if new_count >= PROMOTION_THRESHOLD and not definition.is_system:
            MetricDefinition.objects.filter(pk=definition.pk).update(
                is_system=True,
                promoted_at=now()
            )
            logger.info(f"MetricDefinition '{name}' promoted to system.")


# ── دوال نظام الأحداث المفتوحة (Duration-based) ──────────────────

def detect_closing_intent(text: str) -> bool:
    """هل الـ entry ده بيُغلق حدثاً مفتوحاً؟"""
    text_lower = text.lower()
    return any(kw in text_lower for kw in CLOSING_KEYWORDS)


def find_matching_open_event(user, closing_text: str):
    """
    يبحث عن أقرب open event للمستخدم يتطابق مع نص الإغلاق.
    """
    from datetime import timedelta
    cutoff = now() - timedelta(hours=18)

    open_events = Entry.objects.filter(
        user=user,
        is_open_event=True,
        parent__isnull=True,
        created_at__gte=cutoff
    ).order_by('-created_at')

    if not open_events.exists():
        return None

    closing_lower = closing_text.lower()
    matched_open_keywords = []
    for close_kw, open_kws in CLOSE_OPEN_MAP.items():
        if close_kw in closing_lower:
            matched_open_keywords.extend(open_kws)

    if not matched_open_keywords:
        return open_events.first()

    for event in open_events:
        event_text_lower = event.text.lower()
        event_tags_lower = [t.lower() for t in (event.tags or [])]
        for kw in matched_open_keywords:
            if kw in event_text_lower or any(kw in t for t in event_tags_lower):
                return event

    return open_events.first()


def _detect_duration_metric_name(open_entry) -> str | None:
    """يكتشف نوع الـ metric من الـ entry المفتوح."""
    text_lower = open_entry.text.lower()
    tags_lower = [t.lower() for t in (open_entry.tags or [])]
    for metric_name, keywords in DURATION_KEYWORD_MAP.items():
        for kw in keywords:
            if kw in text_lower or any(kw in t for t in tags_lower):
                return metric_name
    return None


def _get_duration_preview(open_entry, closing_entry) -> float:
    """حساب المدة المتوقعة بالساعات بدون تسجيلها."""
    seconds = (closing_entry.created_at - open_entry.created_at).total_seconds()
    return round(max(0.01, seconds / 3600), 2)


def close_open_event_and_record_duration(open_entry, closing_entry):
    """
    يغلق حدثاً مفتوحاً ويسجل مدته كـ Metric.
    يُستدعى فقط بعد موافقة المستخدم من الـ frontend.
    """
    duration_hours = _get_duration_preview(open_entry, closing_entry)
    if duration_hours <= 0 or duration_hours > 24:
        return None

    metric_name = _detect_duration_metric_name(open_entry)
    if not metric_name:
        return None

    try:
        definition = MetricDefinition.objects.get(name=metric_name, is_duration_based=True)
    except MetricDefinition.DoesNotExist:
        return None

    open_entry.is_open_event = False
    open_entry.save(update_fields=['is_open_event'])

    metric = Metric.objects.create(
        user=closing_entry.user,
        entry=open_entry,
        definition=definition,
        value=duration_hours,
        recorded_at=open_entry.created_at
    )

    return {
        'metric_name':    metric_name,
        'duration_hours': duration_hours,
        'metric_id':      metric.id,
    }


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
