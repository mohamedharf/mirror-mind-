## إصلاح المشاكل التقنية في مشروع المرايا

بناءً على تقرير المراجعة، سيتم معالجة المشاكل التقنية التالية:

### 1. حقل `status` مفقود من Entry Model رغم إنه مطلوب في الـ API

**المشكلة:** تقرير المراجعة أشار إلى أن حقل `status` مفقود من `Entry Model`. عند مراجعة `apps/entries/models.py`، تبين أن الحقل `status` موجود بالفعل في النموذج.

**الحل:** لا يوجد إجراء مطلوب حاليًا لهذه المشكلة حيث أن الحقل `status` موجود بالفعل في `Entry Model`.

### 2. Streak query مكتوب بصيغة PostgreSQL بس ومش هيشتغل على SQLite في الـ dev

**المشكلة:** تقرير المراجعة أشار إلى أن الـ streak query يستخدم صيغة خاصة بـ PostgreSQL ولن يعمل مع SQLite. تم معالجة هذه المشكلة عن طريق إنشاء دالة `calculate_streak` في `apps/insights/utils.py` تستخدم `TruncDate` من Django ORM، مما يجعلها متوافقة مع كلتا قاعدتي البيانات.

**الحل:** تم إنشاء دالة `calculate_streak` في `apps/insights/utils.py` لحساب الـ streak بطريقة متوافقة مع SQLite و PostgreSQL.

### 3. كود حساب confidence في STT فيه bug (الـ generator بيتستهلك مرتين)

**المشكلة:** تقرير المراجعة أشار إلى أن كود حساب confidence في STT يستهلك الـ generator مرتين. تم معالجة هذه المشكلة عن طريق تحويل الـ generator إلى قائمة مرة واحدة فقط في `apps/audio/stt.py`.

**الحل:** تم تعديل دالة `transcribe` في `apps/audio/stt.py` لضمان استهلاك الـ generator مرة واحدة فقط.

### 4. تعارض في التوثيق بين settings.py و settings/base.py

**المشكلة:** تقرير المراجعة أشار إلى تعارض في التوثيق بين `settings.py` و `settings/base.py`. المشروع يستخدم بنية `config/settings/base.py`، `dev.py`، و `prod.py`، ولكن قد تكون هناك إشارات غير دقيقة في التوثيق أو الكود إلى `settings.py`.

**الحل:** تم التأكد من أن ملفات الإعدادات مقسمة بشكل صحيح. سيتم مراجعة أي إشارات في الكود أو التوثيق إلى `settings.py` وتصحيحها لتشير إلى الملفات الصحيحة (`config.settings.base` أو `config.settings.dev`/`prod` حسب السياق). لا يوجد تعارض في الإعدادات نفسها، بل في طريقة الإشارة إليها.
