# المرايا — PATCH v3: إصلاح الـ Metrics الذكية
> يُطبَّق هذا الملف على الكود الموجود.
> رتّب التنفيذ بالترتيب المحدد — كل خطوة تعتمد على اللي قبلها.

---

## التغييرات المطلوبة — فهرس

| # | التغيير | الأولوية |
|---|---|---|
| FIX-01 | إصلاح prompt القهوة (unit بدون كمية = 1) | 🔴 حرج |
| FIX-02 | إضافة "عمل" للـ Seed Data | 🔴 حرج |
| FIX-03 | نظام الأحداث المفتوحة + حساب المدة تلقائياً | 🟠 مهم |
| FIX-04 | Keyword detection لإغلاق الحدث | 🟠 مهم |
| FIX-05 | Confirmation UI للإغلاق | 🟠 مهم |
| FIX-06 | كارد النوم وساعات العمل في الـ metrics | 🟡 تحسين |

---

## FIX-01: إصلاح prompt — unit بدون كمية = value 1

**المشكلة:**
"بشرب فنجان قهوه" — الـ LLM ما بيسجلش القهوة لأن الـ prompt بيقول "لو الكمية غير واضحة لا تُضفها".
"فنجان" هو الـ unit نفسه = كمية واحدة ضمنياً.

```python
# [FILE: apps/entries/ai.py]
# [ACTION: عدّل جزء metrics في EXTRACTION_USER_OPTIMIZED]

# استبدل هذا السطر:
# "لو الكمية غير واضحة في النص → لا تُضفها"

# بهذا:
"""
قواعد استخراج metrics:
- لو ذُكر الـ unit صريحاً بدون عدد → value = 1
  مثال: "بشرب فنجان قهوه" → {{"name":"قهوة","value":1,"unit":"كوب","is_new":false}}
  مثال: "اكلت" → لا تُضف (ما في unit ولا كمية)
  مثال: "سجرت سيجارة" → {{"name":"سجاير","value":1,"unit":"سيجارة","is_new":false}}
  مثال: "شربت 3 كبايات" → {{"name":"قهوة","value":3,"unit":"كوب","is_new":false}}
- لو مفيش unit ولا كمية → لا تُضف
"""
```

---

## FIX-02: إضافة "عمل" و"نوم" للـ Seed Data

**المشكلة:**
"عمل" مش موجودة كـ metric. "نوم" موجودة لكن بدون دعم للأحداث المفتوحة.

```python
# [FILE: apps/entries/management/commands/seed_metrics.py]
# [ACTION: أنشئ هذا الـ command أو شغّل الكود مباشرة في shell]

from django.core.management.base import BaseCommand
from apps.entries.models import MetricDefinition

NEW_METRICS = [
    {
        "name":      "عمل",
        "unit":      "ساعة",
        "category":  "activity",
        "aliases":   ["شغل", "اشتغلت", "هشتغل", "بشتغل", "جلسة عمل"],
        "is_system": True,
        "is_duration_based": True,  # يُحسب من فرق الوقت
    },
    {
        "name":      "نوم",
        "unit":      "ساعة",
        "category":  "health",
        "aliases":   ["نمت", "هنام", "صحيت", "ساعات نوم", "نوم"],
        "is_system": True,
        "is_duration_based": True,
    },
]

class Command(BaseCommand):
    help = 'يضيف metrics الجديدة للـ seed data'

    def handle(self, *args, **kwargs):
        for m in NEW_METRICS:
            is_duration = m.pop('is_duration_based', False)
            obj, created = MetricDefinition.objects.get_or_create(
                name=m['name'], defaults=m
            )
            if created:
                self.stdout.write(f"✅ أُضيف: {obj.name}")
            else:
                # تحديث الـ aliases لو موجود
                obj.aliases = m['aliases']
                obj.save(update_fields=['aliases'])
                self.stdout.write(f"🔄 محدّث: {obj.name}")
```

```bash
# [ACTION: شغّل بعد إنشاء الـ command]
python manage.py seed_metrics
```

---

## FIX-03: نظام الأحداث المفتوحة — حساب المدة تلقائياً

### 3.1 تعديل MetricDefinition — إضافة is_duration_based

```python
# [FILE: apps/entries/models.py]
# [ACTION: أضف حقل في MetricDefinition]

class MetricDefinition(models.Model):
    # ... الحقول الموجودة ...

    is_duration_based = models.BooleanField(default=False)
    # True = الـ value بيُحسب من فرق الوقت بين entry البداية والنهاية
    # مثال: نوم، عمل، رياضة (لو بدأ وخلّص)
    # False = الـ value صريح في النص (سجاير، قهوة، ماء)
```

```bash
# [ACTION: بعد إضافة الحقل]
python manage.py makemigrations entries --name="add_is_duration_based"
python manage.py migrate
```

### 3.2 تحديث الـ Seed لتحديد is_duration_based

```python
# [ACTION: شغّل في python manage.py shell]

from apps.entries.models import MetricDefinition

duration_metrics = ['نوم', 'عمل', 'رياضة']
MetricDefinition.objects.filter(name__in=duration_metrics).update(
    is_duration_based=True
)
print("✅ تم تحديث is_duration_based للـ metrics:", duration_metrics)
```

### 3.3 دالة حساب المدة وإنشاء الـ Metric تلقائياً

```python
# [FILE: apps/entries/tasks.py]
# [ACTION: أضف هذه الدالة]

from datetime import timedelta

def close_open_event_and_record_duration(open_entry, closing_entry):
    """
    يغلق حدثاً مفتوحاً ويسجل مدته كـ Metric تلقائياً.

    open_entry:    الـ entry الذي فيه is_open_event=True
    closing_entry: الـ entry الجديد الذي يُغلق الحدث

    يُستدعى فقط بعد موافقة المستخدم من الـ frontend.
    """
    # حساب المدة بالساعات
    duration_seconds = (
        closing_entry.created_at - open_entry.created_at
    ).total_seconds()
    duration_hours = round(duration_seconds / 3600, 1)

    if duration_hours <= 0 or duration_hours > 24:
        # مدة غير منطقية — لا تسجّل
        return None

    # تحديد اسم الـ metric من tags أو entities للـ open entry
    metric_name = _detect_duration_metric_name(open_entry)
    if not metric_name:
        return None

    try:
        definition = MetricDefinition.objects.get(
            name=metric_name,
            is_duration_based=True
        )
    except MetricDefinition.DoesNotExist:
        return None

    # إغلاق الحدث
    open_entry.is_open_event = False
    open_entry.save(update_fields=['is_open_event'])

    # تسجيل الـ Metric
    metric = Metric.objects.create(
        user=closing_entry.user,
        entry=open_entry,        # مرتبط بالـ entry الأصلي (البداية)
        definition=definition,
        value=duration_hours,
        recorded_at=open_entry.created_at
    )

    return {
        'metric_name':    metric_name,
        'duration_hours': duration_hours,
        'metric_id':      metric.id,
    }


def _detect_duration_metric_name(open_entry) -> str | None:
    """
    يكتشف نوع الـ metric من الـ entry المفتوح.
    يبحث في tags و entities و النص نفسه.
    """
    DURATION_KEYWORD_MAP = {
        'نوم':   ['نوم', 'نمت', 'هنام', 'نايم', 'أنام'],
        'عمل':   ['شغل', 'عمل', 'اشتغل', 'هشتغل', 'بشتغل', 'مشروع'],
        'رياضة': ['جيم', 'تمرين', 'جري', 'رياضة', 'مشي'],
    }

    text_lower = open_entry.text.lower()
    tags_lower = [t.lower() for t in (open_entry.tags or [])]

    for metric_name, keywords in DURATION_KEYWORD_MAP.items():
        for kw in keywords:
            if kw in text_lower or any(kw in t for t in tags_lower):
                return metric_name

    return None
```

---

## FIX-04: Keyword Detection لاقتراح إغلاق الحدث

```python
# [FILE: apps/entries/tasks.py]
# [ACTION: أضف هذه الدالة وعدّل extract_entry_data]

CLOSING_KEYWORDS = [
    'صحيت', 'صحيان', 'قومت',       # إغلاق نوم
    'وقفت', 'خلصت', 'انهيت', 'كملت', 'انتهيت',  # إغلاق عمل
    'رجعت', 'خرجت',                  # إغلاق عمل/رياضة
]

def detect_closing_intent(text: str) -> bool:
    """هل الـ entry ده بيُغلق حدثاً مفتوحاً؟"""
    text_lower = text.lower()
    return any(kw in text_lower for kw in CLOSING_KEYWORDS)


def find_matching_open_event(user, closing_text: str):
    """
    يبحث عن أقرب open event للمستخدم يتطابق مع نص الإغلاق.
    يُرجع entry أو None.
    """
    from django.utils.timezone import now
    from datetime import timedelta

    # بحث في آخر 18 ساعة فقط (أحداث قديمة أكثر غالباً مش مرتبطة)
    cutoff = now() - timedelta(hours=18)

    open_events = Entry.objects.filter(
        user=user,
        is_open_event=True,
        created_at__gte=cutoff
    ).order_by('-created_at')

    if not open_events.exists():
        return None

    closing_lower = closing_text.lower()

    CLOSE_OPEN_MAP = {
        'صحيت':   ['نوم', 'نمت', 'هنام'],
        'قومت':   ['نوم', 'نمت', 'هنام'],
        'وقفت':   ['شغل', 'عمل', 'مشروع', 'هشتغل'],
        'خلصت':   ['شغل', 'عمل', 'مشروع', 'جيم', 'تمرين'],
        'انتهيت': ['شغل', 'عمل', 'مشروع'],
        'رجعت':   ['جيم', 'تمرين', 'رياضة', 'شغل'],
    }

    # اكتشف نوع الإغلاق
    matched_open_keywords = []
    for close_kw, open_kws in CLOSE_OPEN_MAP.items():
        if close_kw in closing_lower:
            matched_open_keywords.extend(open_kws)

    if not matched_open_keywords:
        # مفيش mapping واضح — رجّع أحدث open event كاحتمال
        return open_events.first()

    # ابحث عن open event يحتوي على أحد الـ keywords
    for event in open_events:
        event_text_lower = event.text.lower()
        event_tags_lower = [t.lower() for t in (event.tags or [])]
        for kw in matched_open_keywords:
            if kw in event_text_lower or any(kw in t for t in event_tags_lower):
                return event

    # لو ما لقيناش match واضح، رجّع الأحدث كاحتمال
    return open_events.first()


# [ACTION: في extract_entry_data، أضف بعد حفظ الـ entry]

# بعد: entry.save()
# أضف:

if detect_closing_intent(entry.text):
    matching_event = find_matching_open_event(entry.user, entry.text)
    if matching_event:
        duration_info = _get_duration_preview(matching_event, entry)
        # خزّن اقتراح الإغلاق في Redis لمدة 10 دقائق
        cache_key = f"close_suggestion:{entry.user_id}:{entry.id}"
        from django.core.cache import cache
        cache.set(cache_key, {
            'open_entry_id':   matching_event.id,
            'open_entry_text': matching_event.text[:100],
            'closing_entry_id': entry.id,
            'duration_hours':  duration_info,
            'metric_name':     _detect_duration_metric_name(matching_event),
        }, timeout=600)  # 10 دقائق


def _get_duration_preview(open_entry, closing_entry) -> float:
    """حساب المدة المتوقعة بدون تسجيلها"""
    seconds = (closing_entry.created_at - open_entry.created_at).total_seconds()
    return round(seconds / 3600, 1)
```

---

## FIX-05: API Endpoint للاقتراح والتأكيد

```python
# [FILE: apps/entries/views.py]
# [ACTION: أضف هذه الـ Views]

from django.core.cache import cache

class CloseSuggestionView(APIView):
    """
    GET: يجلب اقتراح إغلاق حدث للـ entry المحدد (لو موجود)
    POST: يؤكد الإغلاق ويسجل المدة كـ Metric
    DELETE: يرفض الاقتراح
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, entry_id):
        cache_key = f"close_suggestion:{request.user.id}:{entry_id}"
        suggestion = cache.get(cache_key)

        if not suggestion:
            return Response({'has_suggestion': False})

        return Response({
            'has_suggestion':   True,
            'open_entry_id':    suggestion['open_entry_id'],
            'open_entry_text':  suggestion['open_entry_text'],
            'duration_hours':   suggestion['duration_hours'],
            'metric_name':      suggestion['metric_name'],
        })

    def post(self, request, entry_id):
        """المستخدم وافق — سجّل المدة"""
        cache_key = f"close_suggestion:{request.user.id}:{entry_id}"
        suggestion = cache.get(cache_key)

        if not suggestion:
            return Response({'error': 'الاقتراح انتهت صلاحيته'}, status=404)

        try:
            open_entry    = Entry.objects.get(
                id=suggestion['open_entry_id'],
                user=request.user
            )
            closing_entry = Entry.objects.get(
                id=suggestion['closing_entry_id'],
                user=request.user
            )
        except Entry.DoesNotExist:
            return Response({'error': 'إدخال غير موجود'}, status=404)

        result = close_open_event_and_record_duration(open_entry, closing_entry)
        cache.delete(cache_key)

        if result:
            return Response({
                'success':        True,
                'metric_name':    result['metric_name'],
                'duration_hours': result['duration_hours'],
            })
        return Response({'error': 'لم يتم التسجيل'}, status=400)

    def delete(self, request, entry_id):
        """المستخدم رفض — احذف الاقتراح"""
        cache_key = f"close_suggestion:{request.user.id}:{entry_id}"
        cache.delete(cache_key)
        return Response({'dismissed': True})
```

```python
# [FILE: config/urls.py]
# [ACTION: أضف]
path('api/v1/entries/<int:entry_id>/close-suggestion/',
     CloseSuggestionView.as_view()),
```

---

## FIX-06: Confirmation UI في الـ Frontend

```jsx
// [FILE: src/components/CloseSuggestionBanner.jsx]
// [ACTION: أنشئ هذا المكون]

import { useState, useEffect } from 'react'
import api from '../lib/api'

export default function CloseSuggestionBanner({ entryId, onConfirmed }) {
  const [suggestion, setSuggestion] = useState(null)
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    if (!entryId) return
    // انتظر ثانيتين عشان الـ Celery task يخزن الاقتراح في Redis
    const timer = setTimeout(() => fetchSuggestion(), 2000)
    return () => clearTimeout(timer)
  }, [entryId])

  const fetchSuggestion = async () => {
    try {
      const { data } = await api.get(`/entries/${entryId}/close-suggestion/`)
      if (data.has_suggestion) setSuggestion(data)
    } catch { /* ignore */ }
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const { data } = await api.post(`/entries/${entryId}/close-suggestion/`)
      onConfirmed?.({
        metricName:    data.metric_name,
        durationHours: data.duration_hours,
      })
      setSuggestion(null)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = async () => {
    await api.delete(`/entries/${entryId}/close-suggestion/`)
    setSuggestion(null)
  }

  if (!suggestion) return null

  const hours   = Math.floor(suggestion.duration_hours)
  const minutes = Math.round((suggestion.duration_hours - hours) * 60)
  const durationText = hours > 0
    ? `${hours} ساعة${minutes > 0 ? ` و${minutes} دقيقة` : ''}`
    : `${minutes} دقيقة`

  return (
    <div
      className="animate-slide-up"
      style={{
        margin:        '0 16px 12px',
        background:    'rgba(46,117,182,0.08)',
        border:        '1px solid rgba(46,117,182,0.3)',
        borderRadius:  'var(--radius-md)',
        padding:       '12px 14px',
      }}
    >
      {/* Header */}
      <div style={{
        display:'flex', justifyContent:'space-between',
        alignItems:'flex-start', marginBottom:10,
      }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--primary)' }}>
          ⏱ إغلاق حدث؟
        </span>
        <button onClick={handleDismiss} style={{
          background:'none', border:'none',
          color:'var(--text-muted)', cursor:'pointer', fontSize:16,
        }}>×</button>
      </div>

      {/* الحدث المفتوح */}
      <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 6px' }}>
        بدأت:
      </p>
      <p style={{
        fontSize:13, color:'var(--text-secondary)',
        background:'var(--bg-elevated)',
        padding:'6px 10px', borderRadius:'var(--radius-sm)',
        margin:'0 0 10px',
      }}>
        "{suggestion.open_entry_text}"
      </p>

      {/* المدة */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, marginBottom:12,
      }}>
        <span style={{ fontSize:24, fontWeight:700, color:'var(--primary)' }}>
          {suggestion.duration_hours.toFixed(1)}
        </span>
        <div>
          <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight:600 }}>
            {suggestion.metric_name}
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            {durationText}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display:'flex', gap:8 }}>
        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            flex:1, padding:'10px',
            borderRadius:'var(--radius-pill)',
            background:'var(--primary)', color:'white',
            border:'none', fontSize:13, fontWeight:600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '⏳' : '✓ تسجيل'}
        </button>
        <button
          onClick={handleDismiss}
          style={{
            flex:1, padding:'10px',
            borderRadius:'var(--radius-pill)',
            background:'transparent',
            border:'1px solid var(--border)',
            color:'var(--text-secondary)',
            fontSize:13, cursor:'pointer',
          }}
        >
          تجاهل
        </button>
      </div>
    </div>
  )
}
```

```jsx
// [FILE: src/pages/Home.jsx]
// [ACTION: أضف CloseSuggestionBanner بعد حفظ الـ entry]

import CloseSuggestionBanner from '../components/CloseSuggestionBanner'

// في الـ state:
const [lastSavedEntryId, setLastSavedEntryId] = useState(null)

// في handleSave، بعد api.post:
setLastSavedEntryId(data.id)

// في الـ JSX، بعد الـ Reflection Card:
{lastSavedEntryId && (
  <CloseSuggestionBanner
    entryId={lastSavedEntryId}
    onConfirmed={({ metricName, durationHours }) => {
      showToast(`✅ سُجّل ${metricName}: ${durationHours} ساعة`)
      fetchTodayMetrics()  // تحديث الـ cards
      setLastSavedEntryId(null)
    }}
  />
)}
```

---

## ترتيب التنفيذ

```
1. FIX-01: عدّل ai.py (سطرين بس — أسرع إصلاح)

2. FIX-02:
   a. أنشئ management command
   b. شغّل: python manage.py seed_metrics

3. FIX-03:
   a. أضف is_duration_based في MetricDefinition
   b. python manage.py makemigrations entries
   c. python manage.py migrate
   d. شغّل في shell لتحديث الـ seed:
      MetricDefinition.objects.filter(name__in=['نوم','عمل','رياضة']).update(is_duration_based=True)
   e. أضف الدوال في tasks.py

4. FIX-04: أضف الدوال في tasks.py + عدّل extract_entry_data

5. FIX-05: أضف CloseSuggestionView + URL

6. FIX-06:
   a. أنشئ CloseSuggestionBanner.jsx
   b. عدّل Home.jsx
```

---

## FIX-07: كارد خاص للـ Duration Metrics (نوم / عمل)

**المشكلة:**
النوم والعمل بيانات مختلفة عن السجاير والقهوة — محتاجين عرض مختلف:
- متوسط ساعات النوم اليومي
- مقارنة بـ baseline (8 ساعات = مثالي)
- اتجاه الأسبوع

```jsx
// [FILE: src/components/DurationMetricCard.jsx]
// [ACTION: أنشئ هذا المكون]

import { useCounter } from '../hooks/useCounter'
import { useEffect, useState } from 'react'
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'

const IDEAL_BASELINES = {
  'نوم':   { ideal: 8,   label: 'ساعات النوم الموصى بها: 8' },
  'عمل':   { ideal: 8,   label: 'ساعات العمل المعتادة: 8'   },
  'رياضة': { ideal: 0.5, label: 'الحد الأدنى: 30 دقيقة'     },
}

export default function DurationMetricCard({ metric, weeklyData = [], index }) {
  const [barWidth, setBarWidth] = useState(0)
  const animatedValue = useCounter(metric.today_total || 0, 800, 1)

  const ideal    = IDEAL_BASELINES[metric.name]?.ideal || metric.baseline_avg || 8
  const baseline = metric.baseline_avg || ideal
  const pct      = Math.min((metric.today_total / ideal) * 100, 100)

  // لون يعتمد على النسبة من المثالي
  const getColor = (value) => {
    const ratio = value / ideal
    if (ratio >= 0.85) return 'var(--mood-high)'    // ≥ 85% → أخضر
    if (ratio >= 0.6)  return 'var(--mood-mid)'     // 60-85% → أصفر
    return 'var(--mood-low)'                         // < 60% → أحمر
  }
  const todayColor = getColor(metric.today_total || 0)

  useEffect(() => {
    const t = setTimeout(() => setBarWidth(pct), 200 + index * 80)
    return () => clearTimeout(t)
  }, [pct])

  // تحويل الساعات لنص مقروء
  const formatHours = (h) => {
    if (!h) return '—'
    const hours   = Math.floor(h)
    const minutes = Math.round((h - hours) * 60)
    if (hours === 0) return `${minutes} د`
    return minutes > 0 ? `${hours}س ${minutes}د` : `${hours} ساعة`
  }

  return (
    <div
      className="animate-fade-in"
      style={{
        margin:       `0 16px ${index === 0 ? 10 : 8}px`,
        background:   'var(--bg-surface)',
        border:       '1px solid var(--border)',
        borderRight:  `3px solid ${todayColor}`,
        borderRadius: 'var(--radius-md)',
        padding:      '14px 16px',
        animationDelay: `${index * 80}ms`,
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>
          {metric.name === 'نوم' ? '😴' : metric.name === 'عمل' ? '💼' : '⚡'}{' '}
          {metric.name}
        </span>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>اليوم</span>
      </div>

      {/* الرقم الكبير */}
      <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:12 }}>
        <span style={{ fontSize:36, fontWeight:700, color: todayColor }}>
          {formatHours(animatedValue)}
        </span>
        {metric.today_total ? (
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>
            {metric.today_total >= ideal ? '✓' : `من ${ideal} المثالية`}
          </span>
        ) : (
          <span style={{ fontSize:13, color:'var(--text-muted)' }}>
            لم يُسجَّل بعد
          </span>
        )}
      </div>

      {/* Progress Bar نحو المثالي */}
      <div style={{ marginBottom:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between',
          marginBottom:4 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
            نحو الـ {ideal} ساعة المثالية
          </span>
          <span style={{ fontSize:11, color: todayColor, fontWeight:600 }}>
            {Math.round(pct)}%
          </span>
        </div>
        <div style={{
          height:6, background:'var(--bg-elevated)',
          borderRadius:3, overflow:'hidden',
        }}>
          <div style={{
            height:'100%', borderRadius:3,
            background: todayColor,
            width:`${barWidth}%`,
            transition:'width 800ms cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>

      {/* Sparkline الأسبوع (لو في بيانات) */}
      {weeklyData.length > 0 && (
        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>
            آخر {weeklyData.length} أيام
          </div>
          <ResponsiveContainer width="100%" height={40}>
            <BarChart data={weeklyData} barSize={8}>
              <Bar dataKey="value" radius={[2,2,0,0]}>
                {weeklyData.map((d, i) => (
                  <Cell key={i} fill={getColor(d.value)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Baseline */}
      <div style={{
        marginTop:8, fontSize:11,
        color:'var(--text-muted)',
        display:'flex', justifyContent:'space-between',
      }}>
        <span>معدلك: {formatHours(baseline)}/يوم</span>
        {metric.deviation_pct != null && (
          <span style={{
            color: Math.abs(metric.deviation_pct) < 15
              ? 'var(--text-muted)' : todayColor
          }}>
            {metric.deviation_pct > 0 ? '+' : ''}{metric.deviation_pct.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}
```

```jsx
// [FILE: src/pages/Home.jsx و src/pages/Habits.jsx]
// [ACTION: استخدم DurationMetricCard للـ metrics اللي is_duration_based=true]

import DurationMetricCard from '../components/DurationMetricCard'
import MetricCard         from '../components/MetricCard'

// في render الـ metrics:
{metrics.map((metric, index) =>
  metric.is_duration_based
    ? <DurationMetricCard key={metric.name} metric={metric}
        weeklyData={weeklyMetrics[metric.name] || []} index={index} />
    : <MetricCard         key={metric.name} metric={metric} index={index} />
)}
```

```python
# [FILE: apps/entries/serializers.py أو views.py]
# [ACTION: أضف is_duration_based في response الـ metrics]

# في TodayMetricsView، أضف للـ result dict:
'is_duration_based': definition.is_duration_based,
```

```javascript
// [FILE: src/pages/Home.jsx]
// [ACTION: جلب weekly data للـ duration metrics]

const fetchWeeklyMetrics = async () => {
  const durationMetrics = metrics.filter(m => m.is_duration_based)
  const results = {}

  await Promise.all(
    durationMetrics.map(async (m) => {
      const { data } = await api.get('/metrics/history/', {
        params: { name: m.name, days: 7 }
      })
      results[m.name] = data.data || []
    })
  )
  setWeeklyMetrics(results)
}

// استدعيها بعد fetchTodayMetrics
```

---

## FIX-08: تبسيط تشغيل المشروع (2 terminals بدل 5)

**المشكلة:**
المستخدم بيفتح 5 terminals:
1. Redis
2. PostgreSQL
3. Celery Worker
4. Celery Beat
5. Django runserver
+ Frontend = 6 terminals

**الحل: docker-compose.dev.yml يشغّل كل الخدمات الداعمة**

```yaml
# [FILE: docker-compose.dev.yml]
# [ACTION: أنشئ هذا الملف في root المشروع]

version: '3.9'

# هذا الملف يشغّل: PostgreSQL + Redis + Celery Worker + Celery Beat
# أنت بتشغّل يدوياً بس: Django + Frontend (terminal واحد لكل منهم)

services:

  db:
    image: postgres:16-alpine
    container_name: maraya_db
    restart: unless-stopped
    environment:
      POSTGRES_DB:       maraya
      POSTGRES_USER:     maraya
      POSTGRES_PASSWORD: maraya_dev_pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U maraya -d maraya"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: maraya_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  celery_worker:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: maraya_celery_worker
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://maraya:maraya_dev_pass@db:5432/maraya
      REDIS_URL:    redis://redis:6379/0
    volumes:
      - .:/app
      - whisper_models:/app/whisper_models
    depends_on:
      db:    { condition: service_healthy }
      redis: { condition: service_healthy }
    command: celery -A config worker --loglevel=info --concurrency=2

  celery_beat:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: maraya_celery_beat
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://maraya:maraya_dev_pass@db:5432/maraya
      REDIS_URL:    redis://redis:6379/0
    volumes:
      - .:/app
    depends_on:
      db:    { condition: service_healthy }
      redis: { condition: service_healthy }
    command: >
      celery -A config beat --loglevel=info
      --scheduler django_celery_beat.schedulers:DatabaseScheduler

volumes:
  postgres_data:
  whisper_models:
```

```makefile
# [FILE: Makefile]
# [ACTION: أنشئ في root المشروع]

# ── الاستخدام اليومي ──────────────────────────────
up:
	docker compose -f docker-compose.dev.yml up -d
	@echo ""
	@echo "✅ Docker جاهز. شغّل في terminalين:"
	@echo "   Terminal 1:  make back"
	@echo "   Terminal 2:  make front"
	@echo ""

down:
	docker compose -f docker-compose.dev.yml down

back:
	python manage.py runserver

front:
	cd frontend && npm run dev

# ── Shortcuts مفيدة ───────────────────────────────
m:
	python manage.py migrate

mm:
	python manage.py makemigrations

shell:
	python manage.py shell

# ── Logs ──────────────────────────────────────────
lw:
	docker logs maraya_celery_worker -f

lb:
	docker logs maraya_celery_beat -f

ld:
	docker logs maraya_db -f

# ── Maintenance ───────────────────────────────────
reprocess:
	python manage.py reprocess_pending

regen-daily:
	python manage.py regenerate_insights --type daily --days 7

seed:
	python manage.py seed_metrics

# ── Reset كامل (حذف كل بيانات Dev) ───────────────
reset:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d
	@sleep 5
	python manage.py migrate
	python manage.py seed_metrics
	@echo "✅ بيئة نظيفة جاهزة"

.PHONY: up down back front m mm shell lw lb ld reprocess regen-daily seed reset
```

**الناتج بعد التطبيق:**
```
# كل مرة بتشغّل المشروع:

Terminal 1:
make up      ← يشغّل Docker (PostgreSQL + Redis + Celery)
make back    ← Django runserver

Terminal 2:
make front   ← Vite dev server

# من 6 terminals → 2 terminals
```

---

## ✅ Checkpoints بعد التنفيذ

```bash
# 1. اختبر القهوة
# اكتب: "بشرب فنجان قهوه"
# انتظر 10 ثواني
# يجب: Metric(قهوة, 1.0, كوب) موجودة

# 2. اختبر نظام الإغلاق
# اكتب: "هنام" — انتظر processing
# اكتب بعد دقيقة: "صحيت"
# يجب: بعد ثانيتين يظهر CloseSuggestionBanner
# اضغط "تسجيل"
# يجب: Metric(نوم, X, ساعة) موجودة

# 3. اختبر العمل
# اكتب: "هبداء في الشغل"
# اكتب بعد فترة: "وقفت شغل"
# يجب: اقتراح إغلاق يظهر مع المدة

# 4. تحقق من السجل
python manage.py shell -c "
from apps.entries.models import Metric
for m in Metric.objects.order_by('-recorded_at')[:5]:
    print(m.definition.name, m.value, m.definition.unit)
"
```
