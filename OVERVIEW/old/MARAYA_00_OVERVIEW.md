# المرايا — نظرة عامة وقرارات التصميم
> اقرأ هذا الملف أولاً. يحتوي على الفلسفة الكاملة للمشروع والقرارات النهائية التي بُنيت عليها باقي الملفات. لا تخالف أي قرار هنا إلا لقيد تقني موثق.

---

## 1. ما هو المرايا؟

تطبيق يومياتشخصي يعمل كـ "مرآة سلوكية" — المستخدم يكتب ما يحدث معه بنص حر، والنظام يعكس له بياناته منظمة ومحللة بمرور الوقت.

**الهدف النهائي:** بعد شهور من الاستخدام، يتحول التطبيق إلى knowledge base شخصية يمكن استجوابها: "متى يرتفع توتري؟" "هل تحسّن نومي؟" "ما العلاقة بين إجهادي وعدد السجاير؟"

---

## 2. المبادئ الجوهرية (غير قابلة للتفاوض)

### 2.1 صفر Friction في الكتابة
- مربع نص واحد، الفوكس عليه تلقائياً عند فتح التطبيق
- لا تصنيف يدوي، لا اختيارات، لا خطوات إضافية
- كل البنية تُستخرج أوتوماتيكياً في الخلفية

### 2.2 الانعكاس لا الحكم
- النظام يصف، لا يحكم
- لا "أنت مخطئ" أو "يجب عليك"
- كل ناتج يكون بصيغة ملاحظة وصفية أو سؤال

### 2.3 إحصائيات من اليوم الأول
- Metrics cards تظهر بيانات حقيقية من أول entry
- لا انتظار لتراكم البيانات لإظهار نتيجة
- Baseline يتكون تدريجياً ويُضاف للعرض بعد 7 أيام

### 2.4 فصل الكتابة عن التحليل
- وقت الكتابة: استخراج خفيف فوري (Celery async)
- وقت التحليل: batch دوري (يومي/أسبوعي/شهري)
- المستخدم لا يرى الفرق — لكن النظام يفصلهم بوضوح

### 2.5 الخصوصية أولاً
- البيانات حساسة (يوميات شخصية) — تُعامَل كذلك
- STT يعمل locally (faster-whisper)، لا يُرسَل صوت لخارج
- Gemini free tier: المستخدم يعرف مسبقاً أن نصوصه قد تُستخدم لتحسين الموديل

---

## 3. المستخدمون المستهدفون (MVP)

المستخدم الأول هو المطور نفسه + عدد صغير من الأصدقاء للتجربة الداخلية.
- مستخدم واحد إلى عشرة في المرحلة الأولى
- كلهم يفهمون طبيعة التطبيق التجريبية
- هدف المرحلة: التحقق من الاستمرارية والقيمة الفعلية

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React PWA)                 │
│  Login → Home (كتابة) → History → Insights → Settings  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS / JWT
┌────────────────────▼────────────────────────────────────┐
│                  Django + DRF (API)                      │
│  /auth/ │ /entries/ │ /metrics/ │ /insights/ │ /export/ │
│  /audio/transcribe/                                      │
│                                                          │
│  UserScopedViewSet ← كل ViewSet يرث منه (أمان إلزامي)  │
└──────┬──────────────────────────────┬───────────────────┘
       │                              │
┌──────▼──────┐              ┌────────▼────────┐
│  PostgreSQL  │              │  Celery Worker  │
│              │              │  + Celery Beat  │
│  entries     │◄─────────────│  (Redis broker) │
│  metrics     │              │                 │
│  insights    │              │  extract_entry  │
│  ...         │              │  daily/weekly/  │
└──────────────┘              │  monthly tasks  │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │  Gemini Flash   │
                              │  (Free tier)    │
                              └─────────────────┘

┌─────────────────────────────────────────────────────────┐
│  STT: faster-whisper (local, sync في Django view مباشرة)│
│  ⚠️ لا يعمل داخل Celery — bug موثق                     │
└─────────────────────────────────────────────────────────┘
```

---

## 5. طبقات البيانات

### طبقة 1: Raw Entry
النص الخام + timestamp + parent_id (للـ threading)

### طبقة 2: Extracted Data (LLM وقت الكتابة)
- `mood_score`: رقم 1-5
- `tags`: أحداث ومشاعر (ليس العادات الكمية)
- `entities`: أشخاص/مشاريع/أماكن
- `entry_type`: routine / event / reflection
- `is_open_event`: حدث مفتوح لم يكتمل

### طبقة 3: Metrics (LLM وقت الكتابة — جدول منفصل)
كميات قابلة للقياس: سجاير، قهوة، نوم، ماء، إلخ
تُعالَج إحصائياً بـ SQL — لا تدخل في تحليل LLM كنص خام

### طبقة 4: Insights (LLM دوري)
- Daily: ملخص + tag alerts
- Weekly: أنماط + metrics trends
- Monthly: مقارنات + اقتراحات تحسين

---

## 6. سجل القرارات النهائية

| القرار | الاختيار | السبب |
|---|---|---|
| Auth | Google OAuth فقط | أقل friction، بدون password management |
| STT | faster-whisper local | مجاني، خصوصية، لا يعمل كـ Celery task |
| LLM | Gemini Flash free tier | مجاني، يكفي للـ MVP |
| DB dev | SQLite | بساطة |
| DB prod | PostgreSQL | JSON indexing + production-ready |
| Thread depth | max level 1 | بسيط + يمنع edge cases معقدة |
| Token delivery | URL fragment (#) لا query param (?) | الـ fragment لا يُسجَّل في server logs |
| Metrics | جدول منفصل + SQL | دقة إحصائية + لا يضخّم LLM context |
| Metric promotion | 3 مستخدمين مختلفين → global | يمنع noise في الـ shared definitions |
| Polling | exponential backoff + max 10 attempts | يمنع infinite loop عند failure |
| Offline | localStorage queue | PWA يعمل بدون internet |
| Gunicorn | single process + threads | يمنع تضاعف Whisper model في memory |

---

## 7. الملفات المرجعية للـ Agent

اقرأ بالترتيب:
```
MARAYA_00_OVERVIEW.md    ← هذا الملف (اقرأه أولاً)
MARAYA_01_BACKEND.md     ← Schema + APIs + Tasks + Security
MARAYA_02_FRONTEND.md    ← Screens + UX + Design tokens
MARAYA_03_AI_LOGIC.md    ← Prompts + Processing logic
MARAYA_04_AGENT_GUIDE.md ← ترتيب التنفيذ + Checkpoints
```
