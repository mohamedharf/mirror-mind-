## إصلاح الثغرات الأمنية الحرجة في مشروع المرايا

بناءً على تقرير المراجعة، سيتم معالجة الثغرات الأمنية الحرجة التالية:

### 1. تمرير JWT tokens في الـ URL وتخزينها في localStorage

**المشكلة:** يتم تمرير JWT `access_token` و `refresh_token` في الـ URL كـ query parameters بعد نجاح Google OAuth، كما هو موضح في `01_backend_spec.md` (القسم 4.3، الكود في `apps/accounts/views.py`). هذا يعرض الـ tokens لخطر التسرب عبر سجل المتصفح (browser history)، سجلات الخادم (server logs)، أو هجمات Refereer Header. تخزينها في `localStorage` على الـ frontend يزيد من خطر هجمات XSS.

**الحل المقترح:**

1.  **تعديل `GoogleOAuthSuccessView`:** بدلاً من إعادة التوجيه مع الـ tokens في الـ URL، يجب أن يقوم الـ backend بإعادة التوجيه إلى صفحة في الـ frontend (مثلاً `/auth/callback`) بدون الـ tokens. هذه الصفحة يجب أن تقوم بطلب POST إلى endpoint جديد في الـ backend (مثلاً `/api/auth/google/callback/`) مع `code` و `state` (إذا كانت متوفرة من OAuth). الـ backend سيقوم بعد ذلك بتبادل الـ `code` للحصول على الـ tokens وإرجاعها في جسم استجابة (response body) كـ JSON.
2.  **تخزين الـ tokens بشكل آمن:** يجب تخزين الـ `access_token` في الذاكرة (in-memory) للوصول قصير الأمد، وتخزين الـ `refresh_token` في `HttpOnly, Secure` cookie. هذا يمنع JavaScript من الوصول المباشر للـ tokens ويقلل من خطر هجمات XSS.

**الإجراء:** سيتم تعديل الكود في `apps/accounts/views.py` ليعكس هذا الحل.

### 2. Redis و PostgreSQL مكشوفين بدون حماية على الشبكة

**المشكلة:** تقرير المراجعة يشير إلى أن Redis و PostgreSQL مكشوفين بدون حماية على الشبكة. من فحص `docker-compose.yml`:
*   **PostgreSQL:** مربوط على `127.0.0.1:5432:5432`، مما يحد من الوصول الخارجي المباشر. يتم استخدام `POSTGRES_USER` و `POSTGRES_PASSWORD`، ولكن كلمة المرور الافتراضية `maraya_password` ضعيفة ويجب تغييرها في بيئة الإنتاج.
*   **Redis:** مربوط على `127.0.0.1:6379:6379`، ويستخدم `redis-server --requirepass maraya_redis_pass`، مما يعني وجود كلمة مرور. ولكن `maraya_redis_pass` كلمة مرور ضعيفة.

**الحل المقترح:**

1.  **عزل الشبكة في Docker:** التأكد من أن خدمات `db` و `redis` لا يمكن الوصول إليها إلا من داخل شبكة Docker الخاصة بالمشروع، وأنها لا تعرض أي منافذ (ports) للعالم الخارجي إلا إذا كان ذلك ضرورياً وبحماية جدار ناري (firewall).
2.  **كلمات مرور قوية:** استخدام كلمات مرور قوية ومعقدة لـ PostgreSQL و Redis، وتخزينها بشكل آمن (مثلاً باستخدام Docker secrets أو نظام إدارة متغيرات البيئة).
3.  **تشفير الاتصال (SSL/TLS):** في بيئة الإنتاج، يجب تفعيل تشفير SSL/TLS للاتصال بقواعد البيانات و Redis لضمان سرية البيانات أثناء النقل.

**الإجراء:** سيتم تحديث `docker-compose.yml` و `.env` (أو ما يعادله) لتعزيز أمان كلمات المرور والتأكد من عزل الشبكة.

### 3. غياب Object-Level Permissions

**المشكلة:** `REST_FRAMEWORK` في `config/settings/base.py` يستخدم `DEFAULT_PERMISSION_CLASSES: ("rest_framework.permissions.IsAuthenticated",)`. هذا يعني أن أي مستخدم مصادق عليه يمكنه الوصول إلى أي كائن (object) من أي نوع، مما يسمح للمستخدم بقراءة أو تعديل أو حذف بيانات مستخدم آخر.

**الحل المقترح:**

1.  **تطبيق Object-Level Permissions:** استخدام مكتبات مثل `django-guardian` أو تطبيق منطق مخصص في الـ ViewSets للتحقق من أن المستخدم الحالي هو مالك الكائن الذي يحاول الوصول إليه أو لديه الصلاحيات المناسبة. على سبيل المثال، في `EntryViewSet`، يجب التأكد من أن `Entry` الذي يتم الوصول إليه ينتمي إلى `request.user`.

    ```python
    # مثال في apps/entries/views.py
    from rest_framework import viewsets, permissions
    from .models import Entry
    from .serializers import EntrySerializer

    class EntryViewSet(viewsets.ModelViewSet):
        serializer_class = EntrySerializer
        permission_classes = [permissions.IsAuthenticated]

        def get_queryset(self):
            # يضمن أن المستخدم يمكنه رؤية إدخالاته فقط
            return Entry.objects.filter(user=self.request.user)

        def perform_create(self, serializer):
            # يضمن أن الإدخال يتم إنشاؤه للمستخدم الحالي
            serializer.save(user=self.request.user)
    ```

2.  **تطبيق الصلاحيات على مستوى الكائن في جميع الـ ViewSets ذات الصلة:** هذا يشمل `EntryViewSet` و `DailyReflectionViewSet` و `WeeklyInsightViewSet` و `MonthlyInsightViewSet`.

**الإجراء:** سيتم تعديل الـ ViewSets في `apps/entries/views.py` و `apps/insights/views.py` لتطبيق Object-Level Permissions.

### 4. حزمة `djangofilter==0.1.0` مشبوهة (typosquatting محتمل)

**المشكلة:** تقرير المراجعة أشار إلى وجود حزمة `djangofilter==0.1.0` المشبوهة. عند مراجعة `requirements.txt` الحالي، تبين أن الحزمة الموجودة هي `django-filter==24.3`، وهي الحزمة الصحيحة. يبدو أن هذه المشكلة قد تم حلها مسبقًا أو أن التقرير يشير إلى حالة سابقة للمشروع.

**الحل:** لا يوجد إجراء مطلوب حاليًا لهذه المشكلة حيث أن الحزمة الصحيحة `django-filter` مستخدمة بالفعل.
