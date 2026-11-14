import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from django.db.models import Avg
from django.db.models.functions import TruncDate
from django.utils import timezone
from datetime import timedelta, date

from apps.entries.models import Entry
from apps.entries.ai import safe_gemini_call
from apps.insights.models import DailyReflection, WeeklyInsight, MonthlyInsight
from apps.insights.utils import calculate_streak

logger = logging.getLogger(__name__)
User = get_user_model()

# ─────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────

DAILY_SUMMARY_SYSTEM = """
أنت مساعد تحليل. دورك كتابة جملة وصفية واحدة تلخّص يوم المستخدم بناءً على سجلاته.
لا تحكم. لا تنصح. لا تتخيل معلومات غير موجودة في النصوص.
أجب فقط بـ JSON: {"summary": "الجملة هنا"}
"""

DAILY_SUMMARY_USER = """
إدخالات المستخدم اليوم ({date}):

{entries_text}

إحصاءات اليوم:
- متوسط المزاج: {mood_avg}/5
- التصنيفات: {top_tags}

اكتب جملة واحدة فقط (بالعربي) تصف هذا اليوم بشكل وصفي.
"""

WEEKLY_SYSTEM = """
أنت مساعد تحليل سلوكي. تحلّل يوميات شخصية لتستخرج أنماطاً وصفية حقيقية.
قواعد صارمة:
- لا تحكم على المستخدم ولا تقيّم سلوكه
- لا تنصح ولا تقترح حلولاً
- لا تتخيل أنماطاً غير موجودة في النص
- اكتب بالعربي
"""

WEEKLY_USER = """
إدخالات الأسبوع ({week_start} → {week_end}):

{entries_with_dates}

إحصاءات الأسبوع:
- متوسط المزاج: {mood_avg}/5
- اتجاه المزاج: {mood_trend}
- أكثر التاجز: {top_tags}
- عدد الإدخالات: {entry_count}

اكتب 2-4 ملاحظات وصفية تصف أنماطاً حقيقية لاحظتها.

أجب فقط بـ JSON:
{{"patterns": ["ملاحظة 1", "ملاحظة 2"]}}
"""

MONTHLY_SYSTEM = """
أنت مساعد تحليل سلوكي دوري. تحلّل ملخصات أسبوعية لتستخرج أنماطاً شهرية وتقترح تحسينات.
قواعد الاقتراحات:
- صياغة "لاحظنا X — تحب تجرب Y؟" (سؤال، لا أمر)
- مبنية على بيانات حقيقية
- لا أكثر من 3 اقتراحات
"""

MONTHLY_USER = """
ملخصات أسابيع شهر {month_name} {year}:

{weekly_summaries}

بيانات الشهر السابق ({prev_month}):
- متوسط المزاج: {prev_mood_avg}/5
- أكثر التاجز: {prev_top_tags}

بيانات هذا الشهر:
- متوسط المزاج: {curr_mood_avg}/5
- أكثر التاجز: {curr_top_tags}
- عدد الإدخالات: {entry_count}

المطلوب:
1. patterns: 2-4 أنماط وصفية شهرية
2. suggestions: 1-3 اقتراحات بصيغة: "لاحظنا [X] — تحب تجرب [Y]؟"

أجب فقط بـ JSON:
{{"patterns": [str], "suggestions": [str]}}
"""


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _build_entries_text(entries) -> str:
    lines = []
    for e in entries:
        time_str = e.created_at.strftime("%H:%M")
        lines.append(f"[{time_str}] {e.text[:200]}")
    return "\n".join(lines)


def _build_weekly_entries_text(entries) -> str:
    from itertools import groupby
    lines = []
    for day, day_entries in groupby(entries, key=lambda e: e.created_at.date()):
        day_entries = list(day_entries)
        lines.append(f"\n--- {day.strftime('%A، %d %B')} ---")
        for e in day_entries:
            preview = e.text[:150] + ("..." if len(e.text) > 150 else "")
            lines.append(f"• [{e.created_at.strftime('%H:%M')}] {preview}")
    return "\n".join(lines)


def _build_weekly_summaries_text(weekly_insights) -> str:
    lines = []
    for wi in weekly_insights:
        tags_str = ", ".join(
            (t['tag'] if isinstance(t, dict) else t)
            for t in wi.top_tags[:5]
        )
        patterns_str = "; ".join(wi.patterns[:2]) if wi.patterns else "—"
        lines.append(
            f"الأسبوع {wi.week_start.strftime('%d/%m')}:\n"
            f"  مزاج: {wi.mood_avg:.1f}/5\n"
            f"  تاجز: {tags_str}\n"
            f"  أنماط: {patterns_str}"
        )
    return "\n\n".join(lines)


def _compute_tag_alerts(user_id: int, current_date) -> list:
    cutoff = current_date - timedelta(days=14)
    entries = Entry.objects.filter(
        user_id=user_id,
        created_at__date__gte=cutoff,
        created_at__date__lte=current_date
    ).values_list("tags", flat=True)

    tag_counts: dict = {}
    for tags_list in entries:
        if isinstance(tags_list, list):
            for tag in tags_list:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    alerts = []
    for tag, count in tag_counts.items():
        if count >= 3:
            alerts.append({
                "tag":     tag,
                "count":   count,
                "days":    14,
                "message": f"التاج '{tag}' ظهر {count} مرات في آخر أسبوعين"
            })
    return sorted(alerts, key=lambda x: x["count"], reverse=True)


def _top_tags(entries) -> list:
    all_tags: list = []
    for entry in entries:
        if entry.tags:
            all_tags.extend(entry.tags)
    counts: dict = {}
    for t in all_tags:
        counts[t] = counts.get(t, 0) + 1
    return sorted(counts, key=counts.get, reverse=True)[:5]  # type: ignore


# ─────────────────────────────────────────────────────────────
# Individual Tasks
# ─────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3)
def generate_daily_reflection(self, user_id=None, target_date_str=None):
    if target_date_str is None:
        target_date_str = date.today().isoformat()
    try:
        user = User.objects.get(id=user_id)
        target_date = date.fromisoformat(target_date_str)

        entries = Entry.objects.filter(
            user=user, created_at__date=target_date
        ).order_by("created_at")

        if not entries.exists():
            DailyReflection.objects.update_or_create(
                user=user, date=target_date,
                defaults={"avg_mood": None, "top_tags": [], "tag_alerts": [],
                          "summary": "لا توجد إدخالات لهذا اليوم."}
            )
            return f"No entries for user {user_id} on {target_date_str}."

        entries_text = _build_entries_text(entries)
        mood_avg     = entries.aggregate(Avg("mood_score"))["mood_score__avg"]
        top_tags     = _top_tags(entries)
        tag_alerts   = _compute_tag_alerts(user_id, target_date)

        user_prompt = DAILY_SUMMARY_USER.format(
            date=target_date_str,
            entries_text=entries_text,
            mood_avg=f"{mood_avg:.1f}" if mood_avg else "N/A",
            top_tags=", ".join(top_tags) or "لا يوجد"
        )
        result = safe_gemini_call(
            prompt=user_prompt,
            system=DAILY_SUMMARY_SYSTEM,
            default={"summary": ""},
            max_tokens=120
        )
        summary = result.get("summary", "") if isinstance(result, dict) else ""

        DailyReflection.objects.update_or_create(
            user=user, date=target_date,
            defaults={
                "avg_mood":    mood_avg,
                "top_tags":    top_tags,
                "tag_alerts":  tag_alerts,
                "summary":     summary
            }
        )
        return f"Daily Reflection done for user {user_id} on {target_date_str}."

    except User.DoesNotExist:
        return f"User {user_id} not found."
    except Exception as e:
        logger.exception(f"Daily reflection error for user {user_id}: {e}")
        raise self.retry(exc=e, countdown=60)


@shared_task(bind=True, max_retries=3)
def generate_weekly_insight(self, user_id=None, week_start_str=None):
    if week_start_str is None:
        today = date.today()
        week_start_str = (today - timedelta(days=today.weekday())).isoformat()
    try:
        user = User.objects.get(id=user_id)
        week_start = date.fromisoformat(week_start_str)
        week_end   = week_start + timedelta(days=6)

        entries = Entry.objects.filter(
            user=user,
            created_at__date__gte=week_start,
            created_at__date__lte=week_end
        ).order_by("created_at")

        if not entries.exists():
            WeeklyInsight.objects.update_or_create(
                user=user, week_start=week_start,
                defaults={"mood_trend": [], "mood_avg": None, "top_tags": [],
                          "patterns": [], "metrics_summary": {}, "entry_count": 0}
            )
            return f"No entries for user {user_id} week {week_start_str}."

        entries_with_dates = _build_weekly_entries_text(entries)
        mood_avg           = entries.aggregate(Avg("mood_score"))["mood_score__avg"]
        top_tags           = _top_tags(entries)

        # mood trend: قيمة لكل يوم في الأسبوع بـ SQL
        mood_by_day = entries.annotate(
            day=TruncDate('created_at')
        ).values('day').annotate(avg_mood=Avg('mood_score')).order_by('day')
        mood_trend_list = [
            round(d['avg_mood'], 2) if d['avg_mood'] else None
            for d in mood_by_day
        ]

        user_prompt = WEEKLY_USER.format(
            week_start=week_start_str,
            week_end=week_end.isoformat(),
            entries_with_dates=entries_with_dates,
            mood_avg=f"{mood_avg:.1f}" if mood_avg else "N/A",
            mood_trend=" → ".join(str(v) for v in mood_trend_list if v),
            top_tags=", ".join(top_tags) or "لا يوجد",
            entry_count=entries.count()
        )
        result   = safe_gemini_call(user_prompt, WEEKLY_SYSTEM, {"patterns": []})
        patterns = result.get("patterns", []) if isinstance(result, dict) else []

        WeeklyInsight.objects.update_or_create(
            user=user, week_start=week_start,
            defaults={
                "mood_trend":     mood_trend_list,
                "mood_avg":       mood_avg,
                "top_tags":       top_tags,
                "patterns":       patterns,
                "metrics_summary": {},
                "entry_count":    entries.count()
            }
        )
        return f"Weekly Insight done for user {user_id} week {week_start_str}."

    except User.DoesNotExist:
        return f"User {user_id} not found."
    except Exception as e:
        logger.exception(f"Weekly insight error for user {user_id}: {e}")
        raise self.retry(exc=e, countdown=60)


@shared_task(bind=True, max_retries=3)
def generate_monthly_insight(self, user_id=None, month=None, year=None):
    if month is None or year is None:
        today = date.today()
        month, year = today.month, today.year
    try:
        user = User.objects.get(id=user_id)

        weekly_insights = WeeklyInsight.objects.filter(
            user=user, week_start__month=month, week_start__year=year
        ).order_by("week_start")

        if not weekly_insights.exists():
            MonthlyInsight.objects.update_or_create(
                user=user, month=month, year=year,
                defaults={"mood_avg": None, "mood_trend": [], "top_tags": [],
                          "patterns": [], "suggestions": [],
                          "prev_month_comparison": {}, "entry_count": 0}
            )
            return f"No weekly insights for user {user_id} in {month}/{year}."

        weekly_summaries_text = _build_weekly_summaries_text(list(weekly_insights))
        curr_mood_avg   = weekly_insights.aggregate(Avg("mood_avg"))["mood_avg__avg"]
        curr_all_tags: list = []
        for wi in weekly_insights:
            if wi.top_tags:
                curr_all_tags.extend(wi.top_tags)
        counts: dict = {}
        for t in curr_all_tags:
            counts[t] = counts.get(t, 0) + 1
        curr_top_tags = sorted(counts, key=counts.get, reverse=True)[:5]  # type: ignore
        curr_entry_count = sum(wi.entry_count for wi in weekly_insights)

        # بيانات الشهر السابق
        prev_month = month - 1 if month > 1 else 12
        prev_year  = year if month > 1 else year - 1
        prev_mi    = MonthlyInsight.objects.filter(user=user, month=prev_month, year=prev_year).first()
        prev_mood_avg = prev_mi.mood_avg if prev_mi else None
        prev_top_tags = prev_mi.top_tags if prev_mi else []

        user_prompt = MONTHLY_USER.format(
            month_name=date(year, month, 1).strftime("%B"),
            year=year,
            weekly_summaries=weekly_summaries_text,
            prev_month=date(prev_year, prev_month, 1).strftime("%B"),
            prev_mood_avg=f"{prev_mood_avg:.1f}" if prev_mood_avg else "N/A",
            prev_top_tags=", ".join(str(t) for t in prev_top_tags) or "لا يوجد",
            curr_mood_avg=f"{curr_mood_avg:.1f}" if curr_mood_avg else "N/A",
            curr_top_tags=", ".join(curr_top_tags) or "لا يوجد",
            entry_count=curr_entry_count
        )
        result      = safe_gemini_call(user_prompt, MONTHLY_SYSTEM, {"patterns": [], "suggestions": []})
        patterns    = result.get("patterns", [])    if isinstance(result, dict) else []
        suggestions = result.get("suggestions", []) if isinstance(result, dict) else []

        MonthlyInsight.objects.update_or_create(
            user=user, month=month, year=year,
            defaults={
                "mood_avg":              curr_mood_avg,
                "mood_trend":            [],
                "top_tags":              curr_top_tags,
                "patterns":              patterns,
                "suggestions":           suggestions,
                "prev_month_comparison": {
                    "prev_mood_avg": prev_mood_avg,
                    "prev_top_tags": prev_top_tags,
                },
                "entry_count": curr_entry_count
            }
        )
        return f"Monthly Insight done for user {user_id} {month}/{year}."

    except User.DoesNotExist:
        return f"User {user_id} not found."
    except Exception as e:
        logger.exception(f"Monthly insight error for user {user_id}: {e}")
        raise self.retry(exc=e, countdown=60)


# ─────────────────────────────────────────────────────────────
# Orchestrators (called by Celery Beat)
# ─────────────────────────────────────────────────────────────

@shared_task
def run_daily_reflections():
    """تشغيل daily reflection لكل المستخدمين — كل يوم 23:50"""
    today = date.today().isoformat()
    for user in User.objects.all():
        generate_daily_reflection.delay(user.id, today)


@shared_task
def run_weekly_insights():
    """تشغيل weekly insight لكل المستخدمين — كل أحد 00:30"""
    today = date.today()
    last_sunday = today - timedelta(days=(today.weekday() + 1) % 7)
    for user in User.objects.all():
        generate_weekly_insight.delay(user.id, last_sunday.isoformat())


@shared_task
def run_monthly_insights():
    """تشغيل monthly insight لكل المستخدمين — أول كل شهر 01:00"""
    today = date.today()
    prev_month = today.month - 1 if today.month > 1 else 12
    prev_year  = today.year if today.month > 1 else today.year - 1
    for user in User.objects.all():
        generate_monthly_insight.delay(user.id, prev_month, prev_year)
