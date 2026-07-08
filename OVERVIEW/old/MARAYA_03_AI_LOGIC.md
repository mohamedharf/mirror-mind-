# المرايا — منطق الذكاء الاصطناعي الكامل
> كل prompt حرفي، كل دالة معالجة، وجدول واضح لكل استدعاء LLM مقابل كل حساب SQL.

---

## 1. القاعدة الأساسية

```
ما يُحسب رياضياً بـ SQL → لا يُستدعى فيه LLM أبداً
ما يحتاج فهماً لغوياً → LLM فقط
```

| العملية | الأداة | التوقيت |
|---|---|---|
| استخراج mood/tags/metrics من نص | LLM | وقت الكتابة (async) |
| daily summary جملة واحدة | LLM | 23:50 يومياً |
| weekly patterns | LLM | أحد 00:30 |
| monthly patterns + suggestions | LLM | أول الشهر 01:00 |
| متوسط المزاج | SQL AVG | عند الطلب |
| tag alerts (تكرار) | SQL COUNT | بعد كل استخراج |
| metric baselines | SQL AVG | أحد 01:30 |
| streak counter | SQL COUNT DISTINCT | عند الطلب |
| top tags | SQL + Python count | عند الطلب |
| metrics sparklines | SQL GROUP BY | عند الطلب |

---

## 2. safe_gemini_call — wrapper إلزامي لكل استدعاءات LLM

```python
# apps/entries/ai.py
import os, json, logging
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

logger = logging.getLogger(__name__)

genai.configure(api_key=os.environ['GEMINI_API_KEY'])

def safe_gemini_call(prompt: str, system: str, default: dict,
                     max_tokens: int = 600, temperature: float = 0.1) -> dict:
    """
    Wrapper آمن لكل استدعاءات Gemini.
    لو فشل لأي سبب → يُرجع default بدون crash.
    """
    try:
        model = genai.GenerativeModel(
            os.environ['GEMINI_MODEL'],
            system_instruction=system
        )
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
            request_options={"timeout": 20}
        )
        raw = response.text.strip()
        # تنظيف markdown code blocks لو الموديل أضافها
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()
        return json.loads(raw)

    except google_exceptions.ResourceExhausted:
        logger.warning("Gemini rate limit — returning defaults")
        raise  # يُعاد throw للـ task عشان تعمل retry لاحقاً

    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Gemini response parse error: {e}")
        return default

    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        return default
```

---

## 3. LLM #1 — استخراج وقت الكتابة

### متى؟
فور حفظ Entry جديد — Celery async task.

### Defaults (لو فشل الاستدعاء)
```python
EXTRACTION_DEFAULT = {
    "metrics":      [],
    "mood_score":   3.0,
    "tags":         [],
    "entry_type":   "event",
    "entities":     {"أشخاص": [], "مشاريع": [], "أماكن": []},
    "reflection":   "",
    "is_open_event": False,
}
```

### System Prompt
```python
EXTRACTION_SYSTEM = """
أنت مساعد استخراج بيانات. دورك استخراج معلومات منظمة من نص يومي قصير.
قواعد:
- أجب فقط بـ JSON صالح، بدون أي نص قبله أو بعده
- لا تحكم على المستخدم ولا تقدم نصائح
- لا تخترع معلومات غير موجودة في النص
- إذا لم تكن متأكداً من كمية، لا تُضفها للـ metrics
"""
```

### User Prompt
```python
EXTRACTION_USER = """
النص:
{text}

الـ Metrics المعرّفة (الاسم الرسمي | الوحدة | aliases):
{metrics_definitions}

التاجز التي ظهرت في آخر 14 يوم (للاتساق):
{recent_tags}

استخرج:

1. metrics — كميات قابلة للقياس فقط:
   - لو مطابق للاسم الرسمي أو أحد الـ aliases → استخدم الاسم الرسمي بالضبط
   - لو كمية جديدة → is_new: true، واختر unit مناسبة
   - لو الكمية غير واضحة في النص → لا تُضفها
   أمثلة صح: "شربت 3 كبايات قهوة" → name:"قهوة", value:3, unit:"كوب"
   أمثلة غلط: لا تضيف metric من غير كمية محددة في النص

2. mood_score (float 1.0-5.0):
   1.0-1.9 = سلبي جداً (إحباط، حزن شديد، غضب)
   2.0-2.9 = سلبي (تعب، ضغط، قلق)
   3.0-3.4 = محايد أو مختلط
   3.5-4.4 = إيجابي (ارتياح، إنجاز)
   4.5-5.0 = إيجابي جداً (فرح، نجاح كبير)

3. tags (2-5 عناصر) — أحداث ومشاعر فقط، ليس العادات الكمية:
   صح: ["اجتماع", "توتر", "إنجاز"]
   غلط: ["سجاير", "قهوة"] ← دي metrics مش tags
   فضّل التاجز الموجودة في القائمة السابقة إن انطبقت

4. entry_type:
   "routine"    = حدث اعتيادي متكرر (صحيت، اتغديت، اتنقلت)
   "event"      = حدث طارئ أو غير اعتيادي (مشكلة، إنجاز، خبر مفاجئ)
   "reflection" = تأمل أو تفكير بدون حدث محدد

5. entities:
   أشخاص: أسماء مذكورة فقط
   مشاريع: مشاريع أو مهام مذكورة
   أماكن: أماكن مذكورة
   ضع قوائم فارغة إن لم يوجد شيء

6. reflection:
   جملة واحدة وصفية. تعكس ما كتبه بكلمات مختلفة.
   صح: "يوم به ضغط مهني — ذُكرت الاجتماعات مرتين."
   غلط: "يجب أن تتعامل مع الضغط بشكل أفضل."

7. is_open_event (bool):
   true لو النص يصف حدثاً بدأ ولم يكتمل بعد
   أمثلة true: "هروح الاجتماع بعد شوية", "بدأت الشغل على المشروع"
   false في كل الحالات الأخرى

أجب فقط بـ JSON:
{{
  "metrics": [{{"name":str,"value":float,"unit":str,"is_new":bool}}],
  "mood_score": float,
  "tags": [str],
  "entry_type": str,
  "entities": {{"أشخاص":[],"مشاريع":[],"أماكن":[]}},
  "reflection": str,
  "is_open_event": bool
}}
"""
```

### دالة بناء الـ Prompt
```python
def build_extraction_prompt(text: str, user_id: int) -> str:
    from .models import MetricDefinition, Entry
    from django.utils.timezone import now
    from datetime import timedelta

    # metrics definitions
    defs = MetricDefinition.objects.filter(
        models.Q(is_system=True) | models.Q(suggested_by_count__gte=1)
    ).values('name', 'unit', 'aliases')
    metrics_text = "\n".join(
        f"{d['name']} | {d['unit']} | {', '.join(d['aliases'])}"
        for d in defs
    )

    # recent tags
    cutoff = now() - timedelta(days=14)
    recent_entries = Entry.objects.filter(
        user_id=user_id, created_at__gte=cutoff
    ).values_list('tags', flat=True)
    tag_counts = {}
    for tags in recent_entries:
        for t in (tags or []):
            tag_counts[t] = tag_counts.get(t, 0) + 1
    recent_tags = ", ".join(
        sorted(tag_counts, key=tag_counts.get, reverse=True)[:20]
    ) or "لا يوجد بعد"

    return EXTRACTION_USER.format(
        text=text[:2000],
        metrics_definitions=metrics_text or "لا يوجد بعد",
        recent_tags=recent_tags
    )
```

---

## 4. LLM #2 — Daily Summary (23:50 يومياً)

### متى؟
Celery Beat كل يوم 23:50.
لو لا توجد entries ليوم → لا استدعاء LLM.

### Defaults
```python
DAILY_DEFAULT = ""  # summary فارغ
```

### Prompts
```python
DAILY_SYSTEM = """
أنت مساعد تحليل. اكتب جملة وصفية واحدة تلخص يوم المستخدم.
لا تحكم. لا تنصح. لا تتخيل معلومات غير موجودة.
"""

DAILY_USER = """
إدخالات اليوم ({date}):
{entries_text}

متوسط المزاج: {mood_avg}/5
التصنيفات: {top_tags}

اكتب جملة واحدة فقط (بالعربي) تصف هذا اليوم بشكل وصفي.
مثال: "يوم مليء بالعمل مع ضغط صباحي وهدوء في المساء."
"""
```

### الحسابات SQL في الـ task
```python
@shared_task
def generate_daily_reflection(user_id: int, date_str: str):
    from django.db.models import Avg
    from .models import Entry, DailyReflection

    entries = Entry.objects.filter(
        user_id=user_id,
        created_at__date=date_str,
        processing_status='done'
    ).order_by('created_at')

    if not entries.exists():
        return

    # SQL calculations
    avg_mood = entries.aggregate(Avg('mood_score'))['mood_score__avg']
    top_tags = _compute_top_tags(entries, limit=5)
    tag_alerts = _compute_tag_alerts(user_id, date_str)

    # LLM call واحد فقط
    entries_text = "\n".join(
        f"[{e.created_at.strftime('%H:%M')}] {e.text[:150]}"
        for e in entries
    )
    summary = safe_gemini_call(
        prompt=DAILY_USER.format(
            date=date_str,
            entries_text=entries_text,
            mood_avg=f"{avg_mood:.1f}" if avg_mood else "غير محدد",
            top_tags=", ".join(top_tags)
        ),
        system=DAILY_SYSTEM,
        default=DAILY_DEFAULT,
        max_tokens=100
    )
    if isinstance(summary, dict):
        summary = summary.get('summary', '')

    DailyReflection.objects.update_or_create(
        user_id=user_id, date=date_str,
        defaults={
            'avg_mood': avg_mood,
            'top_tags': top_tags,
            'tag_alerts': tag_alerts,
            'summary': summary or ''
        }
    )
```

---

## 5. LLM #3 — Weekly Patterns (أحد 00:30)

### Defaults
```python
WEEKLY_DEFAULT = {"patterns": []}
```

### Prompts
```python
WEEKLY_SYSTEM = """
أنت مساعد تحليل سلوكي. تحلل يوميات لتستخرج أنماطاً وصفية حقيقية.
قواعد صارمة:
- لا تحكم على المستخدم ولا تقيّم سلوكه
- لا تنصح (الاقتراحات للتحليل الشهري فقط)
- لا تتخيل أنماطاً غير موجودة في النص أو البيانات
- اكتب بالعربي
"""

WEEKLY_USER = """
بيانات الأسبوع ({week_start} → {week_end}):

ملخص Metrics (أرقام دقيقة — ركّز عليها):
{metrics_summary}

إدخالات مختصرة:
{entries_text}

إحصاءات:
- متوسط المزاج: {mood_avg}/5
- اتجاه المزاج (أحد→سبت): {mood_trend}
- أكثر التاجز: {top_tags}
- عدد الإدخالات: {entry_count}

اكتب 2-4 ملاحظات وصفية تصف أنماطاً حقيقية.

صياغة صحيحة:
✓ "ذُكر التعب 4 مرات في أيام وُجدت فيها اجتماعات"
✓ "متوسط السجاير ارتفع 40% يوم الخميس مقارنة ببقية الأسبوع"
✓ "أعلى مزاج كان أيام الجمعة في الأسابيع الأربعة"

صياغة خاطئة:
✗ "يجب عليك الاهتمام بالنوم"
✗ "أنت تعاني من ضغط العمل"

أجب فقط بـ JSON:
{{"patterns": ["ملاحظة 1", "ملاحظة 2"]}}
"""
```

### بناء metrics_summary (SQL بحت)
```python
def build_metrics_weekly_summary(user_id: int, week_start, week_end) -> str:
    from django.db.models import Sum, Avg
    from django.db.models.functions import TruncDate
    from .models import Metric, MetricBaseline

    lines = []
    metrics_by_name = Metric.objects.filter(
        user_id=user_id,
        recorded_at__date__gte=week_start,
        recorded_at__date__lte=week_end
    ).values('definition__name', 'definition__unit')\
     .annotate(week_avg=Avg('value'), week_total=Sum('value'))

    for m in metrics_by_name:
        name = m['definition__name']
        unit = m['definition__unit']

        # الأرقام اليومية
        daily = Metric.objects.filter(
            user_id=user_id,
            definition__name=name,
            recorded_at__date__gte=week_start,
            recorded_at__date__lte=week_end
        ).annotate(day=TruncDate('recorded_at'))\
         .values('day').annotate(s=Sum('value')).order_by('day')

        daily_values = [str(int(d['s'])) for d in daily]

        # baseline
        try:
            bl = MetricBaseline.objects.get(user_id=user_id, definition__name=name)
            dev = (m['week_avg'] - bl.daily_avg) / bl.daily_avg * 100
            bl_str = f"baseline {bl.daily_avg:.1f} — انحراف {dev:+.0f}%"
        except MetricBaseline.DoesNotExist:
            bl_str = "لا يوجد baseline بعد"

        lines.append(
            f"{name}: [{', '.join(daily_values)}] {unit}/يوم — "
            f"متوسط {m['week_avg']:.1f} — {bl_str}"
        )

    return "\n".join(lines) if lines else "لا توجد metrics هذا الأسبوع"


def build_weekly_entries_text(entries) -> str:
    """نص مختصر للإدخالات — أول 120 حرف لكل entry"""
    from itertools import groupby
    lines = []
    for date, day_entries in groupby(entries, key=lambda e: e.created_at.date()):
        day_list = list(day_entries)
        lines.append(f"\n{date.strftime('%A %d/%m')}:")
        for e in day_list:
            preview = e.text[:120] + ("..." if len(e.text) > 120 else "")
            lines.append(f"  [{e.created_at.strftime('%H:%M')}] {preview}")
    return "\n".join(lines)
```

---

## 6. LLM #4 — Monthly Insights (أول الشهر 01:00)

### Defaults
```python
MONTHLY_DEFAULT = {
    "patterns":   [],
    "suggestions": [],
    "new_tags":    [],
    "dropped_tags": []
}
```

### Prompts
```python
MONTHLY_SYSTEM = """
أنت مساعد تحليل سلوكي دوري. تحلل ملخصات أسبوعية لتستخرج أنماطاً شهرية وتقترح تحسينات.
قواعد الاقتراحات:
- صيغة "لاحظنا X — تحب تجرب Y؟" (سؤال لا أمر)
- مبنية فقط على بيانات حقيقية من الملخصات
- لا تكرر ما قيل في الأنماط الأسبوعية
- لا أكثر من 3 اقتراحات
"""

MONTHLY_USER = """
ملخصات أسابيع شهر {month_name} {year}:
{weekly_summaries}

بيانات هذا الشهر:
- متوسط المزاج: {curr_mood_avg}/5
- أكثر التاجز: {curr_top_tags}
- عدد الإدخالات: {entry_count}

بيانات الشهر السابق ({prev_month}):
- متوسط المزاج: {prev_mood_avg}/5
- أكثر التاجز: {prev_top_tags}

المطلوب:
1. patterns: 2-4 أنماط وصفية شهرية (أوسع من الأسبوعية)
2. suggestions: 1-3 اقتراحات تحسين
   مثال صح: "لاحظنا إن مودك أعلى في الأسابيع اللي فيها نشاط خارج الشغل — تحب تجرب تحجز وقت لنشاط أسبوعياً؟"
   مثال غلط: "يجب أن تنام مبكراً"
3. new_tags: تاجز ظهرت هذا الشهر ولم تكن الشهر السابق
4. dropped_tags: تاجز كانت الشهر السابق واختفت هذا الشهر

أجب فقط بـ JSON:
{{
  "patterns": [str],
  "suggestions": [str],
  "new_tags": [str],
  "dropped_tags": [str]
}}
"""
```

### بناء weekly_summaries للـ monthly prompt
```python
def build_monthly_weekly_summaries(user_id: int, month: int, year: int) -> str:
    from .models import WeeklyInsight
    insights = WeeklyInsight.objects.filter(
        user_id=user_id,
        week_start__month=month,
        week_start__year=year
    ).order_by('week_start')

    lines = []
    for wi in insights:
        metrics_str = ""
        if wi.metrics_summary:
            metrics_str = " | ".join(
                f"{name}: متوسط {data.get('avg',0):.1f}"
                for name, data in wi.metrics_summary.items()
            )
        lines.append(
            f"أسبوع {wi.week_start.strftime('%d/%m')}:\n"
            f"  مزاج: {wi.mood_avg:.1f}/5\n"
            f"  تاجز: {', '.join(t['tag'] for t in wi.top_tags[:5])}\n"
            f"  metrics: {metrics_str or 'لا يوجد'}\n"
            f"  أنماط: {' | '.join(wi.patterns[:2])}"
        )
    return "\n\n".join(lines) if lines else "لا توجد بيانات أسبوعية"
```

---

## 7. Tag Alerts — SQL بحت

```python
def _compute_tag_alerts(user_id: int, current_date) -> list:
    from datetime import timedelta, date
    from .models import Entry

    if isinstance(current_date, str):
        current_date = date.fromisoformat(current_date)

    cutoff = current_date - timedelta(days=14)
    entries = Entry.objects.filter(
        user_id=user_id,
        created_at__date__gte=cutoff,
        processing_status='done'
    ).values_list('tags', flat=True)

    tag_counts = {}
    for tags_list in entries:
        for tag in (tags_list or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    alerts = [
        {
            "tag": tag,
            "count": count,
            "days": 14,
            "message": f"التاج '{tag}' ظهر {count} مرات في آخر أسبوعين"
        }
        for tag, count in tag_counts.items() if count >= 3
    ]
    return sorted(alerts, key=lambda x: x['count'], reverse=True)
```

---

## 8. Metric Baselines — SQL بحت

```python
@shared_task
def update_metric_baselines():
    """كل أحد 01:30 — SQL بحت، صفر LLM"""
    from django.db.models import Avg, Min, Max, Count
    from django.contrib.auth import get_user_model
    from datetime import date, timedelta
    from .models import Metric, MetricBaseline

    User = get_user_model()
    cutoff = date.today() - timedelta(days=30)

    for user in User.objects.all():
        baselines = Metric.objects.filter(
            user=user, recorded_at__date__gte=cutoff
        ).values('definition')\
         .annotate(
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
```

---

## 9. Streak Counter — SQL بحت

```python
def get_user_streak(user_id: int) -> int:
    """عدد الأيام المتتالية حتى اليوم"""
    from datetime import date, timedelta
    from .models import Entry

    today = date.today()
    streak = 0
    current = today

    while True:
        has_entry = Entry.objects.filter(
            user_id=user_id,
            created_at__date=current
        ).exists()
        if not has_entry:
            break
        streak += 1
        current -= timedelta(days=1)

    return streak
```

---

## 10. جدول: LLM مقابل SQL

| الاستدعاء | الأداة | السبب |
|---|---|---|
| استخراج mood من نص | LLM ✓ | فهم لغوي |
| استخراج tags | LLM ✓ | فهم دلالي |
| استخراج metrics (كميات) | LLM ✓ | استخراج أرقام من نص |
| daily summary جملة | LLM ✓ | توليد نص |
| weekly patterns | LLM ✓ | ربط أنماط |
| monthly suggestions | LLM ✓ | توليد اقتراحات |
| متوسط مود | SQL ✓ | AVG بسيط |
| tag alerts | SQL ✓ | COUNT + threshold |
| metric baselines | SQL ✓ | AVG + GROUP BY |
| streak counter | SQL ✓ | COUNT DISTINCT date |
| top tags | Python Counter | بعد SQL fetch |
| metrics sparklines | SQL ✓ | GROUP BY date |
| مقارنة شهر بشهر | SQL ✓ | JOIN على weekly_insights |
