# Maraya Project Overview and Run Commands

## 1. نظرة عامة على المشروع

هذا المشروع هو تطبيق Django REST API لكتابة يوميات شخصية ومعالجتها باستخدام الذكاء الصناعي وتحويل الصوت إلى نص. المشروع يدعم:
- تسجيل دخول ومصادقة عبر Google
- رفع ملف صوتي وتحويله إلى نص
- حفظ إدخالات يوميات للمستخدم
- تحليل المدخلات لاستخراج المزاج والتاجز والكيانات
- توليد ملخصات يومية وأسبوعية وشهرية
- تصدير الإدخالات إلى ملف Markdown
- تشغيل Celery لمهام الخلفية المجدولة
- بنية قابلة للعمل محليًا أو عبر Docker

## 2. الملفات الأساسية في جذر المشروع

- `manage.py`
  - نقطة الدخول لتشغيل أوامر Django.
  - يستخدم إعدادات `config.settings.dev` بشكل افتراضي.

- `requirements.txt`
  - يحتوي على مكتبات Python المطلوبة مثل Django، DRF، Celery، Redis، Whisper، Gemini.

- `docker-compose.yml`
  - يعرّف الخدمات: `db` (Postgres)، `redis`، `backend`، `celery_worker`، `celery_beat`، و `frontend` placeholder.

- `Dockerfile.backend`
  - يبني صورة Docker للتطبيق.
  - يثبت الاعتمادات ويجعل `gunicorn` هو الأمر الافتراضي.

## 3. إعدادات المشروع
- `config/settings/base.py`
  - إعدادات Django الأساسية.
  - يعرّف التطبيقات المثبتة، REST Framework، JWT، CORS، Celery، قواعد الموقع.

- `config/settings/dev.py`
  - إعدادات التطوير باستخدام SQLite.

- `config/settings/prod.py`
  - إعدادات الإنتاج باستخدام `dj_database_url` لقاعدة بيانات خارجية.

- `config/urls.py`
  - يربط مسارات API الخاصة بالتطبيقات:
    - `api/auth/` لمصادقة dj-rest-auth
    - `api/entries/` لإدخالات اليوميات
    - `api/insights/` للتحليلات
    - `api/audio/` لتحويل الصوت
    - `api/export/` للتصدير

- `config/celery.py`
  - يهيئ Celery مع Django.
  - يعرّف مهام مجدولة:
    - `generate_daily_reflection`
    - `generate_weekly_insight`
    - `generate_monthly_insight`

## 4. التطبيقات (Apps)

### 4.1 `apps.accounts`

- ملفات رئيسية:
  - `views.py`
  - `urls.py`

- الوظيفة:
  - يدير نجاح المصادقة عبر Google.
  - يولد `refresh_token` و `access_token` بعد تسجيل الدخول.
  - يخزن `access_token` في الجلسة ثم يعيده عبر واجهة API.

- الدوال الرئيسية:
  - `GoogleOAuthSuccessView.get()`
    - إذا كان المستخدم مسجلاً، ينشئ توكنات JWT ويعيد توجيه المستخدم إلى الواجهة الأمامية.
  - `GetAccessTokenView.get()`
    - يسترجع `access_token` من الجلسة ويعيده كاستجابة JSON.

### 4.2 `apps.audio`

- ملفات رئيسية:
  - `views.py`
  - `stt.py`
  - `urls.py`

- الوظيفة:
  - قبول رفع ملف صوتي عبر API.
  - تحويل الصوت إلى نص باستخدام نموذج Whisper.

- الدوال الرئيسية:
  - `TranscribeView.post()`
    - يحفظ الملف الصوتي مؤقتًا، يستدعي `transcribe()`، ثم يعيد النتيجة.
  - `get_whisper_model()`
    - يحمّل نموذج Whisper مرة واحدة ويعيده كسجل Singleton.
  - `transcribe(audio_path)`
    - ينفذ التعرف الصوتي على الملف ويحسب الثقة.

### 4.3 `apps.entries`

- ملفات رئيسية:
  - `models.py`
  - `views.py`
  - `serializers.py`
  - `tasks.py`
  - `utils.py`
  - `urls.py`

- الوظيفة:
  - حفظ إدخالات اليوميات المرتبطة بالمستخدم.
  - استدعاء مهام Celery لتحليل الإدخالات عبر Gemini.

- نماذج البيانات:
  - `Entry`
    - الحقول: `user`, `parent`, `text`, `created_at`, `updated_at`, `mood_score`, `tags`, `entities`, `ai_reflection`, `is_open_event`, `status`.
    - حالات المعالجة: `processing`, `done`, `failed`.

- الدوال الرئيسية:
  - `EntryViewSet.get_queryset()`
    - يسترجع الإدخالات الخاصة بالمستخدم الحالي فقط.
  - `EntryViewSet.perform_create()`
    - ينشئ الإدخال للمستخدم الحالي ويستدعي `extract_entry_data.delay()`.
  - `extract_entry_data(entry_id)`
    - مهمة Celery تستدعي `call_gemini_extraction()` وتحفظ النتيجة في السجل.
  - `call_gemini_extraction(text, recent_tags)`
    - يوجّه نموذج Gemini لاستخراج `mood_score`, `tags`, `entities`, `reflection`, `is_open_event`.

### 4.4 `apps.insights`

- ملفات رئيسية:
  - `models.py`
  - `views.py`
  - `serializers.py`
  - `tasks.py`
  - `urls.py`
  - `utils.py`

- الوظيفة:
  - إضافة تحليلات يومية، أسبوعية، وشهرية.
  - إنشاء إدخالات تحليلية من بيانات اليوميات.

- نماذج البيانات:
  - `DailyReflection`
  - `WeeklyInsight`
  - `MonthlyInsight`

- الدوال الرئيسية:
  - `DailyReflectionViewSet.get_queryset()`
  - `WeeklyInsightViewSet.get_queryset()`
  - `MonthlyInsightViewSet.get_queryset()`
  - `generate_daily_reflection(user_id, target_date_str)`
    - يبني ملخص يومي عبر Gemini.
  - `generate_weekly_insight(user_id, week_start_str)`
    - يبني تحليلات أسبوعية ويحسب اتجاه المزاج.
  - `generate_monthly_insight(user_id, month, year)`
    - يجمع بيانات شهرية ويولد أنماط واقتراحات.
  - `calculate_streak(user, today)`
    - يحسب سلسلة الأيام المتتالية التي أضاف فيها المستخدم إدخالات.

### 4.5 `apps.export_app`

- ملفات رئيسية:
  - `views.py`
  - `urls.py`

- الوظيفة:
  - تصدير إدخالات المستخدم إلى ملف Markdown داخل API.

- الدوال الرئيسية:
  - `ExportMarkdownView.post()`
    - يأخذ `from_date` و `to_date`، يجلب الإدخالات، وينسّق المحتوى.
    - يعيد `filename` و `content` كنص Markdown.

## 5. كفاءة التشغيل الأساسية

### أوامر إعداد البيئة المحلية

1. تنشيط البيئة الافتراضية:
```powershell
cd c:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete
env\Scripts\Activate.ps1
```

2. تثبيت المتطلبات:
```powershell
pip install -r requirements.txt
```

3. إنشاء قاعدة البيانات وتشغيل المهاجرات:
```powershell
python manage.py makemigrations
python manage.py migrate
```

4. تشغيل السيرفر محليًا:
```powershell
python manage.py runserver
```

### أوامر تشغيل Celery محليًا

- تشغيل عامل Celery:
```powershell
celery -A config worker -l info
```

- تشغيل Celery Beat (المهام المجدولة):
```powershell
celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### أوامر Docker

- تشغيل الخدمات باستخدام Docker Compose:
```powershell
docker-compose up --build
```

- تشغيل الخدمة الخلفية فقط:
```powershell
docker-compose up --build backend
```

- تشغيل Redis و Postgres و Celery معًا:
```powershell
docker-compose up --build db redis backend celery_worker celery_beat
```

## 6. متغيرات البيئة المهمة

- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `FRONTEND_URL`
- `DATABASE_URL` أو في `docker-compose.yml`
- `REDIS_URL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `WHISPER_MODEL_SIZE`
- `WHISPER_DEVICE`

## 7. ملاحظات سريعة

- التطبيق يعتمد بشكل أساسي على Django REST Framework و JWT للمصادقة.
- Celery يستخدم Redis كوسيط، و `django-celery-beat` لجدولة المهام.
- `apps.entries` يستخدم Gemini لفهم النصوص وإنتاج بيانات منظمة.
- `apps.audio` يستخدم Whisper لتحويل الصوت إلى نص.
- `apps.export_app` يسمح بتصدير الإدخالات إلى ملف Markdown.
- `apps.insights` تولّد تحليلات يومية، أسبوعية، وشهرية من بيانات اليوميات.
