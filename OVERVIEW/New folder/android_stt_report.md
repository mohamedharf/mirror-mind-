# تقرير: التحويل الصوتي في تطبيق الأندرويد (مستقبلاً)

## الوضع الحالي (الويب) ✅
الحل الحالي المُطبَّق يعتمد على **Web Speech API** — وهي واجهة مدمجة في المتصفح (Chrome/Edge) تعمل دون أي تكلفة أو موارد على السيرفر، وتدعم العربية بشكل ممتاز.

---

## المشكلة في الأندرويد

عند بناء تطبيق أندرويد، لديك عادةً خياران:

| الخيار | الوصف |
|--------|--------|
| **WebView** | تشغيل تطبيق الويب داخل إطار في الأندرويد (مثل Capacitor/Cordova) |
| **Native** | بناء تطبيق أندرويد بشكل كامل (Kotlin/Java) |

**مشكلة Web Speech API في أندرويد:**
- في **WebView** داخل Capacitor/Cordova: Web Speech API **لا تعمل** أو تعمل بشكل متقطع
- في **Chrome** على الأندرويد: تعمل ✅ لكن المستخدم يفتح متصفحاً وليس تطبيقاً
- في **Firefox** على الأندرويد: لا تعمل ❌

---

## الخيارات المتاحة للأندرويد

### 🥇 الخيار الأول: Android Speech Recognizer API (الأفضل)
**الواجهة البرمجية الرسمية من جوجل المدمجة في كل هاتف أندرويد.**

```kotlin
// مثال Kotlin
val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-EG")
intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
startActivityForResult(intent, REQUEST_CODE_SPEECH)
```

| الخاصية | التفاصيل |
|--------|----------|
| **التكلفة** | مجاني تماماً |
| **دعم العربية** | ممتاز (نفس محرك جوجل) |
| **تحميل السيرفر** | صفر — تعمل على الهاتف |
| **الإنترنت** | يحتاج إنترنت (يرسل لخوادم جوجل) |
| **الأوف لاين** | يحتاج تحميل حزمة اللغة يدوياً |
| **Streaming** | نعم، نتائج فورية |

> **ملاحظة مهمة:** هذا هو نفس المحرك الذي تستخدمه Web Speech API في Chrome — فالجودة متطابقة تماماً.

---

### 🥈 الخيار الثاني: Capacitor Speech Recognition Plugin
إذا استخدمت **Capacitor** لتحويل تطبيق الويب الحالي إلى تطبيق أندرويد (هذا هو المسار الأسهل)، يوجد plugin جاهز:

```bash
npm install @capacitor-community/speech-recognition
```

```javascript
// نفس JavaScript الحالي تقريباً!
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

await SpeechRecognition.start({
  language: 'ar-EG',
  partialResults: true,  // interim results
})

SpeechRecognition.addListener('partialResults', (data) => {
  setInterimText(data.matches[0]) // نفس منطق الكود الحالي
})
```

| الخاصية | التفاصيل |
|--------|----------|
| **التكلفة** | مجاني تماماً |
| **تعديل الكود الحالي** | بسيط جداً (استبدال Web Speech API بالـ plugin) |
| **دعم العربية** | ممتاز (يستخدم Android Speech API تحت الغطاء) |
| **iOS أيضاً** | نعم، نفس الـ plugin يدعم iOS |

---

### 🥉 الخيار الثالث: Vosk (Offline فقط)
إذا أردت عمل **أوف لاين كامل** بدون إنترنت:

```python
# Backend: تشغيل Vosk على السيرفر
from vosk import Model, KaldiRecognizer
model = Model("model-ar")  # نموذج عربي ~50MB
```

| الخاصية | التفاصيل |
|--------|----------|
| **التكلفة** | مجاني |
| **دعم العربية** | متوسط (جيد للفصحى، ضعيف للعامية) |
| **الإنترنت** | لا يحتاج |
| **تحميل السيرفر** | يحتاج CPU على السيرفر |

---

### ❌ خيار Whisper (المستبعد للإنتاج)

| السبب | التفاصيل |
|--------|----------|
| البطء | 30-60 ثانية حتى للنموذج الصغير على CPU |
| موارد السيرفر | يثقل الخادم بشكل كبير |
| Broken pipe | المتصفح يقطع الاتصال قبل الرد |
| **الخلاصة** | غير مناسب لأي بيئة إنتاج بدون GPU |

---

## 🗺️ خارطة الطريق الموصى بها

```
الآن (ويب) ──────────────────────────────────────── مستقبل (أندرويد)
     │                                                      │
Web Speech API                                    Capacitor + Plugin
(مدمج في Chrome)                         (@capacitor-community/speech-recognition)
     │                                                      │
     └──────────── نفس الجودة والمجانية ────────────────────┘
```

### المسار الأسهل للانتقال للأندرويد:

**الخطوة 1:** تحويل تطبيق الويب الحالي إلى تطبيق Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init
npx cap add android
```

**الخطوة 2:** استبدال استدعاء `window.webkitSpeechRecognition` بالـ plugin
```javascript
// منطق شرطي بسيط:
if (Capacitor.isNativePlatform()) {
  // استخدم plugin الأندرويد
  useSpeechPlugin()
} else {
  // استخدم Web Speech API الحالي (بدون تغيير)
  useWebSpeechAPI()
}
```

**الخطوة 3:** بناء التطبيق
```bash
npx cap build android
```

---

## ملخص المقارنة النهائية

| الحل | الويب | أندرويد | iOS | التكلفة | جودة العربية |
|------|-------|---------|-----|---------|------------|
| **Web Speech API (الحالي)** | ✅ | ❌ WebView | ❌ | مجاني | ممتاز |
| **Capacitor Plugin** | ✅ | ✅ | ✅ | مجاني | ممتاز |
| **Android Speech API** | ❌ | ✅ | ❌ | مجاني | ممتاز |
| **Vosk** | ✅ | ✅ | ✅ | مجاني | متوسط |
| **Gemini Audio** | ✅ | ✅ | ✅ | يستهلك حصة | ممتاز |
| **Whisper** | ❌ (بطيء) | ❌ (بطيء) | ❌ | مجاني | جيد |

> [!TIP]
> **التوصية النهائية:** عند الانتقال للأندرويد، استخدم **Capacitor** لتحويل تطبيق الويب الحالي + **@capacitor-community/speech-recognition** plugin. هذا يعني:
> - أقل تعديل ممكن على الكود الحالي
> - نفس جودة التحويل الصوتي
> - يدعم الويب + أندرويد + iOS بكود واحد
> - مجاني بالكامل بدون أي حصص

> [!NOTE]
> الكود الحالي لـ Web Speech API مكتوب بطريقة جيدة جداً وسهل التحويل لاحقاً — الـ `toggleRecord` يمكن تعديله ليدعم الحالتين (ويب/موبايل) بإضافة شرط واحد فقط.
