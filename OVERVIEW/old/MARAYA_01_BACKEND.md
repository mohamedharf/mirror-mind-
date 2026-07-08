# المرايا — مواصفات الباك إند الكاملة
> نسخة موحدة نهائية. تتضمن كل القرارات من جلسات التصميم بما فيها إصلاحات الأمان وتحديثات الـ Metrics. لا تحتاج لملفات أخرى مرجعية للباك إند.

---

## 1. Stack

| المكوّن | الاختيار | الإصدار |
|---|---|---|
| Framework | Django | 4.2.16 |
| API | Django REST Framework | 3.15.2 |
| Auth | django-allauth + dj-rest-auth | 65.3.0 + 7.0.1 |
| JWT | djangorestframework-simplejwt | 5.5.1 |
| Task Queue | Celery | 5.4.0 |
| Broker | Redis | 7 (docker) |
| Beat | django-celery-beat | 2.7.0 |
| STT | faster-whisper | 1.1.0 |
| LLM | google-generativeai | 0.8.3 |
| DB dev | SQLite | - |
| DB prod | PostgreSQL | 16 |

---

## 2. هيكل المشروع

```
maraya/
├── manage.py
├── requirements.txt
├── .env
├── Dockerfile.backend
├── docker-compose.yml
├── config/
│   ├── __init__.py
│   ├── settings/
│   │   ├── base.py
│   │   ├── dev.py
│   │   └── prod.py
│   ├── urls.py
│   ├── celery.py
│   └── wsgi.py
└── apps/
    ├── accounts/
    │   ├── models.py      # User profile extension
    │   └── views.py       # OAuth callback + JWT issue
    ├── entries/
    │   ├── models.py      # Entry + MetricDefinition + Metric + MetricBaseline
    │   ├── serializers.py
    │   ├── views.py
    │   ├── tasks.py       # Celery extraction + analysis tasks
    │   └── urls.py
    ├── insights/
    │   ├── models.py      # DailyReflection + WeeklyInsight + MonthlyInsight
    │   ├── views.py
    │   ├── tasks.py
    │   └── urls.py
    ├── audio/
    │   ├── stt.py         # faster-whisper singleton
    │   └── views.py       # TranscribeView (sync — لا Celery)
    └── export_app/        # ⚠️ اسمها export_app لأن export كلمة محجوزة في Python
        └── views.py
```

---

## 3. قاعدة البيانات — Schema الكامل

### 3.1 جدول `entries`

```python
class Entry(models.Model):
    # ── علاقات ────────────────────────────────────
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='entries'
    )
    parent = models.ForeignKey(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='children'
    )
    # ⚠️ max depth = 1: parent نفسه يجب أن يكون parent_id=null
    # validation في serializer — انظر قسم 7

    # ── المحتوى ───────────────────────────────────
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── بيانات LLM ────────────────────────────────
    mood_score = models.FloatField(null=True, blank=True)
    # 1.0 (سلبي جداً) → 5.0 (إيجابي جداً)

    tags = models.JSONField(default=list)
    # أحداث ومشاعر فقط — ليس العادات الكمية (دي في Metric)
    # مثال: ["اجتماع", "توتر", "إنجاز"]

    entities = models.JSONField(default=dict)
    # {"أشخاص": [], "مشاريع": [], "أماكن": []}

    ai_reflection = models.TextField(blank=True)
    # جملة وصفية واحدة — تظهر فور الحفظ

    entry_type = models.CharField(
        max_length=15,
        choices=[
            ('routine',    'اعتيادي متكرر'),
            ('event',      'حدث طارئ'),
            ('reflection', 'تأمل'),
        ],
        default='event'
    )

    is_open_event = models.BooleanField(default=False)
    # True = حدث بدأ ولم يكتمل

    processing_status = models.CharField(
        max_length=15,
        choices=[
            ('pending',      'Pending'),
            ('processing',   'Processing'),
            ('done',         'Done'),
            ('failed',       'Failed'),
            ('rate_limited', 'Rate Limited'),
        ],
        default='pending'
    )
    # الـ frontend يعمل polling حتى status == 'done'

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['user', 'parent']),
            models.Index(fields=['user', 'processing_status']),
        ]
```

---

### 3.2 جدول `metric_definitions`

```python
class MetricDefinition(models.Model):
    """
    تعريفات الكميات القابلة للقياس.
    هجين: system (seed + promoted) + user-generated (pending)
    """
    name = models.CharField(max_length=50, unique=True)
    # الاسم الرسمي — لا يتغير بعد الإنشاء: "سجاير" | "قهوة" | "نوم"

    unit = models.CharField(max_length=20)
    # "سيجارة" | "كوب" | "ساعة" | "لتر" | "دقيقة" | "وجبة"

    category = models.CharField(
        max_length=15,
        choices=[
            ('health',    'صحة'),
            ('habit',     'عادة'),
            ('activity',  'نشاط'),
            ('nutrition', 'تغذية'),
        ]
    )

    aliases = models.JSONField(default=list)
    # الـ LLM يستخدمها للتعرف على نفس الـ metric بأسماء مختلفة
    # مثال: ["سجارة", "دخان", "تدخين"]
    # يُضاف alias جديد هنا بدل إنشاء definition مكررة

    is_system = models.BooleanField(default=False)
    # True = متاح لكل المستخدمين (seed أو promoted)
    # False = local فقط، pending promotion

    suggested_by_count = models.IntegerField(default=0)
    # يتزايد كل مرة يستخرج مستخدم مختلف نفس الـ metric
    # عند الوصول لـ PROMOTION_THRESHOLD (=3) → is_system يصبح True

    promoted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
```

**Seed Data — يُشغَّل في migration:**
```python
SYSTEM_METRICS = [
    {"name":"سجاير",  "unit":"سيجارة", "category":"habit",     "aliases":["سجارة","دخان","تدخين"]},
    {"name":"قهوة",   "unit":"كوب",    "category":"habit",     "aliases":["فنجان","اسبريسو","كباية قهوة"]},
    {"name":"نوم",    "unit":"ساعة",   "category":"health",    "aliases":["نمت","صحيت","ساعات نوم"]},
    {"name":"ماء",    "unit":"لتر",    "category":"nutrition", "aliases":["مية","شربت مية","كوباية مية"]},
    {"name":"رياضة",  "unit":"دقيقة",  "category":"activity",  "aliases":["جري","جيم","تمرين","مشي"]},
    {"name":"أكل",    "unit":"وجبة",   "category":"nutrition", "aliases":["غدا","غداء","عشا","فطار","فطور"]},
    {"name":"شاي",    "unit":"كوب",    "category":"habit",     "aliases":["كباية شاي","شاي أخضر"]},
    {"name":"دواء",   "unit":"جرعة",   "category":"health",    "aliases":["حبة","علاج","دوا","أقراص"]},
]
```

---

### 3.3 جدول `metrics`

```python
class Metric(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='metrics'
    )
    entry = models.ForeignKey(
        Entry,
        on_delete=models.CASCADE,
        related_name='metrics'
    )
    definition = models.ForeignKey(
        MetricDefinition,
        on_delete=models.PROTECT,
        related_name='measurements'
    )
    value = models.FloatField()
    recorded_at = models.DateTimeField()
    # = entry.created_at في الغالب

    class Meta:
        indexes = [
            models.Index(fields=['user', 'definition', 'recorded_at']),
            models.Index(fields=['user', 'recorded_at']),
        ]
```

---

### 3.4 جدول `metric_baselines`

```python
class MetricBaseline(models.Model):
    """
    المعدل الطبيعي للمستخدم — يُحسب SQL كل أحد من آخر 30 يوم.
    صفر LLM.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='baselines'
    )
    definition = models.ForeignKey(
        MetricDefinition,
        on_delete=models.CASCADE,
        related_name='baselines'
    )
    daily_avg = models.FloatField()
    daily_min = models.FloatField()
    daily_max = models.FloatField()
    sample_days = models.IntegerField()
    last_updated = models.DateField(auto_now=True)

    class Meta:
        unique_together = [['user', 'definition']]
```

---

### 3.5 جدول `daily_reflections`

```python
class DailyReflection(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    date = models.DateField()
    avg_mood = models.FloatField(null=True)
    top_tags = models.JSONField(default=list)
    tag_alerts = models.JSONField(default=list)
    # [{"tag":"توتر","count":4,"days":14,"message":"..."}]
    summary = models.TextField(blank=True)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['user', 'date']]
```

---

### 3.6 جدول `weekly_insights`

```python
class WeeklyInsight(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    week_start = models.DateField()  # دائماً الأحد
    mood_trend = models.JSONField(default=list)   # [3.2, 2.8, ...] 7 قيم
    mood_avg = models.FloatField(null=True)
    top_tags = models.JSONField(default=list)
    # [{"tag":"شغل","count":8}, ...]
    patterns = models.JSONField(default=list)
    metrics_summary = models.JSONField(default=dict)
    # {"سجاير":{"avg":14.6,"baseline":15,"trend":[12,15,18,...]}}
    entry_count = models.IntegerField(default=0)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['user', 'week_start']]
```

---

### 3.7 جدول `monthly_insights`

```python
class MonthlyInsight(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    month = models.IntegerField()
    year = models.IntegerField()
    mood_avg = models.FloatField(null=True)
    mood_trend = models.JSONField(default=list)
    top_tags = models.JSONField(default=list)
    patterns = models.JSONField(default=list)
    suggestions = models.JSONField(default=list)
    prev_month_comparison = models.JSONField(default=dict)
    # {"mood_change":+0.4,"new_tags":["رياضة"],"dropped_tags":["قلق"]}
    entry_count = models.IntegerField(default=0)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['user', 'month', 'year']]
```

---

## 4. الأمان — UserScopedViewSet (إلزامي)

```python
# apps/entries/views.py (و كل ViewSet آخر)

class UserScopedViewSet(viewsets.ModelViewSet):
    """
    Base class إلزامي لكل ViewSets في المشروع.
    يضمن أن كل query مقيد بـ user=request.user.
    يمنع تسريب بيانات مستخدم لمستخدم آخر حتى لو نُسي filter في مكان ما.
    """
    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# كل ViewSet يرث:
class EntryViewSet(UserScopedViewSet):
    queryset = Entry.objects.all()
    serializer_class = EntrySerializer

class MetricViewSet(UserScopedViewSet):
    queryset = Metric.objects.all()
    # ...
```

---

## 5. المصادقة — Google OAuth + JWT

### 5.1 الإعداد

```python
# settings/base.py
INSTALLED_APPS = [
    ...
    'django.contrib.sites',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
    'dj_rest_auth',
    'dj_rest_auth.registration',
]

MIDDLEWARE = [
    ...
    'allauth.account.middleware.AccountMiddleware',  # ⚠️ إلزامي
]

SITE_ID = 1
ACCOUNT_EMAIL_VERIFICATION = 'none'

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
        'APP': {
            'client_id': env('GOOGLE_CLIENT_ID'),
            'secret':    env('GOOGLE_CLIENT_SECRET'),
            'key': ''
        }
    }
}
```

### 5.2 JWT بعد OAuth — عبر URL Fragment (آمن)

```python
# apps/accounts/views.py
class GoogleOAuthSuccessView(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return redirect(f"{settings.FRONTEND_URL}/login?error=auth_failed")

        refresh = RefreshToken.for_user(request.user)

        # ✅ Fragment (#) لا query param (?)
        # Fragment لا يُرسَل للسيرفر ولا يُسجَّل في access logs
        return redirect(
            f"{settings.FRONTEND_URL}/auth/callback"
            f"#access={str(refresh.access_token)}"
            f"&refresh={str(refresh)}"
        )
```

---

## 6. API Endpoints

**Base URL:** `/api/v1/`
**Auth:** كل endpoint يتطلب `Authorization: Bearer <token>` ما عدا `/auth/`
**CORS:** يجب إضافة `http://localhost:5173` في `CORS_ALLOWED_ORIGINS`

---

### 6.1 Auth

| Method | Endpoint | الوصف |
|---|---|---|
| GET | `/auth/google/` | بدء Google OAuth |
| GET | `/auth/success/` | callback → JWT في fragment |
| POST | `/auth/token/refresh/` | تجديد access token |
| POST | `/auth/logout/` | إلغاء token |

---

### 6.2 Entries

#### `POST /entries/`
```json
// Request
{"text": "شربت 3 كبايات قهوة واتعملت اجتماع مفاجئ", "parent_id": null}

// Response فوري (قبل LLM)
{
  "id": 42,
  "text": "...",
  "created_at": "2026-07-02T10:30:00Z",
  "parent_id": null,
  "mood_score": null,
  "tags": [],
  "metrics": [],
  "ai_reflection": "",
  "entry_type": "event",
  "is_open_event": false,
  "processing_status": "pending"
}
// الـ frontend يعمل polling على GET /entries/42/ حتى processing_status == "done"
```

#### `GET /entries/`
Query params: `date`, `month`, `year`, `search`, `page`, `page_size`

```json
{
  "count": 45,
  "next": "...",
  "results": [
    {
      "id": 42,
      "text": "...",
      "created_at": "...",
      "mood_score": 2.5,
      "tags": ["اجتماع", "توتر"],
      "entry_type": "event",
      "is_open_event": false,
      "processing_status": "done",
      "parent_id": null,
      "children": [
        {
          "id": 43,
          "text": "...",
          "created_at": "...",
          "mood_score": 3.1,
          "tags": ["شغل"],
          "children_count": 0
        }
      ]
    }
  ]
}
```

#### `GET /entries/today/`
```json
{
  "entries": [...],   // مرتبة تصاعدياً (الأقدم أولاً)
  "total_today": 5,
  "show_more": false  // true لو أكثر من 5
}
```

#### `DELETE /entries/{id}/`
لو للـ entry أبناء: يُحذف هو فقط، الأبناء تصبح `parent_id=null`

---

### 6.3 Metrics

#### `GET /metrics/today/`
```json
{
  "date": "2026-07-02",
  "metrics": [
    {
      "name": "سجاير",
      "unit": "سيجارة",
      "today_total": 12.0,
      "baseline_avg": 15.0,
      "deviation_pct": -20.0,
      "direction": "down",
      "lower_is_better": true,
      "label": "أقل من المعتاد ↓"
    },
    {
      "name": "قهوة",
      "unit": "كوب",
      "today_total": 2.0,
      "baseline_avg": 2.1,
      "deviation_pct": -4.8,
      "direction": "normal",
      "lower_is_better": false,
      "label": "طبيعي"
    }
  ]
}
```

**منطق `direction`:**
```python
LOWER_IS_BETTER = {'سجاير', 'دواء'}

def get_direction(name, deviation_pct):
    if deviation_pct is None: return "no_baseline"
    if abs(deviation_pct) <= 20: return "normal"
    return "up" if deviation_pct > 0 else "down"

def get_label(name, direction, deviation_pct):
    lib = name in LOWER_IS_BETTER
    labels = {
        "no_baseline": "جارٍ حساب معدلك...",
        "normal":      "طبيعي",
        "up":   "أعلى من المعتاد ↑" if not lib else "أكثر من المعتاد ↑",
        "down": "أقل من المعتاد ↓"  if not lib else "أقل من المعتاد ↓ ✓",
    }
    return labels.get(direction, "")
```

#### `GET /metrics/history/?name=سجاير&days=30`
```json
{
  "name": "سجاير",
  "unit": "سيجارة",
  "baseline_avg": 15.0,
  "data": [
    {"date": "2026-07-01", "value": 12.0},
    {"date": "2026-07-02", "value": 18.0}
  ]
}
```

#### `GET /metrics/definitions/`
```json
{
  "system": [
    {"name": "سجاير", "unit": "سيجارة", "category": "habit"}
  ],
  "user_pending": [
    {"name": "ميلاتونين", "unit": "ملغ", "suggested_by_count": 1}
  ]
}
```

---

### 6.4 Insights

#### `GET /insights/daily/?date=YYYY-MM-DD`
#### `GET /insights/weekly/?week_start=YYYY-MM-DD`
#### `GET /insights/monthly/?month=YYYY-MM`

(انظر MARAYA_03_AI_LOGIC.md للـ response format الكامل)

---

### 6.5 Audio

#### `POST /audio/transcribe/`
```
Content-Type: multipart/form-data
audio: <file>  // WebM | MP4 | WAV — max 10MB — max 60 ثانية
```
```json
{
  "text": "شربت 3 كبايات قهوة...",
  "language": "ar",
  "confidence": 0.87
}
// لو confidence < 0.7: الـ frontend يُظهر تحذير "راجع النص قبل الحفظ"
```

---

### 6.6 Export

#### `POST /export/markdown/`
```json
// Request
{"from_date": "2026-06-01", "to_date": "2026-06-30"}

// Response
{
  "filename": "maraya_2026-06-01_to_2026-06-30.md",
  "content": "# سجل المرايا\n..."
}
```

---

## 7. Serializers — Validation مهمة

### Thread Depth Validation (max = 1)

```python
class EntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Entry
        fields = '__all__'
        read_only_fields = ['user', 'processing_status', 'mood_score',
                            'tags', 'entities', 'ai_reflection',
                            'entry_type', 'is_open_event']

    def validate_parent(self, parent):
        if parent is None:
            return parent
        # منع depth > 1
        if parent.parent_id is not None:
            raise serializers.ValidationError(
                "لا يمكن الربط بإدخال هو نفسه تابع لإدخال آخر. "
                "الحد الأقصى لعمق التسلسل هو مستوى واحد."
            )
        # منع الربط بإدخال من مستخدم آخر (حماية إضافية)
        request = self.context.get('request')
        if request and parent.user_id != request.user.id:
            raise serializers.ValidationError("إدخال غير موجود.")
        return parent
```

---

## 8. Celery Tasks

### 8.1 extract_entry_data — يُستدعى فور حفظ Entry

```python
@shared_task(bind=True, max_retries=3)
def extract_entry_data(self, entry_id: int):
    from google.api_core import exceptions as google_exceptions

    try:
        entry = Entry.objects.get(id=entry_id)
        entry.processing_status = 'processing'
        entry.save(update_fields=['processing_status'])

        # بناء قائمة الـ metrics للـ prompt
        metrics_defs = MetricDefinition.objects.filter(
            models.Q(is_system=True) | models.Q(suggested_by_count__gte=1)
        ).values('name', 'unit', 'aliases')

        metrics_text = "\n".join(
            f"{m['name']} | {m['unit']} | {', '.join(m['aliases'])}"
            for m in metrics_defs
        )
        recent_tags = get_recent_tags(entry.user, days=14)

        result = safe_gemini_call(
            prompt=build_extraction_prompt(entry.text, metrics_text, recent_tags),
            system=EXTRACTION_SYSTEM_PROMPT,
            default=EXTRACTION_DEFAULT
        )

        # ── حفظ بيانات Entry ──────────────────────
        entry.mood_score        = max(1.0, min(5.0, float(result.get('mood_score', 3.0))))
        entry.tags              = result.get('tags', [])[:5]
        entry.entities          = result.get('entities', {})
        entry.ai_reflection     = result.get('reflection', '')[:300]
        entry.entry_type        = result.get('entry_type', 'event')
        entry.is_open_event     = result.get('is_open_event', False)
        entry.processing_status = 'done'
        entry.save()

        # ── معالجة Metrics ────────────────────────
        for m in result.get('metrics', []):
            name  = str(m.get('name', '')).strip()
            value = float(m.get('value', 0))
            unit  = str(m.get('unit', '')).strip()
            is_new = bool(m.get('is_new', False))
            if not name or value <= 0:
                continue
            if is_new:
                _process_new_metric(name, unit)
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
                pass

        check_tag_alerts.delay(entry.user_id, entry.tags)

    except google_exceptions.ResourceExhausted:
        entry.processing_status = 'rate_limited'
        entry.save(update_fields=['processing_status'])

    except Entry.DoesNotExist:
        pass

    except Exception as exc:
        if self.request.retries >= self.max_retries:
            entry.processing_status = 'failed'
            entry.save(update_fields=['processing_status'])
        raise self.retry(exc=exc, countdown=30)


PROMOTION_THRESHOLD = 3

def _process_new_metric(name: str, unit: str):
    definition, created = MetricDefinition.objects.get_or_create(
        name=name,
        defaults={'unit': unit, 'category': 'habit',
                  'is_system': False, 'suggested_by_count': 1}
    )
    if not created:
        MetricDefinition.objects.filter(pk=definition.pk).update(
            suggested_by_count=models.F('suggested_by_count') + 1
        )
        definition.refresh_from_db()
        if definition.suggested_by_count >= PROMOTION_THRESHOLD and not definition.is_system:
            definition.is_system = True
            definition.promoted_at = now()
            definition.save(update_fields=['is_system', 'promoted_at'])
```

---

### 8.2 Management Command — إعادة معالجة الـ entries الفاشلة

```python
# apps/entries/management/commands/reprocess_pending.py
class Command(BaseCommand):
    help = 'يعيد معالجة الـ entries التي فشل تحليلها'

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
        self.stdout.write(f"تمت إعادة معالجة {count} entry")
```

---

### 8.3 Celery Beat Schedule

```python
# config/celery.py
CELERY_BEAT_SCHEDULE = {
    'daily-reflections': {
        'task': 'apps.insights.tasks.run_daily_reflections',
        'schedule': crontab(hour=23, minute=50),
    },
    'weekly-insights': {
        'task': 'apps.insights.tasks.run_weekly_insights',
        'schedule': crontab(hour=0, minute=30, day_of_week='sun'),
    },
    'monthly-insights': {
        'task': 'apps.insights.tasks.run_monthly_insights',
        'schedule': crontab(hour=1, minute=0, day_of_month=1),
    },
    'update-baselines': {
        'task': 'apps.entries.tasks.update_metric_baselines',
        'schedule': crontab(hour=1, minute=30, day_of_week='sun'),
    },
    'reprocess-stuck': {
        'task': 'apps.entries.tasks.reprocess_stuck_entries',
        'schedule': crontab(minute=0),  # كل ساعة
    },
}
```

---

## 9. faster-whisper — STT (Sync فقط)

```python
# apps/audio/stt.py
# ⚠️ تحذير: faster-whisper يتعلق داخل Celery (bug موثق issue#907)
# الحل: sync مباشرة في الـ view — لا Celery task

from faster_whisper import WhisperModel
import os

_model = None

def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            model_size_or_path=os.environ.get('WHISPER_MODEL_SIZE', 'large-v3'),
            device=os.environ.get('WHISPER_DEVICE', 'cpu'),
            compute_type="int8",
            num_workers=1,               # ⚠️ إلزامي لتجنب hang
            download_root="/app/whisper_models"
        )
    return _model


def transcribe(audio_path: str) -> dict:
    model = get_model()
    segments, info = model.transcribe(
        audio_path,
        language="ar",
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        word_timestamps=False,
    )
    segments_list = list(segments)
    if not segments_list:
        return {"text": "", "language": "ar", "confidence": 0.0}

    full_text = " ".join(s.text.strip() for s in segments_list)
    avg_logprob = sum(s.avg_logprob for s in segments_list) / len(segments_list)
    confidence = max(0.0, min(1.0, (avg_logprob + 2.0) / 1.5))

    return {
        "text": full_text.strip(),
        "language": info.language,
        "confidence": round(confidence, 2)
    }
```

```python
# apps/audio/views.py
class TranscribeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        audio_file = request.FILES.get('audio')
        if not audio_file:
            return Response({"error": "لم يُرسَل ملف صوتي"}, status=400)
        if audio_file.size > 10 * 1024 * 1024:
            return Response({"error": "الحجم تجاوز 10MB"}, status=400)

        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
            for chunk in audio_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        try:
            return Response(transcribe(tmp_path))
        finally:
            os.unlink(tmp_path)
```

---

## 10. إعداد Gunicorn (Production)

```bash
# ⚠️ single process إلزامي بسبب Whisper model في memory
# multi-process = N workers × ~3GB RAM = crash

gunicorn config.wsgi:application \
  --workers 1 \
  --threads 4 \
  --worker-class gthread \
  --bind 0.0.0.0:8000
```

---

## 11. Settings الأساسية

```python
# config/settings/base.py

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Vite dev
    env('FRONTEND_URL', default='http://localhost:3000'),
]
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
}
```

---

## 12. requirements.txt (مثبّت)

```
Django==4.2.16
djangorestframework==3.15.2
django-allauth==65.3.0
dj-rest-auth[with_social]==7.0.1
djangorestframework-simplejwt==5.5.1
django-cors-headers==4.4.0
django-environ==0.11.2
django-filter==24.3
celery==5.4.0
django-celery-beat==2.7.0
django-celery-results==2.5.1
redis==5.2.0
faster-whisper==1.1.0
google-generativeai==0.8.3
psycopg2-binary==2.9.10
```
