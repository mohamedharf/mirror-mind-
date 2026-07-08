# دليل إطلاق المشروع (Production Launch Guide)

هذا الملف يحتوي على جميع الإعدادات والمفاتيح اللازمة لتشغيل المشروع في وضع الإطلاق (Production) باستخدام Docker Compose.

## 1. ملف البيئة (.env)
يجب أن يحتوي ملف `.env` في المسار الرئيسي للمشروع على هذه المتغيرات بشكل كامل:

```env
# ══════════════════════════════════════════
# إعدادات الـ Django الأساسية
# ══════════════════════════════════════════
SECRET_KEY=your-django-secret-key-very-long-and-secure-random-string

# وضع التطوير: اجعله False عند الإطلاق الفعلي للجمهور
DEBUG=False

# النطاقات المسموح لها بالوصول للواجهة الخلفية
ALLOWED_HOSTS=localhost,127.0.0.1,*

# النطاق الخاص بالواجهة الأمامية (رابط React)
FRONTEND_URL=http://localhost:5173

# ══════════════════════════════════════════
# إعدادات قواعد البيانات و Redis
# ══════════════════════════════════════════
POSTGRES_PASSWORD=very_strong_postgres_password_123!@#
DATABASE_URL=postgres://maraya_user:${POSTGRES_PASSWORD}@db:5432/maraya_db

REDIS_PASSWORD=very_strong_redis_password_456!@#
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0

# ══════════════════════════════════════════
# مفاتيح الطرف الثالث (Third-Party APIs)
# ══════════════════════════════════════════
# مفتاح الذكاء الاصطناعي
GEMINI_API_KEY=AIzaSyD955QemHzf-DnXwQgSHNaLqztEnWOD7lo
GEMINI_MODEL=gemini-1.5-flash

# إعدادات تسجيل الدخول عبر Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## 2. خطوات التشغيل لبيئة الإطلاق (Docker)

لشغيل النظام بجميع أجزائه (السيرفر + قاعدة البيانات + Redis + Celery للذكاء الاصطناعي)، نفذ الأوامر التالية من الـ Terminal في المجلد الرئيسي:

### الخطوة 1: بناء المشروع
```bash
docker-compose build
```

### الخطوة 2: تشغيل المشروع في الخلفية
```bash
docker-compose up -d
```

### الخطوة 3: تجهيز قاعدة البيانات
```bash
docker-compose exec backend python manage.py migrate
```

## 3. الواجهة الأمامية (Frontend)

يجب أن يحتوي ملف `.env` بداخل مجلد `frontend` على المتغيرات التالية:
```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

ثم لبناء المشروع للإطلاق:
```bash
cd frontend
npm run build
```

## 4. الفروقات عن وضع الاختبار:
1. **تسجيل الدخول:** الدخول الوهمي (الـ Test User) غير متاح، والاعتماد بالكامل على الدخول الحقيقي بحسابات جوجل.
2. **الذكاء الاصطناعي:** سيتم إرسال الطلبات لـ Gemini في الخلفية عبر `Celery` و `Redis`، مما يعني أن المستخدم لن يواجه أي بطء عند كتابة وحفظ الإدخال.
3. **مستوى الأمان:** في وضع الإنتاج (`DEBUG=False`)، لن تظهر أي شاشات خطأ للمستخدمين تفضح أكواد المشروع.
