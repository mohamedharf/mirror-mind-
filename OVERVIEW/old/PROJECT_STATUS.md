# حالة مشروع المرايا — تقرير التتبع للوكيل (Agent)

هذا الملف يوثق ما تم إنجازه، المشاكل التي تم حلها، والخطوات المتبقية. يجب على أي Agent جديد قراءة هذا الملف مع `00_agent_guide.md` قبل البدء.

---

## ✅ ما تم إنجازه (Completed)

### 1. البنية التحتية والبيئة
- استخراج الكود المصدري وتنظيمه في هيكل Django قياسي.
- إعداد ملف `.env` بمتغيرات بيئة آمنة وكلمات مرور قوية.
- ضبط `docker-compose.yml` لعزل الخدمات (DB, Redis) وتأمينها.
- تحديث `requirements.txt` بالحزم الصحيحة (إزالة `djangofilter` المشبوهة وإضافة `django-filter`).

### 2. إصلاح الثغرات الأمنية (Security Fixes)
- **JWT Security:** تم إلغاء تمرير الـ tokens في الـ URL. تم إعداد `HttpOnly Cookies` للـ Refresh Token ونظام `Session-based exchange` للـ Access Token بعد OAuth.
- **Object-Level Permissions:** تم تطبيق قيود الوصول في `EntryViewSet` و `Insights ViewSets` لضمان أن المستخدم يرى بياناته فقط.
- **DB Hardening:** تأمين PostgreSQL و Redis بكلمات مرور معقدة وعزل الوصول الشبكي.

### 3. إصلاح المشاكل التقنية (Technical Fixes)
- **Model Fixes:** التأكد من وجود حقل `status` في `Entry` وتحديث الـ Serializers.
- **SQLite Compatibility:** حل مشكلة الـ Streak query عبر دالة `calculate_streak` في `apps/insights/utils.py` باستخدام `TruncDate`.
- **STT Logic:** إصلاح bug استهلاك الـ Generator في `apps/audio/stt.py` لضمان حساب الـ confidence بشكل صحيح.
- **Settings Sync:** توحيد إعدادات `base.py` و `dev.py` وضبط `SIMPLE_JWT` و `CORS`.

### 4. هيكل الـ API (Phase 2 & 4 Core)
- **Accounts:** مسارات OAuth و JWT جاهزة.
- **Entries:** الـ CRUD الأساسي جاهز مع استدعاء Celery Task (Stub).
- **Audio:** الـ Transcribe View يعمل بشكل متزامن (Synchronous) لتجنب مشاكل Celery مع `faster-whisper`.
- **Insights:** الـ ViewSets للقراءات اليومية والأسبوعية والشهرية جاهزة (Read-only).
- **Export:** نظام تصدير الـ Markdown جاهز.

---

## ⏳ ما يجب تنفيذه الآن (Next Steps)

### المرحلة 6: Celery Tasks (الذكاء الاصطناعي الفعلي)
- [x] **ربط Gemini Flash API:** تم استبدال الـ Stubs في `apps/entries/tasks.py` بمنطق استدعاء AI حقيقي باستخدام `call_gemini_extraction`.
- [x] **المهام الدورية:** تم برمجة `generate_daily_reflection`, `generate_weekly_insight`, و `generate_monthly_insight` في `apps/insights/tasks.py`.
- [x] **منطق التنبيهات:** تم تفعيل `compute_tag_alerts` داخل `generate_daily_reflection`.
- [x] **ضبط الجدولة (Celery Beat):** تم تكوين `app.conf.beat_schedule` في `config/celery.py` لجدولة المهام اليومية والأسبوعية والشهرية.

### المرحلة 9: Frontend React
- [ ] **إعداد المشروع:** إنشاء مشروع Vite + React.
- [ ] **نظام المصادقة:** ربط Google Login واستقبال الـ tokens من المسارات الجديدة المؤمنة.
- [ ] **الواجهات:** بناء صفحة الإدخال، سجل اليوميات، ولوحة التحليلات (Insights).

### المرحلة 10 & 11: PWA والتكامل النهائي
- [ ] تحويل التطبيق لـ PWA.
- [ ] اختبار التكامل النهائي (End-to-End Testing).

---

## ⚠️ ملاحظات هامة للمنفذ القادم
- **STT:** لا تحاول تشغيل `faster-whisper` داخل Celery Worker؛ سيتعلق الـ process. ابقهِ متزامناً في الـ View كما هو الآن.
- **Gemini:** استخدم دالة `safe_gemini_call` الموثقة في `03_ai_logic_spec.md` لتجنب أخطاء الـ JSON parsing.
- **Database:** في بيئة الـ Dev، استخدم `python manage.py migrate` دائماً لأن هناك حقولاً جديدة (مثل `status`) تمت إضافتها.

---
**آخر تحديث:** 2 يوليو 2026
**الحالة الحالية:** نهاية المرحلة 6 (تم تفعيل منطق الـ AI بالكامل وجدولة المهام الدورية).
