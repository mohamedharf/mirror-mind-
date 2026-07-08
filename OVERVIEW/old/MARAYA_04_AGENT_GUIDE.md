# المرايا — دليل التنفيذ للـ Agent
> اقرأ MARAYA_00_OVERVIEW.md أولاً، ثم هذا الملف. نفّذ المراحل بالترتيب المحدد. لا تتجاوز أي checkpoint.

---

## قبل البدء — التحقق من البيئة

```bash
python --version      # يجب 3.11.x
docker --version
docker compose version

docker compose up -d

docker compose exec redis redis-cli ping   # يجب: PONG
docker compose exec db psql -U maraya -c "\l"  # يجب: قاعدة بيانات maraya
```

**إذا فشل أي أمر: توقف. لا تكمل.**

---

## ترتيب التنفيذ

```
المرحلة 1: Django Project Structure
المرحلة 2: Models + Migrations + Seed
المرحلة 3: Google OAuth + JWT
المرحلة 4: UserScopedViewSet + Entries API
المرحلة 5: Audio STT (faster-whisper)
المرحلة 6: Metrics API
المرحلة 7: Celery Tasks (LLM extraction)
المرحلة 8: Insights API + Celery Beat
المرحلة 9: Export API
المرحلة 10: Frontend React
المرحلة 11: PWA + Integration test
```

---

## المرحلة 1 — Django Project Structure

```bash
django-admin startproject config .
python manage.py startapp accounts
python manage.py startapp entries
python manage.py startapp insights
python manage.py startapp audio
python manage.py startapp export_app  # ⚠️ مش "export" — كلمة محجوزة في Python
```

**أضف لـ INSTALLED_APPS:**
```python
'django.contrib.sites',
'allauth', 'allauth.account',
'allauth.socialaccount',
'allauth.socialaccount.providers.google',
'dj_rest_auth', 'dj_rest_auth.registration',
'rest_framework', 'rest_framework_simplejwt',
'corsheaders',
'django_celery_beat', 'django_celery_results',
'apps.accounts', 'apps.entries',
'apps.insights', 'apps.audio', 'apps.export_app',
```

**أضف لـ MIDDLEWARE (الترتيب مهم):**
```python
'corsheaders.middleware.CorsMiddleware',        # قبل CommonMiddleware
'django.middleware.common.CommonMiddleware',
...
'allauth.account.middleware.AccountMiddleware', # ⚠️ إلزامي لـ allauth 64+
```

### ✅ Checkpoint 1
```bash
python manage.py check
# يجب: System check identified no issues
```

---

## المرحلة 2 — Models + Migrations + Seed

**ترتيب إنشاء النماذج (إلزامي بسبب ForeignKeys):**
1. `entries/models.py` — MetricDefinition أولاً (لا FKs خارجية)
2. `entries/models.py` — Entry (self FK)
3. `entries/models.py` — Metric (FK → Entry + MetricDefinition)
4. `entries/models.py` — MetricBaseline (FK → MetricDefinition)
5. `insights/models.py` — DailyReflection, WeeklyInsight, MonthlyInsight

**انسخ النماذج حرفياً من MARAYA_01_BACKEND.md قسم 3.**

```bash
python manage.py makemigrations accounts
python manage.py makemigrations entries
python manage.py makemigrations insights
python manage.py migrate
```

**Seed الـ MetricDefinitions:**
```python
# شغّل في python manage.py shell
from apps.entries.models import MetricDefinition

SYSTEM_METRICS = [
    {"name":"سجاير",  "unit":"سيجارة", "category":"habit",
     "aliases":["سجارة","دخان","تدخين"], "is_system":True},
    {"name":"قهوة",   "unit":"كوب",    "category":"habit",
     "aliases":["فنجان","اسبريسو","كباية قهوة"], "is_system":True},
    {"name":"نوم",    "unit":"ساعة",   "category":"health",
     "aliases":["نمت","صحيت","ساعات نوم"], "is_system":True},
    {"name":"ماء",    "unit":"لتر",    "category":"nutrition",
     "aliases":["مية","شربت مية","كوباية مية"], "is_system":True},
    {"name":"رياضة",  "unit":"دقيقة",  "category":"activity",
     "aliases":["جري","جيم","تمرين","مشي"], "is_system":True},
    {"name":"أكل",    "unit":"وجبة",   "category":"nutrition",
     "aliases":["غدا","غداء","عشا","فطار","فطور"], "is_system":True},
    {"name":"شاي",    "unit":"كوب",    "category":"habit",
     "aliases":["كباية شاي","شاي أخضر"], "is_system":True},
    {"name":"دواء",   "unit":"جرعة",   "category":"health",
     "aliases":["حبة","علاج","دوا","أقراص"], "is_system":True},
]
for m in SYSTEM_METRICS:
    MetricDefinition.objects.get_or_create(name=m['name'], defaults=m)
print("Seed done:", MetricDefinition.objects.count(), "definitions")
```

### ✅ Checkpoint 2
```bash
python manage.py shell -c "
from apps.entries.models import MetricDefinition, Entry, Metric
print('MetricDefinitions:', MetricDefinition.objects.count())  # يجب: 8
"
```

---

## المرحلة 3 — Google OAuth + JWT

**أنشئ Google OAuth credentials:**
- اذهب لـ https://console.cloud.google.com/apis/credentials
- أنشئ OAuth 2.0 Client ID (Web application)
- Authorized redirect URI: `http://localhost:8000/accounts/google/login/callback/`

**تأكد من Site object:**
```bash
python manage.py shell -c "
from django.contrib.sites.models import Site
Site.objects.update_or_create(
    id=1,
    defaults={'domain':'localhost:8000','name':'localhost'}
)
print('Site OK')
"
```

**طريقة إرسال الـ token: URL Fragment (#) لا Query Param (?)**
انسخ `GoogleOAuthSuccessView` حرفياً من MARAYA_01_BACKEND.md قسم 5.2.

### ✅ Checkpoint 3
```bash
python manage.py runserver
# افتح: http://localhost:8000/accounts/google/login/
# يجب: redirect لصفحة Google
```

---

## المرحلة 4 — UserScopedViewSet + Entries API

**أنشئ UserScopedViewSet أولاً:**
```python
# apps/entries/views.py
# انسخ من MARAYA_01_BACKEND.md قسم 4 حرفياً
# كل ViewSet يرث منه — هذا غير قابل للتفاوض
```

**Thread depth validation في Serializer:**
```python
# انسخ EntrySerializer.validate_parent من MARAYA_01_BACKEND.md قسم 7 حرفياً
# يمنع parent depth > 1 ويمنع الربط بإدخال مستخدم آخر
```

**Celery stub مؤقت (قبل المرحلة 7):**
```python
# apps/entries/tasks.py
from celery import shared_task
@shared_task
def extract_entry_data(entry_id: int):
    pass  # stub — سيُكتمل في المرحلة 7
```

### ✅ Checkpoint 4
```bash
# احصل على token من OAuth أولاً
curl -X POST http://localhost:8000/api/v1/entries/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"تست أول إدخال","parent_id":null}'
# يجب: 201 مع id و processing_status: "pending"

# تجربة thread depth validation
# أنشئ entry ثانياً بـ parent_id = id الأول
# أنشئ entry تالتاً بـ parent_id = id التاني
# يجب: 400 ValidationError
```

---

## المرحلة 5 — Audio STT

**⚠️ قاعدة مطلقة: faster-whisper يعمل sync في الـ view فقط — لا Celery task**
(bug موثق: faster-whisper + Celery multiprocessing يسبب hang كامل)

```bash
# تحميل الموديل (مرة واحدة — يستغرق 5-10 دقائق)
python manage.py shell -c "
from apps.audio.stt import get_model
print('Loading...')
get_model()
print('Model loaded')
"
```

**انسخ `transcribe()` و `TranscribeView` حرفياً من MARAYA_01_BACKEND.md قسم 9.**

### ✅ Checkpoint 5
```bash
# سجّل ملف صوتي قصير باللغة العربية
curl -X POST http://localhost:8000/api/v1/audio/transcribe/ \
  -H "Authorization: Bearer TOKEN" \
  -F "audio=@test.wav"
# يجب: {"text":"...","language":"ar","confidence":0.xx}
```

---

## المرحلة 6 — Metrics API

**Views المطلوبة:**
- `TodayMetricsView` — يحسب بـ SQL بحت
- `MetricHistoryView` — تاريخ metric معين
- `MetricDefinitionsView` — قائمة التعريفات

**انسخ منطق `get_direction()` و `get_label()` و `LOWER_IS_BETTER` من MARAYA_01_BACKEND.md قسم 6.3 حرفياً.**

### ✅ Checkpoint 6
```bash
curl http://localhost:8000/api/v1/metrics/today/ \
  -H "Authorization: Bearer TOKEN"
# يجب: {"date":"...","metrics":[]} (فارغ لأنه لا توجد entries بعد)
```

---

## المرحلة 7 — Celery Tasks (LLM Extraction)

**شغّل Redis + Celery Worker:**
```bash
# Terminal 2
celery -A config worker --loglevel=info --concurrency=2

# Terminal 3
celery -A config beat --loglevel=info \
  --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

**استبدل الـ stub بالـ task الكامل:**
انسخ `extract_entry_data` و `_process_new_metric` حرفياً من MARAYA_01_BACKEND.md قسم 8.1.

**انسخ Prompts من MARAYA_03_AI_LOGIC.md قسم 3 حرفياً.**

**Management command لإعادة المعالجة:**
انسخ `reprocess_pending` من MARAYA_01_BACKEND.md قسم 8.2.

### ✅ Checkpoint 7
```bash
# أنشئ entry يحتوي metrics
curl -X POST http://localhost:8000/api/v1/entries/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"شربت 3 كبايات قهوة الصبح وسجرت 5 سجاير"}'

# انتظر 10 ثواني ثم تحقق
sleep 10
curl http://localhost:8000/api/v1/entries/ID/ -H "Authorization: Bearer TOKEN"
# يجب:
#   processing_status: "done"
#   mood_score: رقم
#   tags: قائمة

curl http://localhost:8000/api/v1/metrics/today/ -H "Authorization: Bearer TOKEN"
# يجب: metrics فيها قهوة=3 و سجاير=5
```

---

## المرحلة 8 — Insights API + Celery Beat

**Celery Beat Schedule:**
انسخ `CELERY_BEAT_SCHEDULE` الكامل من MARAYA_01_BACKEND.md قسم 8.3.

**انسخ Prompts الأسبوعي والشهري من MARAYA_03_AI_LOGIC.md أقسام 5 و 6.**

**⚠️ تحقق من missing weeks قبل التحليل الشهري:**
```python
# في generate_monthly_insight
missing = expected_weeks - WeeklyInsight.objects.filter(...).count()
if missing > 1:
    logger.warning(f"Monthly analysis: {missing} weeks missing")
```

### ✅ Checkpoint 8
```bash
# شغّل daily task يدوياً
python manage.py shell -c "
from apps.insights.tasks import generate_daily_reflection
from django.contrib.auth import get_user_model
user = get_user_model().objects.first()
from datetime import date
generate_daily_reflection(user.id, str(date.today()))
print('Done')
"

curl "http://localhost:8000/api/v1/insights/daily/?date=$(date +%Y-%m-%d)" \
  -H "Authorization: Bearer TOKEN"
# يجب: avg_mood, top_tags, summary
```

---

## المرحلة 9 — Export API

**انسخ `generate_markdown` من MARAYA_01_BACKEND.md.**

### ✅ Checkpoint 9
```bash
curl -X POST http://localhost:8000/api/v1/export/markdown/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"from_date":"2026-07-01","to_date":"2026-07-31"}'
# يجب: filename + content بتنسيق Markdown صحيح
```

---

## المرحلة 10 — Frontend React

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install axios zustand react-router-dom recharts
npm install -D tailwindcss postcss autoprefixer
npm install vite-plugin-pwa
npx tailwindcss init -p
```

**ترتيب بناء الـ Components:**
1. `src/lib/api.js` — انسخ من MARAYA_02_FRONTEND.md قسم 5 حرفياً
2. `src/lib/offlineQueue.js` — انسخ من MARAYA_02_FRONTEND.md قسم 6
3. `src/lib/polling.js` — انسخ من MARAYA_02_FRONTEND.md قسم 7
4. `src/store/authStore.js` + `entryStore.js` — انسخ من قسم 8
5. `src/pages/Login.jsx` — انسخ من قسم 9
6. `src/pages/AuthCallback.jsx` — انسخ من قسم 4
7. `src/pages/Home.jsx` — أهم شاشة، انسخ من أقسام 10
8. `src/pages/History.jsx` — قسم 11
9. `src/pages/Insights.jsx` — قسم 12
10. `src/pages/Settings.jsx` — قسم 13
11. `src/components/BottomNav.jsx`

**Design Tokens:**
انسخ CSS variables من MARAYA_02_FRONTEND.md قسم 2 في `src/index.css`.

### ✅ Checkpoint 10
```bash
cd frontend && npm run dev
# افتح http://localhost:5173
# اضغط "الدخول بحساب Google"
# يجب: redirect لـ Google ثم رجوع للـ Home screen
# اكتب "شربت قهوتين وسجرت 3 سجاير"
# اضغط حفظ
# يجب بعد 10 ثواني: reflection card يظهر + metrics cards تتحدث
```

---

## المرحلة 11 — PWA

```bash
cd frontend && npm run build
npx serve dist
# افتح في Chrome → DevTools → Application → Manifest
# يجب: كل بيانات الـ manifest موجودة + "Add to Home Screen" متاح
```

---

## الأخطاء الشائعة وحلولها

| الخطأ | السبب | الحل |
|---|---|---|
| `ImproperlyConfigured: allauth` | نسيان AccountMiddleware | أضفه في MIDDLEWARE قبل CommonMiddleware |
| `SITE_ID` error | Site غير موجود في DB | شغّل الأمر في Checkpoint 3 |
| Tokens في البروفايل | استخدام query param بدل fragment | تأكد من `#` في redirect URL |
| faster-whisper يتعلق | تشغيله كـ Celery task | شغّله sync مباشرة في الـ view |
| OOM crash في production | Gunicorn multi-workers × Whisper | `--workers 1 --threads 4` |
| Thread depth > 1 يُحفظ | نسيان validation | انسخ `validate_parent` من قسم 7 |
| Metrics لا تظهر | extract_entry_data stub | استبدل الـ stub بالـ task الكامل |
| Celery tasks لا تُنفَّذ | `autodiscover_tasks` ناقص | أضف في `config/celery.py` |
| CORS error | `CORS_ALLOWED_ORIGINS` ناقص | أضف `http://localhost:5173` |
| Gemini يرجع نص بدل JSON | markdown code block | استخدم `safe_gemini_call` |
| entry_type كلها "event" | الـ stub يُرجع default | استبدل الـ stub |
| Offline queue لا تُرسَل | نسيان `window.online` listener | انسخ من MARAYA_02_FRONTEND.md قسم 6 |
| Polling لا ينتهي | لا max attempts | انسخ `pollEntryStatus` كاملاً |

---

## ترتيب تشغيل الخدمات (كل مرة)

```bash
# 1
docker compose up -d

# 2
python manage.py runserver

# 3
celery -A config worker --loglevel=info --concurrency=2

# 4
celery -A config beat --loglevel=info \
  --scheduler django_celery_beat.schedulers:DatabaseScheduler

# 5
cd frontend && npm run dev
```

---

## Seed بيانات اختبار

```python
# python manage.py shell < seed.py
from django.contrib.auth import get_user_model
from apps.entries.models import Entry
from datetime import datetime, timedelta
import random

User = get_user_model()
user = User.objects.first()
if not user:
    print("سجّل دخول بـ Google أولاً")
else:
    test_entries = [
        "صحيت الصبح شربت 2 كباية قهوة وسجرت 4 سجاير قبل الشغل",
        "اجتماع طويل أرهقني — شربت كباية قهوة تالتة",
        "خلصت مهمة كانت متأخرة وحسيت براحة كبيرة",
        "مش قادر أنام من بدري — في دماغي أفكار كتير عن الشغل",
        "يوم هادي شربت شاي بس ومشيت 30 دقيقة في المساء",
        "اتخانقت مع حد في الشغل وضغطي ارتفع — سجرت 8 سجاير",
        "نمت 8 ساعات امبارح وصحيت نشيط — يوم كويس",
    ]
    for i, text in enumerate(test_entries):
        Entry.objects.create(
            user=user,
            text=text,
            created_at=datetime.now() - timedelta(days=i)
        )
    print(f"Created {len(test_entries)} test entries")
```
