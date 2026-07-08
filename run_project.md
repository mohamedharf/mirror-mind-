# ▶ تشغيل مشروع المرايا — من الصفر

> افتح **4 نوافذ PowerShell منفصلة** في مجلد المشروع:
> `C:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete`

---

## قبل أي شيء — تحقق لمرة واحدة فقط

```powershell
# تأكد أن ملف .env فيه القيم الحقيقية (مش placeholder)
# الحقول المطلوبة:
# GOOGLE_CLIENT_ID      ← من Google Cloud Console
# GOOGLE_CLIENT_SECRET  ← من Google Cloud Console
# GEMINI_API_KEY        ← من Google AI Studio
# SECRET_KEY            ← أي string طويل عشوائي
```

---

## ● Terminal 1 — Redis (عبر Docker)

```powershell
# شغّل Redis على البورت الافتراضي 6379
docker run -d --name maraya-redis -p 6379:6379 redis:7-alpine redis-server --requirepass "very_strong_redis_password_456!@#"
```

> لو Redis شغّال من قبل (ظهر "already in use"):
> ```powershell
> docker start maraya-redis
> ```

> للتحقق أنه شغّال:
> ```powershell
> docker ps | Select-String redis
> ```

---

## ● Terminal 2 — Django Backend

```powershell
# 1. افتح المجلد
cd "C:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete"

# 2. فعّل البيئة الافتراضية
env\Scripts\Activate.ps1

# 3. شغّل المايجريشنز (أول مرة فقط)
$env:DJANGO_SETTINGS_MODULE = "config.settings.dev"
python manage.py migrate

# 4. شغّل السيرفر
python manage.py runserver
```

> ✅ المتوقع: `Starting development server at http://127.0.0.1:8000/`

---

## ● Terminal 3 — Celery Worker

```powershell
cd "C:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete"
env\Scripts\Activate.ps1

$env:DJANGO_SETTINGS_MODULE = "config.settings.dev"
$env:REDIS_URL = "redis://:very_strong_redis_password_456!@#@localhost:6379/0"

celery -A config worker --loglevel=info --concurrency=2
```

> ✅ المتوقع: `ready. Accepting tasks...`
>
> ⚠ لو ظهر "Cannot connect to Redis": تأكد Terminal 1 شغّال أولاً

---

## ● Terminal 4 — Celery Beat (الـ Scheduled Tasks)

```powershell
cd "C:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete"
env\Scripts\Activate.ps1

$env:DJANGO_SETTINGS_MODULE = "config.settings.dev"
$env:REDIS_URL = "redis://:very_strong_redis_password_456!@#@localhost:6379/0"

celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

> ✅ المتوقع: `beat: Starting...`

---

## ● Terminal 5 — Frontend

```powershell
cd "C:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete\frontend"

npm run dev
```

> ✅ المتوقع: `VITE v5.4.21  ready in XXX ms`
> ✅ افتح: **http://localhost:5173**

---

## ترتيب التشغيل (مهم)

```
1. Redis       ← Docker
2. Django      ← python manage.py runserver
3. Celery Worker
4. Celery Beat
5. Frontend    ← npm run dev
```

---

## إذا أوقفت كل شيء وأردت البدء من أول

```powershell
# إيقاف Redis
docker stop maraya-redis

# إيقاف الباقي: Ctrl+C في كل terminal
```

---

## مشاكل شائعة وحلولها السريعة

| المشكلة | الحل |
|---|---|
| `Cannot connect to redis` | شغّل Terminal 1 أولاً — ثم أعد Terminal 3 و 4 |
| `ModuleNotFoundError` | تأكد تفعيل البيئة: `env\Scripts\Activate.ps1` |
| `migrate: no changes` | طبيعي — لا يوجد migrations جديدة |
| Celery يبدأ ثم يوقف | تحقق أن Redis شغّال بـ `docker ps` |
| `localhost:5173` فارغ | تأكد `npm run dev` بدون errors في Terminal 5 |
| Reflection لا تظهر | تأكد Celery Worker شغّال (Terminal 3) |
| processing_status = processing للأبد | شغّل: `python manage.py reprocess_pending` |
| Google login لا يعمل | تأكد GOOGLE_CLIENT_ID و SECRET في .env |
| REDIS_URL خطأ | تأكد القيمة في .env: `redis://:PASSWORD@localhost:6379/0` |

---

## تغيير REDIS_URL في .env للتشغيل المحلي

لو بتشغّل Redis محلياً (مش Docker Compose):

```env
# غيّر السطر ده في .env
REDIS_URL=redis://:very_strong_redis_password_456!@#@localhost:6379/0
```

> لأن docker-compose.yml يستخدم اسم service `redis` بدل `localhost`
> وده بيشتغل بس جوه Docker Compose — مش وأنت بتشغّل محلياً

---

## روابط بعد التشغيل

| الخدمة | الرابط |
|---|---|
| Frontend (الواجهة) | http://localhost:5173 |
| Backend API | http://localhost:8000/api/v1/ |
| Django Admin | http://localhost:8000/admin/ |
| Google Login | http://localhost:8000/accounts/google/login/ |

---

## أوامر مفيدة أثناء التطوير

```powershell
# إعادة تشغيل Celery بعد تغيير tasks.py
# Ctrl+C في Terminal 3 ثم:
celery -A config worker --loglevel=info --concurrency=2

# إعادة معالجة الإدخالات العالقة
python manage.py reprocess_pending

# عمل migration جديدة بعد تغيير model
python manage.py makemigrations
python manage.py migrate

# فتح Django shell
python manage.py shell

# تحقق من الأخطاء
python manage.py check
```

---

*آخر تحديث: 4 يوليو 2026*
