# المرايا — ملف إصلاح الأخطاء والتحسينات
> يُطبَّق هذا الملف على الكود الموجود. كل إصلاح محدد بـ [الأولوية] و[الملف] و[الإجراء].
> رتّب التنفيذ حسب الأولوية: 🔴 حرج → 🟠 مهم → 🟡 تحسين.

---

## 🔴 الأخطاء الحرجة (تؤثر على صحة البيانات)

---

### BUG-01: منطق ترقية الـ Metrics معطّل

**المشكلة:**
`suggested_by_count` يزيد فقط عند إنشاء `MetricDefinition` جديد (مستخدم يكتشف metric غير موجود).
لو مستخدم تاني استخدم نفس الـ metric الموجود أصلاً، مش بيُحسب — يعني الترقية للـ global مش بتحصل أبداً في الغالب.

**الحل: جدول وسيط يسجل المستخدمين الفريدين**

```python
# [FILE: apps/entries/models.py]
# [ACTION: أضف هذا الجدول بعد MetricDefinition]

class MetricDefinitionContributor(models.Model):
    """
    يسجل كل مستخدم استخدم metric معين — مرة واحدة لكل مستخدم/metric.
    suggested_by_count = عدد الصفوف الفريدة هنا لكل definition.
    """
    definition = models.ForeignKey(
        MetricDefinition,
        on_delete=models.CASCADE,
        related_name='contributors'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='metric_contributions'
    )
    first_used = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['definition', 'user']]
```

```python
# [FILE: apps/entries/tasks.py]
# [ACTION: استبدل دالة _process_new_metric كاملاً]

PROMOTION_THRESHOLD = 3

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
```

```python
# [FILE: apps/entries/tasks.py]
# [ACTION: في extract_entry_data، عدّل استدعاء _process_new_metric]

# قبل:
if is_new:
    _process_new_metric(name, unit)

# بعد (يُستدعى دايماً، مش بس للـ metric الجديد):
_process_new_metric(name, unit, user_id=entry.user_id)
```

```python
# [FILE: apps/entries/migrations/]
# [ACTION: أنشئ migration جديدة]
python manage.py makemigrations entries
python manage.py migrate
```

---

### BUG-02: لا يوجد Endpoint لحذف جميع البيانات

**المشكلة:**
شاشة الإعدادات فيها زرار "حذف جميع البيانات" بدون endpoint في الباك إند.

**الحل:**

```python
# [FILE: apps/accounts/views.py]
# [ACTION: أضف هذا الـ View]

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction

class DeleteAllUserDataView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user

        with transaction.atomic():
            # حذف البيانات بالترتيب الصحيح (FKs)
            from apps.entries.models import Metric, MetricBaseline, Entry
            from apps.insights.models import (
                DailyReflection, WeeklyInsight, MonthlyInsight
            )

            Metric.objects.filter(user=user).delete()
            MetricBaseline.objects.filter(user=user).delete()
            Entry.objects.filter(user=user).delete()
            DailyReflection.objects.filter(user=user).delete()
            WeeklyInsight.objects.filter(user=user).delete()
            MonthlyInsight.objects.filter(user=user).delete()

        return Response({'message': 'تم حذف جميع البيانات بنجاح'}, status=200)
```

```python
# [FILE: config/urls.py]
# [ACTION: أضف الـ URL]

path('api/v1/account/delete-data/', DeleteAllUserDataView.as_view()),
```

```javascript
// [FILE: src/pages/Settings.jsx]
// [ACTION: عدّل handler زرار الحذف]

const handleDeleteAll = async () => {
  const confirmed = window.confirm(
    'هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟'
  )
  if (!confirmed) return

  try {
    await api.delete('/account/delete-data/')
    logout()
    navigate('/login')
  } catch {
    showToast('فشل الحذف — حاول مجدداً', 'error')
  }
}
```

---

## 🟠 الأخطاء المهمة (تؤثر على تجربة المستخدم)

---

### BUG-03: useCounter لا يدعم الأعداد العشرية

**المشكلة:**
`Math.round` يحول 7.5 ساعة نوم → 8، و1.5 لتر ماء → 2.

```javascript
// [FILE: src/hooks/useCounter.js]
// [ACTION: استبدل الملف كاملاً]

import { useState, useEffect, useRef } from 'react'

export function useCounter(target, duration = 600, decimals = 0) {
  const [value, setValue] = useState(0)
  const startRef = useRef({ time: null, value: 0 })

  useEffect(() => {
    if (target === null || target === undefined) return
    startRef.current = { time: performance.now(), value: value }

    const animate = (now) => {
      const elapsed  = now - startRef.current.time
      const progress = Math.min(elapsed / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      const current  = startRef.current.value + (target - startRef.current.value) * eased
      // decimals: 0 للأعداد الصحيحة، 1 للعشرية
      setValue(parseFloat(current.toFixed(decimals)))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [target])

  return value
}
```

```jsx
// [FILE: src/components/MetricCard.jsx]
// [ACTION: عدّل استخدام useCounter]

// قبل:
const animatedValue = useCounter(Math.round(metric.today_total || 0), 600)

// بعد (يكشف العشريات تلقائياً):
const needsDecimal = (metric.today_total % 1 !== 0)
const animatedValue = useCounter(metric.today_total || 0, 600, needsDecimal ? 1 : 0)
```

---

### BUG-04: لا يوجد زرار "إعادة المحاولة" بعد انتهاء الـ Polling

**المشكلة:**
بعد 10 محاولات فاشلة، الـ entry يبقى في حالة خطأ بدون طريقة للمستخدم يعيد التحليل.

```javascript
// [FILE: src/lib/polling.js]
// [ACTION: استبدل الملف كاملاً]

export function pollEntryStatus(api, entryId, onDone, onFail, onStatusUpdate) {
  let attempts = 0
  const MAX_ATTEMPTS = 12  // زيادة من 10 → 12

  const check = async () => {
    attempts++
    if (attempts > MAX_ATTEMPTS) {
      onFail('analysis_timeout', entryId)  // نمرر entryId للـ retry
      return
    }
    try {
      const { data } = await api.get(`/entries/${entryId}/`)
      onStatusUpdate?.(data.processing_status, attempts)

      if (data.processing_status === 'done') {
        onDone(data)
      } else if (['failed', 'rate_limited'].includes(data.processing_status)) {
        onFail(data.processing_status, entryId)
      } else {
        const delay = Math.min(2000 * Math.sqrt(attempts), 20000)
        setTimeout(check, delay)
      }
    } catch {
      const delay = Math.min(2000 * attempts, 15000)
      setTimeout(check, delay)
    }
  }

  setTimeout(check, 2000)
}
```

```jsx
// [FILE: src/components/EntryCard.jsx]
// [ACTION: أضف RetryButton في حالة الفشل]

import api from '../lib/api'
import { pollEntryStatus } from '../lib/polling'

function RetryButton({ entryId, onRetried }) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    setRetrying(true)
    try {
      // إعادة تعيين الحالة لـ pending
      await api.patch(`/entries/${entryId}/`, { processing_status: 'pending' })
      // بدء polling جديد
      pollEntryStatus(api, entryId, onRetried, () => setRetrying(false))
    } catch {
      setRetrying(false)
    }
  }

  return (
    <button onClick={handleRetry} disabled={retrying} style={{
      marginTop: 8, padding: '6px 14px',
      borderRadius: 'var(--radius-pill)',
      border: '1px solid var(--primary)',
      background: 'transparent', color: 'var(--primary)',
      fontSize: 12, cursor: 'pointer',
    }}>
      {retrying ? '⏳ جارٍ إعادة المحاولة...' : '🔄 إعادة التحليل'}
    </button>
  )
}

// في EntryCard — أضف بعد الـ skeleton:
{entry.processing_status === 'failed' && (
  <div style={{ padding: '8px 0' }}>
    <span style={{ fontSize: 12, color: 'var(--mood-low)' }}>
      فشل التحليل
    </span>
    <RetryButton
      entryId={entry.id}
      onRetried={(updated) => onEntryUpdated?.(updated)}
    />
  </div>
)}
```

```python
# [FILE: apps/entries/views.py]
# [ACTION: أضف PATCH endpoint لإعادة تعيين processing_status]

class EntryViewSet(UserScopedViewSet):
    # أضف هذا الـ action:
    @action(detail=True, methods=['patch'])
    def retry_analysis(self, request, pk=None):
        entry = self.get_object()
        if entry.processing_status not in ['failed', 'rate_limited']:
            return Response(
                {'error': 'لا يمكن إعادة المحاولة إلا للإدخالات الفاشلة'},
                status=400
            )
        entry.processing_status = 'pending'
        entry.save(update_fields=['processing_status'])
        extract_entry_data.delay(entry.id)
        return Response({'status': 'pending'})
```

---

### BUG-05: مهام Celery Beat بدون Retry عند الفشل

**المشكلة:**
`daily_reflections`, `weekly_insights`, `monthly_insights` تفشل بصمت — لا retry، لا تسجيل للفشل.

```python
# [FILE: apps/insights/tasks.py]
# [ACTION: عدّل كل task للـ insights بنفس النمط]

@shared_task(bind=True, max_retries=3)
def generate_daily_reflection(self, user_id: int, date_str: str):
    try:
        # ... الكود الموجود ...
        pass
    except Exception as exc:
        logger.error(f"Daily reflection failed for user {user_id}: {exc}")
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
        # retry بعد 1 دقيقة، ثم 2، ثم 3

@shared_task(bind=True, max_retries=3)
def generate_weekly_insight(self, user_id: int, week_start: str):
    try:
        pass
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120 * (self.request.retries + 1))

@shared_task(bind=True, max_retries=3)
def generate_monthly_insight(self, user_id: int, month: int, year: int):
    try:
        pass
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300 * (self.request.retries + 1))
```

```python
# [FILE: apps/insights/management/commands/regenerate_insights.py]
# [ACTION: أنشئ هذا الـ Management Command]

from django.core.management.base import BaseCommand
from datetime import date, timedelta

class Command(BaseCommand):
    help = 'يعيد إنشاء الـ insights لفترة محددة'

    def add_arguments(self, parser):
        parser.add_argument('--type',  choices=['daily','weekly','monthly'], required=True)
        parser.add_argument('--days',  type=int, default=7)
        parser.add_argument('--user',  type=int, help='user_id محدد (اختياري)')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from apps.insights.tasks import (
            generate_daily_reflection,
            generate_weekly_insight,
            generate_monthly_insight
        )
        User = get_user_model()
        users = User.objects.filter(pk=options['user']) if options['user'] \
                else User.objects.all()

        today = date.today()
        count = 0

        for user in users:
            if options['type'] == 'daily':
                for i in range(options['days']):
                    d = today - timedelta(days=i)
                    generate_daily_reflection.delay(user.id, str(d))
                    count += 1
            elif options['type'] == 'weekly':
                for i in range(options['days'] // 7 + 1):
                    week = today - timedelta(weeks=i)
                    week_start = week - timedelta(days=week.weekday())
                    generate_weekly_insight.delay(user.id, str(week_start))
                    count += 1
            elif options['type'] == 'monthly':
                generate_monthly_insight.delay(user.id, today.month, today.year)
                count += 1

        self.stdout.write(f'تم جدولة {count} مهمة')

# الاستخدام:
# python manage.py regenerate_insights --type daily --days 7
# python manage.py regenerate_insights --type weekly --days 14
```

---

## 🟡 التحسينات (أداء وجودة)

---

### IMP-01: فهارس قاعدة البيانات المفقودة

```python
# [FILE: apps/entries/models.py]
# [ACTION: عدّل Meta في Entry]

class Meta:
    ordering = ['-created_at']
    indexes = [
        models.Index(fields=['user', 'created_at']),
        models.Index(fields=['user', 'created_at', 'processing_status']),
        models.Index(fields=['user', 'parent']),
        models.Index(fields=['user', 'processing_status']),
        # فهرس مركّب لاستعلام "أحداث اليوم" الشائع
        models.Index(
            fields=['user', 'created_at'],
            name='entries_user_date_idx'
        ),
    ]

# [ACTION: عدّل Meta في Metric]
class Meta:
    indexes = [
        models.Index(fields=['user', 'definition', 'recorded_at']),
        models.Index(fields=['user', 'recorded_at']),
        # فهرس لاستعلامات الـ baseline الأسبوعية
        models.Index(
            fields=['user', 'definition', 'recorded_at'],
            name='metrics_user_def_date_idx'
        ),
    ]
```

```python
# [ACTION: أنشئ migration]
python manage.py makemigrations entries --name="add_performance_indexes"
python manage.py migrate
```

---

### IMP-02: select_related و prefetch_related للاستعلامات المتكررة

```python
# [FILE: apps/entries/views.py]
# [ACTION: عدّل get_queryset في EntryViewSet]

class EntryViewSet(UserScopedViewSet):
    def get_queryset(self):
        return Entry.objects.filter(
            user=self.request.user
        ).prefetch_related(
            'children',
            'metrics__definition',
        ).select_related('parent')
```

---

### IMP-03: Swagger / OpenAPI Documentation

```python
# [FILE: requirements.txt]
# [ACTION: أضف]
drf-spectacular==0.27.2
```

```python
# [FILE: config/settings/base.py]
# [ACTION: أضف في INSTALLED_APPS]
'drf_spectacular',

# [ACTION: أضف في REST_FRAMEWORK]
REST_FRAMEWORK = {
    ...
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'المرايا API',
    'DESCRIPTION': 'نظام التسجيل اليومي وتحليل الأنماط السلوكية',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}
```

```python
# [FILE: config/urls.py]
# [ACTION: أضف]
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns += [
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/',   SpectacularSwaggerView.as_view(url_name='schema')),
    # افتح http://localhost:8000/api/docs/ لرؤية التوثيق
]
```

---

### IMP-04: تحسين الـ LLM Prompts (تقليل الـ tokens)

```python
# [FILE: apps/entries/ai.py]
# [ACTION: استبدل EXTRACTION_SYSTEM]

# قبل (طويل جداً):
EXTRACTION_SYSTEM = """أنت مساعد استخراج بيانات. دورك استخراج معلومات منظمة..."""

# بعد (مضغوط، نفس النتيجة):
EXTRACTION_SYSTEM = """استخرج بيانات منظمة من نص يومي. أجب فقط بـ JSON. لا تخترع معلومات."""

# [ACTION: في EXTRACTION_USER، قلّل أمثلة الـ metrics]
# حذف الأمثلة المطوّلة من الـ prompt — الـ definitions نفسها كافية
# قبل: 30 سطر من الشرح
# بعد: الـ definitions فقط + قاعدتان أساسيتان

EXTRACTION_USER_OPTIMIZED = """
النص: {text}

Metrics المعرّفة (استخدم الاسم الرسمي أو is_new:true للجديد):
{metrics_definitions}

تاجز آخر 14 يوم: {recent_tags}

أجب بـ JSON:
{{
  "metrics": [{{"name":str,"value":float,"unit":str,"is_new":bool}}],
  "mood_score": float,  // 1-5
  "tags": [str],        // أحداث/مشاعر فقط، ليس العادات
  "entry_type": "routine|event|reflection",
  "entities": {{"أشخاص":[],"مشاريع":[],"أماكن":[]}},
  "reflection": str,    // جملة وصفية واحدة
  "is_open_event": bool
}}
"""
# توفير ~40% من الـ tokens مقارنة بالـ prompt الأصلي
```

---

### IMP-05: تصدير بصيغ متعددة (JSON + CSV)

```python
# [FILE: apps/export_app/views.py]
# [ACTION: أضف هذه الـ Views]

import csv, json
from io import StringIO
from django.http import HttpResponse

class ExportJSONView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from_date = request.data.get('from_date')
        to_date   = request.data.get('to_date')

        entries = Entry.objects.filter(
            user=request.user,
            created_at__date__gte=from_date,
            created_at__date__lte=to_date
        ).order_by('created_at').prefetch_related('metrics__definition')

        data = [{
            'id':           e.id,
            'text':         e.text,
            'created_at':   e.created_at.isoformat(),
            'mood_score':   e.mood_score,
            'tags':         e.tags,
            'entry_type':   e.entry_type,
            'entities':     e.entities,
            'ai_reflection':e.ai_reflection,
            'is_open_event':e.is_open_event,
            'parent_id':    e.parent_id,
            'metrics': [{
                'name':  m.definition.name,
                'value': m.value,
                'unit':  m.definition.unit,
            } for m in e.metrics.all()],
        } for e in entries]

        return Response({
            'filename': f"maraya_{from_date}_to_{to_date}.json",
            'data': data,
            'count': len(data),
        })


class ExportCSVView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from_date = request.data.get('from_date')
        to_date   = request.data.get('to_date')

        entries = Entry.objects.filter(
            user=request.user,
            created_at__date__gte=from_date,
            created_at__date__lte=to_date
        ).order_by('created_at')

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'التاريخ', 'الوقت', 'النص', 'المزاج',
            'التصنيفات', 'النوع', 'حدث مفتوح', 'الانعكاس'
        ])

        for e in entries:
            writer.writerow([
                e.created_at.strftime('%Y-%m-%d'),
                e.created_at.strftime('%H:%M'),
                e.text,
                e.mood_score or '',
                ', '.join(e.tags),
                e.entry_type,
                'نعم' if e.is_open_event else 'لا',
                e.ai_reflection,
            ])

        response = HttpResponse(
            output.getvalue().encode('utf-8-sig'),  # utf-8-sig لدعم Excel
            content_type='text/csv; charset=utf-8-sig'
        )
        response['Content-Disposition'] = \
            f'attachment; filename="maraya_{from_date}_to_{to_date}.csv"'
        return response
```

```python
# [FILE: config/urls.py]
# [ACTION: أضف]
path('api/v1/export/json/', ExportJSONView.as_view()),
path('api/v1/export/csv/',  ExportCSVView.as_view()),
```

```jsx
// [FILE: src/pages/Settings.jsx]
// [ACTION: عدّل Export Modal لإضافة خيار الصيغة]

const [exportFormat, setExportFormat] = useState('markdown')

// في الـ modal:
<div style={{display:'flex', gap:8, margin:'12px 0'}}>
  {['markdown','json','csv'].map(fmt => (
    <button key={fmt} onClick={() => setExportFormat(fmt)} style={{
      padding:'6px 14px', borderRadius:'var(--radius-pill)',
      border:`1px solid ${exportFormat===fmt ? 'var(--primary)':'var(--border)'}`,
      background: exportFormat===fmt ? 'rgba(46,117,182,0.15)':'var(--bg-surface)',
      color: exportFormat===fmt ? 'var(--primary)':'var(--text-secondary)',
      cursor:'pointer', fontSize:13,
    }}>
      {fmt.toUpperCase()}
    </button>
  ))}
</div>

// في handleExport:
const endpoints = {
  markdown: '/export/markdown/',
  json:     '/export/json/',
  csv:      '/export/csv/',
}
const { data } = await api.post(endpoints[exportFormat], { from_date, to_date })

if (exportFormat === 'csv') {
  // CSV: download مباشر من الـ response header
  window.location.href = `${api.defaults.baseURL}/export/csv/`
} else {
  const blob = new Blob(
    [exportFormat === 'json' ? JSON.stringify(data.data, null, 2) : data.content],
    { type: exportFormat === 'json' ? 'application/json' : 'text/markdown' }
  )
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = data.filename
  a.click()
  URL.revokeObjectURL(url)
}
```

---

### IMP-06: Sentry للـ Error Monitoring

```python
# [FILE: requirements.txt]
# [ACTION: أضف]
sentry-sdk[django]==2.8.0
```

```python
# [FILE: config/settings/base.py]
# [ACTION: أضف في أول الملف]

import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.celery import CeleryIntegration

sentry_sdk.init(
    dsn=env('SENTRY_DSN', default=''),  # فارغ في dev = معطّل
    integrations=[DjangoIntegration(), CeleryIntegration()],
    traces_sample_rate=0.2,
    send_default_pii=False,  # خصوصية — لا نرسل بيانات شخصية
    environment=env('DJANGO_ENV', default='development'),
)
```

```bash
# [FILE: .env.example]
# [ACTION: أضف]
SENTRY_DSN=   # اتركه فارغاً في dev، أضف DSN من sentry.io في prod
DJANGO_ENV=development
```

---

## ملخص التغييرات المطلوبة

| # | الأولوية | الملف | نوع التغيير |
|---|---|---|---|
| BUG-01 | 🔴 | models.py + tasks.py | جدول جديد + منطق جديد |
| BUG-02 | 🔴 | accounts/views.py + urls.py + Settings.jsx | View جديد |
| BUG-03 | 🟠 | useCounter.js + MetricCard.jsx | تعديل |
| BUG-04 | 🟠 | polling.js + EntryCard.jsx + views.py | إضافة + تعديل |
| BUG-05 | 🟠 | insights/tasks.py + management command | تعديل + ملف جديد |
| IMP-01 | 🟡 | entries/models.py | إضافة فهارس |
| IMP-02 | 🟡 | entries/views.py | تحسين queries |
| IMP-03 | 🟡 | requirements + settings + urls | إضافة |
| IMP-04 | 🟡 | ai.py | تعديل prompts |
| IMP-05 | 🟡 | export_app/views.py + Settings.jsx | إضافة |
| IMP-06 | 🟡 | settings + requirements | إضافة |

## ترتيب التنفيذ للـ Agent

```
1. BUG-01: makemigrations + migrate (يحتاج restart)
2. BUG-02: View + URL + Frontend
3. BUG-03 + BUG-04: Frontend فقط (بدون restart backend)
4. BUG-05: tasks.py + management command
5. IMP-01: makemigrations + migrate
6. IMP-02: views.py فقط
7. IMP-03: pip install + settings + urls
8. IMP-04: ai.py فقط
9. IMP-05: views.py + urls + Frontend
10. IMP-06: pip install + settings
```
