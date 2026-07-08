# مشروع المرايا — Master Task File
> **لأي LLM يكمل من هنا:** اقرأ هذا الملف كاملاً قبل أي تنفيذ.
> لا تتخطَّ task مُعلَّمة `[ ]` إلا بعد تنفيذها فعلاً وتشغيل checkpoint الخاص بها.

---

## حالة المشروع — 4 يوليو 2026

| Phase | الوصف | الحالة |
|---|---|---|
| A — Backend | Django models + tasks + views + URLs + celery + migrations | ✅ مكتملة |
| B — Frontend | React + Vite 5.4 + كل الشاشات الأربعة | ✅ مكتملة — يعمل على localhost:5173 |
| C — Integration | PWA icons + CORS + E2E test | ✅ Icons + CORS جاهزان — ❌ E2E Test لم يبدأ |

### ملاحظة مهمة
- Node.js المثبت: **20.16.0**
- **تم الحل:** Vite 5.4.x في package.json — متوافق مع Node 20.16
- السيرفر يعمل: `Vite v5.4.21 ready on http://localhost:5173`
- CORS: `CORS_ALLOW_ALL_ORIGINS = True` موجود في base.py

---

## قرارات التصميم — لا تخالفها أبداً

| القرار | التفاصيل |
|---|---|
| STT | faster-whisper يعمل **sync في الـ view فقط** — لا تشغّله في Celery Worker أبداً |
| Token delivery | URL **Fragment (#)** لا query param (?) — Fragment لا يُرسَل لـ server logs |
| Gemini wrapper | استخدم **safe_gemini_call** دائماً — لا تستدعِ Gemini مباشرة |
| UserScopedViewSet | كل ViewSet **يرث منه** — إلزامي للأمان |
| DB | SQLite في dev — TruncDate من ORM لا SQL خام |
| Thread depth | max = 1 — يُمنع في `validate_parent_id` في serializers.py |
| Gunicorn | `--workers 1 --threads 4` فقط |
| Metrics | **صفر LLM** لحساب الأرقام — SQL فقط |
| Node version | **v20.16.0** — استخدم **Vite 5.x** لا Vite 6+ أو 8+ |

---

## هيكل المشروع الكامل

```
maraya_final_complete/
├── manage.py
├── requirements.txt
├── .env
├── docker-compose.yml
├── Dockerfile.backend
├── OVERVIEW/
│   └── MARAYA_MASTER_TASKS.md  ← هذا الملف
├── config/
│   ├── settings/ (base.py / dev.py / prod.py)
│   ├── urls.py           ✅ api/v1/ prefix
│   ├── celery.py         ✅ 5 scheduled tasks
│   └── wsgi.py
├── apps/
│   ├── accounts/         ✅ Google OAuth + Fragment token
│   ├── entries/
│   │   ├── models.py         ✅ Entry + MetricDefinition + Metric + MetricBaseline
│   │   ├── serializers.py    ✅ validate_parent_id + metrics
│   │   ├── views.py          ✅ UserScopedViewSet + today + filters + safe delete
│   │   ├── tasks.py          ✅ extract_entry_data + baselines + reprocess
│   │   ├── ai.py             ✅ safe_gemini_call + prompts
│   │   ├── metrics_views.py  ✅ TodayMetrics + History + Definitions
│   │   ├── urls.py           ✅ entries router + metrics endpoints
│   │   └── management/commands/reprocess_pending.py ✅
│   ├── insights/
│   │   ├── models.py     ✅ metrics_summary + patterns كـ list
│   │   ├── views.py      ✅ date filtering
│   │   ├── tasks.py      ✅ safe_gemini_call + orchestrators
│   │   ├── serializers.py ✅
│   │   └── urls.py       ✅
│   ├── audio/            ✅ STT sync
│   └── export_app/       ✅ Markdown export
└── frontend/
    ├── package.json      ✅ Vite 5.4 + React 18
    ├── vite.config.js    ✅ PWA plugin + proxy
    ├── index.html        ✅ RTL + Arabic font
    ├── public/
    │   ├── mirror-icon.svg ✅
    │   ├── icon-192.png    ✅
    │   └── icon-512.png    ✅
    └── src/
        ├── index.css       ✅ Design system كامل
        ├── main.jsx        ✅
        ├── App.jsx         ✅ Router + PrivateRoute
        ├── store/
        │   ├── authStore.js  ✅
        │   └── entryStore.js ✅
        ├── lib/
        │   ├── api.js          ✅ Axios + JWT refresh
        │   ├── offlineQueue.js ✅
        │   └── utils.js        ✅ polling + Arabic date
        ├── components/
        │   └── BottomNav.jsx ✅
        └── pages/
            ├── Login.jsx       ✅
            ├── AuthCallback.jsx ✅
            ├── Home.jsx        ✅
            ├── History.jsx     ✅
            ├── Insights.jsx    ✅
            └── Settings.jsx    ✅
```

---

## API Endpoints الكاملة

| Method | URL | الوظيفة |
|---|---|---|
| GET | /api/v1/entries/ | قائمة الإدخالات (root فقط) |
| POST | /api/v1/entries/ | إنشاء entry جديد |
| GET | /api/v1/entries/{id}/ | تفاصيل + metrics + children |
| DELETE | /api/v1/entries/{id}/ | حذف (الأبناء parent=null) |
| GET | /api/v1/entries/today/ | إدخالات اليوم + total_today + show_more |
| GET | /api/v1/entries/?date=YYYY-MM-DD | filter بالتاريخ |
| GET | /api/v1/entries/?month=M&year=Y | filter بالشهر |
| GET | /api/v1/entries/?search=كلمة | بحث نصي |
| GET | /api/v1/metrics/today/ | metrics اليوم مع baseline |
| GET | /api/v1/metrics/history/?name=X&days=30 | تاريخ metric |
| GET | /api/v1/metrics/definitions/ | system + user metrics |
| GET | /api/v1/insights/daily/?date=YYYY-MM-DD | الانعكاس اليومي |
| GET | /api/v1/insights/weekly/?week_start=YYYY-MM-DD | التحليل الأسبوعي |
| GET | /api/v1/insights/monthly/?month=YYYY-MM | التحليل الشهري |
| POST | /api/v1/audio/transcribe/ | رفع صوت → نص |
| GET | /api/v1/export/?from=&to= | تصدير Markdown |
| GET | /accounts/google/login/ | بدء OAuth |

---

## جدول التسكات الكامل

| # | Task | الملف | الحالة |
|---|---|---|---|
| **PHASE A — BACKEND** | | | |
| A1 | Entry + MetricDefinition + Metric + MetricBaseline models | apps/entries/models.py | ✅ مكتمل |
| A2 | WeeklyInsight.metrics_summary + patterns كـ list | apps/insights/models.py | ✅ مكتمل |
| A3 | safe_gemini_call + EXTRACTION prompts | apps/entries/ai.py | ✅ مكتمل |
| A4 | extract_entry_data + update_metric_baselines + reprocess_stuck | apps/entries/tasks.py | ✅ مكتمل |
| A5 | management command reprocess_pending | apps/entries/management/ | ✅ مكتمل |
| A6 | EntrySerializer (validate_parent_id + metrics) | apps/entries/serializers.py | ✅ مكتمل |
| A7 | EntryViewSet (UserScopedViewSet + today + filters) | apps/entries/views.py | ✅ مكتمل |
| A8 | Metrics Views (Today + History + Definitions) | apps/entries/metrics_views.py | ✅ مكتمل |
| A9 | entries/urls.py (router + metrics) | apps/entries/urls.py | ✅ مكتمل |
| A10 | config/urls.py (api/v1/ prefix) | config/urls.py | ✅ مكتمل |
| A11 | config/celery.py (5 scheduled tasks) | config/celery.py | ✅ مكتمل |
| A12 | insights/tasks.py (safe_gemini_call + orchestrators) | apps/insights/tasks.py | ✅ مكتمل |
| A13 | insights/views.py (date filtering) | apps/insights/views.py | ✅ مكتمل |
| A14 | Migrations + Seed 8 MetricDefinitions | DB | ✅ مكتمل |
| A15 | Django check = 0 errors | — | ✅ مكتمل |
| **PHASE B — FRONTEND** | | | |
| B1 | Vite 5.4 + React 18 + npm install | frontend/ | ✅ مكتمل — Vite v5.4.21 شغّال |
| B2 | Design System CSS | frontend/src/index.css | ✅ مكتمل |
| B3 | Zustand Stores (authStore + entryStore) | frontend/src/store/ | ✅ مكتمل |
| B4 | Utilities (api.js + offlineQueue.js + utils.js) | frontend/src/lib/ | ✅ مكتمل |
| B5 | شاشة Login | frontend/src/pages/Login.jsx | ✅ مكتمل |
| B6 | Auth Callback (JWT من Fragment) | frontend/src/pages/AuthCallback.jsx | ✅ مكتمل |
| B7 | BottomNav Component | frontend/src/components/BottomNav.jsx | ✅ مكتمل |
| B8 | شاشة Home (الإدخال الرئيسية) | frontend/src/pages/Home.jsx | ✅ مكتمل |
| B9 | شاشة History | frontend/src/pages/History.jsx | ✅ مكتمل |
| B10 | شاشة Insights | frontend/src/pages/Insights.jsx | ✅ مكتمل |
| B11 | شاشة Settings | frontend/src/pages/Settings.jsx | ✅ مكتمل |
| B12 | App.jsx + Router | frontend/src/App.jsx | ✅ مكتمل |
| B13 | vite.config.js (PWA + proxy) | frontend/vite.config.js | ✅ مكتمل |
| B14 | npm run dev يعمل بدون errors | — | ✅ مكتمل — localhost:5173 شغّال |
| **PHASE C — INTEGRATION** | | | |
| C1 | PWA Icons (icon-192.png + icon-512.png) | frontend/public/ | ✅ مكتمل |
| C2 | CORS settings في Django | config/settings/base.py | ✅ موجود — CORS_ALLOW_ALL_ORIGINS=True |
| C3 | اختبار E2E كامل | — | [ ] |

---

# تفاصيل Phase A — ما اكتمل

## نماذج قاعدة البيانات (apps/entries/models.py)

### MetricDefinition
```python
name (unique) | unit | category (health|habit|activity|nutrition)
aliases (JSONField) | is_system | suggested_by_count | promoted_at
```

### Entry
```python
user | parent (depth=1 max) | text | created_at | updated_at
mood_score | tags | entities | ai_reflection
entry_type (routine|event|reflection) | is_open_event
processing_status (pending|processing|done|failed|rate_limited)
indexes: (user,created_at) + (user,parent) + (user,processing_status)
```

### Metric
```python
user | entry | definition | value | recorded_at
indexes: (user,definition,recorded_at) + (user,recorded_at)
```

### MetricBaseline — SQL فقط، صفر LLM
```python
user | definition | daily_avg | daily_min | daily_max | sample_days
unique_together: (user, definition)
```

## System Metrics المُضافة في الـ DB (Seed)

| الاسم | الوحدة | الـ Aliases |
|---|---|---|
| سجاير | سيجارة | سجارة، دخان، تدخين |
| قهوة | كوب | فنجان، اسبريسو، كباية قهوة |
| نوم | ساعة | نمت، صحيت، ساعات نوم |
| ماء | لتر | مية، شربت مية، كوباية مية |
| رياضة | دقيقة | جري، جيم، تمرين، مشي |
| اكل | وجبة | غدا، غداء، عشا، فطار |
| شاي | كوب | كباية شاي، شاي اخضر |
| دواء | جرعة | حبة، علاج، دوا، اقراص |

## safe_gemini_call (apps/entries/ai.py)
```python
def safe_gemini_call(prompt, system, default, max_tokens=600, temperature=0.1):
    # ResourceExhausted → يُعاد throw للـ task عشان تعمل retry
    # JSON parse error → يُرجع default بدون crash
    # أي خطأ آخر → يُرجع default بدون crash
```

## Celery Schedule (config/celery.py)
| Task | Schedule |
|---|---|
| run_daily_reflections | كل يوم 23:50 |
| run_weekly_insights | كل أحد 00:30 |
| run_monthly_insights | أول كل شهر 01:00 |
| update_metric_baselines | كل أحد 01:30 — SQL فقط |
| reprocess_stuck_entries | كل ساعة |

---

# تفاصيل Phase B — ما اكتمل

## Design Tokens (src/index.css)
```css
--bg-deep: #0D1B2A | --bg-surface: #1A2B3C | --bg-elevated: #243447
--primary: #2E75B6 | --primary-light: #4A90D9 | --accent: #3ECFCF
--text-primary: #EAF1F8 | --text-secondary: #8FA8C7 | --text-muted: #4A5F7A
--mood-high: #4CAF82 | --mood-low: #E05C5C | --mood-mid: #E8A838
--font: 'IBM Plex Sans Arabic', 'Cairo', Arial, sans-serif
```

## شاشة Home (src/pages/Home.jsx) — المنطق الرئيسي

```javascript
// handleSave — الخطوات بالترتيب:
1. تحقق من text.trim() && !isSaving
2. لو offline → enqueue(payload) + toast "حُفظ بدون إنترنت"
3. لو online → api.post('/entries/', payload)
4. addToTodayEntries(data) فوراً
5. pollEntryStatus(api, id, onDone, onFail):
   - done → updateTodayEntry + setLastReflection + fetchMetrics
   - failed/rate_limited → toast تحذير
6. Ctrl+Enter → handleSave()
```

```javascript
// Voice Recording:
// startRecording → navigator.mediaDevices.getUserMedia
// stopRecording → MediaRecorder.stop() → Blob → api.post('/audio/transcribe/')
// الـ transcript يُضاف للـ textarea
```

```javascript
// Offline queue flush:
window.addEventListener('online', async () => {
  const n = await flush(api)
  if (n > 0) { showToast(`تم إرسال ${n} إدخال`); fetchToday(); fetchMetrics() }
})
```

## شاشة Insights (src/pages/Insights.jsx)
- **WeeklyTab**: `GET /api/v1/insights/weekly/?week_start=<Monday>`
  - LineChart (Recharts) — mood_trend array → [{day, avg_mood}]
  - TagsProgress — progress bars
  - Patterns — cards
- **MonthlyTab**: `GET /api/v1/insights/monthly/?month=YYYY-MM`
  - Mood comparison (prev vs current)
  - Suggestions — أيقونة 💡

## شاشة Settings (src/pages/Settings.jsx)
- ExportModal: `GET /api/v1/export/?from=&to=` → download .md
- DeleteConfirmModal: اكتب "احذف" للتأكيد
- logout → localStorage.clear() → navigate('/login')

---

# Phase C — الخطوات المتبقية

## C2 — CORS في Django (مطلوب لتشغيل Frontend)

في `config/settings/base.py` أو `dev.py` أضف:

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CORS_ALLOW_CREDENTIALS = True
```

تأكد أن `corsheaders` موجود في INSTALLED_APPS و MIDDLEWARE:
```python
INSTALLED_APPS = [
    ...
    'corsheaders',
    ...
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # ← أول middleware
    'django.middleware.security.SecurityMiddleware',
    ...
]
```

لو `django-cors-headers` مش موجود في requirements.txt:
```bash
pip install django-cors-headers
```

## C3 — End-to-End Test Checklist

```bash
# Terminal 1 — Django
cd maraya_final_complete
env\Scripts\Activate.ps1
python manage.py runserver

# Terminal 2 — Celery Worker
celery -A config worker --loglevel=info --concurrency=2

# Terminal 3 — Celery Beat (للـ scheduled tasks)
celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler

# Terminal 4 — Frontend
cd frontend
npm run dev
```

### Checklist النهائي:
- [ ] localhost:5173 يفتح شاشة Login
- [ ] Google Login يعمل (redirect → /auth/callback → /)
- [ ] Textarea تتمركز تلقائياً عند فتح الـ Home
- [ ] كتابة entry + حفظ → يظهر في القائمة فوراً (processing)
- [ ] بعد 10-30 ثانية → processing_status = done
- [ ] Reflection Card يظهر بـ ai_reflection + mood stars + tags
- [ ] Metrics Dashboard يتحدث (لو الـ entry فيه metrics)
- [ ] Voice Recording يعمل (الميكروفون)
- [ ] Ctrl+Enter يحفظ
- [ ] Offline → toast "حُفظ بدون إنترنت" → يُرسَل عند عودة الإنترنت
- [ ] /history → قائمة الإدخالات مجمّعة بالتاريخ
- [ ] /history → Search يعمل
- [ ] /history → Infinite scroll
- [ ] /insights → Weekly tab → Line chart يظهر
- [ ] /insights → Monthly tab → Mood comparison يظهر
- [ ] /settings → Export → date pickers → download .md
- [ ] /settings → Logout → redirect /login
- [ ] PWA: Chrome → F12 → Application → Manifest → كل البيانات موجودة

---

# أخطاء شائعة وحلولها

| الخطأ | السبب | الحل |
|---|---|---|
| "Vite requires Node.js 20.19+" | Vite 8 مع Node 20.16 | package.json فيه `"vite": "^5.4.11"` — npm install من الأول |
| faster-whisper يتعلق | تشغيله في Celery | sync في الـ view فقط — لا تغيّر هذا أبداً |
| Tokens في URL كـ ?access= | استخدام query param بدل fragment | تأكد من Fragment (#) في OAuth redirect في accounts/views.py |
| Metrics لا تظهر | Celery Worker مش شغّال | شغّل worker + reprocess_pending |
| processing_status = processing للأبد | Celery معطل | شغّل: `python manage.py reprocess_pending` |
| Gemini crash | استدعاء مباشر | `safe_gemini_call` دائماً |
| CORS error في Browser | CORS_ALLOWED_ORIGINS ناقص | أضف http://localhost:5173 — راجع C2 |
| Thread depth > 1 error | parent له parent | validate_parent_id في serializers.py يمنعه |
| Offline queue لا تُرسَل | نسيان online listener | موجود في Home.jsx — لا تحذفه |
| Daily reflection فارغ | Gemini يعيد string مش JSON | safe_gemini_call + default dict |
| موقع مش RTL | نسيان dir="rtl" في html | index.html فيه `dir="rtl"` |

---

# ترتيب تشغيل الخدمات كل مرة

```bash
# 1. تفعيل البيئة
cd maraya_final_complete
env\Scripts\Activate.ps1

# 2. Django (Terminal 1)
python manage.py runserver

# 3. Celery Worker (Terminal 2)
celery -A config worker --loglevel=info --concurrency=2

# 4. Celery Beat (Terminal 3) — للـ scheduled tasks فقط
celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler

# 5. Frontend (Terminal 4)
cd frontend
npm run dev
```

---

## ما يجب إكماله الآن (بالترتيب)

1. **✅ B14** — `npm run dev` يعمل — Vite v5.4.21 على localhost:5173
2. **✅ C2** — CORS_ALLOW_ALL_ORIGINS = True موجود في base.py
3. **[ ] C3** — شغّل كل الخدمات الأربعة واختبر الـ checklist كاملاً (الخطوة التالية الوحيدة)

---

آخر تحديث: 4 يوليو 2026
Phase A: ✅ مكتملة بالكامل (A1-A15)
Phase B: ✅ الكود مكتوب — ⏳ ينتظر npm install + تشغيل
Phase C: ⏳ جزئياً — يحتاج CORS + E2E Test
