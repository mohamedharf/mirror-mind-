# ▶ تشغيل مشروع المرايا — وضع الاختبار (Test Mode)

> في هذا الوضع، **لن تحتاج إلى Redis أو Celery Worker**. 
> كل شيء سيعمل مباشرة في الـ Backend للتبسيط، وتم تفعيل تسجيل دخول وهمي بضغطة زر دون الحاجة لربط حساب Google.

---

## 1. Terminal 1 — Django Backend

```powershell
# 1. افتح المجلد
cd "C:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete"

# 2. فعّل البيئة الافتراضية
env\Scripts\Activate.ps1

# 3. اضبط إعدادات الاختبار
$env:DJANGO_SETTINGS_MODULE = "config.settings.test"

# 4. شغّل المايجريشنز (لتجهيز قاعدة البيانات)
python manage.py migrate

# 5. شغّل السيرفر
python manage.py runserver
```

> ✅ المتوقع: `Starting development server at http://127.0.0.1:8000/`

---

## 2. Terminal 2 — Frontend (واجهة المستخدم)

```powershell
# 1. افتح مجلد الواجهة
cd "C:\Users\PC HOME\OneDrive\Desktop\merror\maraya_final_complete\frontend"

# 2. شغّل السيرفر
npm run dev
```

> ✅ المتوقع: `VITE v5.4.21 ready`

---

## 🚀 طريقة التجربة الآن:

1. افتح المتصفح على: **[http://localhost:5173](http://localhost:5173)**
2. ستجد زر جديد تحت زر جوجل باسم **"🧪 دخول للاختبار (مستخدم وهمي)"**.
3. اضغط عليه. سيقوم النظام بإنشاء مستخدم وهمي (`test@maraya.local`) وتسجيل الدخول فوراً.
4. أضف تدويناتك، وسيتم تحليلها بـ Gemini واستخراج التقييمات لأن الـ API Key الحقيقي تمت إضافته (AIzaSyD955...).
5. لا حاجة لانتظار Celery Worker، التدوينة سيتم تحليلها مباشرة في نفس اللحظة!

---

## 💡 معلومات إضافية

- **تمت إضافة مفتاح Gemini الخاص بك.** إذا أردت تعديله مستقبلاً ستجده في ملف `.env` و `test.py`.
- الـ Client ID الخاص بـ Google الذي أرسلته (`UCiGrs0B0Y-HUoGWtB6Q_4nw`) لا نحتاجه حالياً في وضع الاختبار، ولكن يمكنك إضافته لملف `.env` في حقل `GOOGLE_CLIENT_ID` إذا أردت تشغيل تسجيل الدخول الفعلي بـ Google لاحقاً.
