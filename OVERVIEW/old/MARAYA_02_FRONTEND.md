# المرايا — مواصفات الفرونت إند الكاملة
> نسخة موحدة نهائية. تشمل كل الشاشات، Design tokens، UX flows، Offline support، وPolling logic.

---

## 1. Stack

| المكوّن | الاختيار |
|---|---|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| HTTP | Axios |
| Charts | Recharts |
| PWA | vite-plugin-pwa |
| Direction | RTL — `dir="rtl"` على `<html>` |

---

## 2. Design Tokens

```css
:root {
  --bg-deep:       #0D1B2A;
  --bg-surface:    #1A2B3C;
  --bg-elevated:   #243447;

  --primary:       #2E75B6;
  --primary-light: #4A90D9;

  --text-primary:  #EAF1F8;
  --text-secondary:#8FA8C7;
  --text-muted:    #4A5F7A;

  --mood-high:     #4CAF82;
  --mood-low:      #E05C5C;
  --mood-mid:      #E8A838;

  --border:        #2A3F55;
  --divider:       #1E3048;

  --radius-sm:  8px;
  --radius-md:  16px;
  --radius-lg:  24px;
  --radius-pill:50px;

  --shadow-card: 0 2px 12px rgba(0,0,0,0.3);

  --font: 'IBM Plex Arabic', 'Cairo', Arial, sans-serif;
}
```

---

## 3. هيكل الـ Routes

```
/login          → شاشة تسجيل الدخول
/auth/callback  → معالجة JWT من الـ fragment
/               → شاشة الإدخال (الرئيسية — تُفتح دائماً بعد login)
/history        → شاشة السجل
/insights       → شاشة التحليل
/settings       → شاشة الإعدادات
```

**BottomNav** ثابت في كل الشاشات ما عدا `/login` و `/auth/callback`:
- 4 أيقونات: ✏️ كتابة | 📋 سجل | 📊 تحليل | ⚙️ إعدادات
- Active tab: `--primary` + خط 2px فوقه
- الباقي: `--text-muted`

---

## 4. JWT Handling — استخراج من Fragment

```javascript
// src/pages/AuthCallback.jsx
// يُستدعى بعد redirect من Google OAuth

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { setTokens } = useAuthStore()

  useEffect(() => {
    // الـ fragment (#access=...&refresh=...)
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const access  = params.get('access')
    const refresh = params.get('refresh')

    if (access && refresh) {
      setTokens(access, refresh)
      // امسح الـ fragment من الـ URL فوراً
      window.history.replaceState(null, '', '/auth/callback')
      navigate('/', { replace: true })
    } else {
      navigate('/login?error=auth_failed', { replace: true })
    }
  }, [])

  return <div>جارٍ تسجيل الدخول...</div>
}
```

---

## 5. Axios Instance — JWT + Refresh + Offline Queue

```javascript
// src/lib/api.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
})

// Request interceptor — أضف token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// Response interceptor — refresh عند 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${api.defaults.baseURL}/auth/token/refresh/`,
            { refresh }
          )
          localStorage.setItem('access_token', data.access)
          error.config.headers['Authorization'] = `Bearer ${data.access}`
          return api(error.config)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
```

---

## 6. Offline Queue

```javascript
// src/lib/offlineQueue.js

const QUEUE_KEY = 'maraya_offline_queue'

export function enqueue(entry) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  q.push({ ...entry, queued_at: new Date().toISOString() })
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

export async function flush(api) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  if (!q.length) return

  const failed = []
  for (const item of q) {
    try {
      await api.post('/entries/', { text: item.text, parent_id: item.parent_id })
    } catch {
      failed.push(item)
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(failed))
  return q.length - failed.length  // عدد الـ entries اللي اترفعت
}

export function getCount() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]').length
}
```

```javascript
// في Home.jsx — يُستدعى عند رجوع الـ network
useEffect(() => {
  const handleOnline = async () => {
    const synced = await flush(api)
    if (synced > 0) {
      showToast(`تمت مزامنة ${synced} إدخال محفوظ`)
      fetchTodayEntries()
    }
  }
  window.addEventListener('online', handleOnline)
  return () => window.removeEventListener('online', handleOnline)
}, [])
```

---

## 7. Polling — Exponential Backoff

```javascript
// src/lib/polling.js

export function pollEntryStatus(api, entryId, onDone, onFail) {
  let attempts = 0
  const MAX_ATTEMPTS = 10

  const check = async () => {
    attempts++
    if (attempts > MAX_ATTEMPTS) {
      onFail('analysis_timeout')
      return
    }
    try {
      const { data } = await api.get(`/entries/${entryId}/`)
      if (data.processing_status === 'done') {
        onDone(data)
      } else if (['failed', 'rate_limited'].includes(data.processing_status)) {
        onFail(data.processing_status)
      } else {
        // exponential backoff: 2s, 4s, 6s, ... max 15s
        const delay = Math.min(2000 * attempts, 15000)
        setTimeout(check, delay)
      }
    } catch {
      const delay = Math.min(2000 * attempts, 15000)
      setTimeout(check, delay)
    }
  }

  setTimeout(check, 2000)  // أول محاولة بعد ثانيتين
}
```

---

## 8. Zustand Stores

```javascript
// src/store/authStore.js
import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  accessToken:  localStorage.getItem('access_token'),
  refreshToken: localStorage.getItem('refresh_token'),
  isAuth: !!localStorage.getItem('access_token'),

  setTokens: (access, refresh) => {
    localStorage.setItem('access_token',  access)
    localStorage.setItem('refresh_token', refresh)
    set({ accessToken: access, refreshToken: refresh, isAuth: true })
  },
  logout: () => {
    localStorage.clear()
    set({ accessToken: null, refreshToken: null, isAuth: false })
  },
}))

// src/store/entryStore.js
export const useEntryStore = create((set) => ({
  todayEntries:       [],
  selectedParentId:   null,
  selectedParentText: '',
  lastReflection:     null,
  metrics:            [],
  isRecording:        false,
  isSaving:           false,

  setSelectedParent: (id, text) =>
    set({ selectedParentId: id, selectedParentText: text }),
  clearSelectedParent: () =>
    set({ selectedParentId: null, selectedParentText: '' }),
  setLastReflection: (data) => set({ lastReflection: data }),
  setMetrics: (m) => set({ metrics: m }),
  setRecording: (v) => set({ isRecording: v }),
  setSaving: (v) => set({ isSaving: v }),
}))
```

---

## 9. شاشة Login (`/login`)

```
خلفية: linear-gradient(180deg, #1F3864 0%, #0D1B2A 100%)

[مساحة فارغة علوية — 15vh]

[أيقونة مرآة دائرية 72×72px]
  border: 1.5px solid #2E75B6
  داخلها: رمز مرآة مبسط بلون #EAF1F8

[اسم "المرايا" — 36px, bold, #EAF1F8]

[جملة "مساحتك للتأمل اليومي" — 15px, #8FA8C7]

[مساحة فارغة وسطى — 35vh]  ← لا تقلّصها

[زر Google Sign-In]
  width: 85%,  max-width: 340px
  height: 56px, border-radius: 28px
  background: #FFFFFF
  أيقونة Google رسمية 24px + "الدخول بحساب Google"
  font: 16px medium, color: #3C4043
  box-shadow: 0 2px 8px rgba(0,0,0,0.2)

[نص خصوصية — 12px, #6B86A8, mt-20px]
  "بياناتك الشخصية مخزّنة بخصوصية تامة ولا تُشارك مع أي طرف"

[fixed bottom 24px]
  "نسخة تجريبية داخلية" — 11px, #4A5F7A
```

**أنيميشن:** logo fadeIn 300ms → زر fadeIn 450ms (delay 150ms)
**Reduced motion:** إلغاء كل animations لو `prefers-reduced-motion: reduce`

---

## 10. شاشة الإدخال — الرئيسية (`/`)

> يفتح التطبيق عليها دائماً. الـ textarea يأخذ focus تلقائياً.

### تخطيط الشاشة (من الأعلى للأسفل)

```
[Header]
[Reply-to Banner — مشروط]
[Textarea]
[Action Bar: mic + حفظ]
[Voice Status Bar — مشروط]
[Reflection Card — مشروط]
[Metrics Dashboard]
[قائمة أحداث اليوم]
[زر "عرض المزيد" — مشروط]
[BottomNav]
```

---

### Header
```
يسار: 🔥 7 أيام  (streak counter)     — 13px, --text-secondary
يمين: الأربعاء، ٢ يوليو               — 14px, --text-secondary
padding: 16px
خلفية شفافة + backdrop-blur عند السكرول
```

---

### Reply-to Banner (يظهر لو selectedParentId != null)
```
margin: 0 16px 12px
background: --bg-elevated
border-right: 3px solid --primary
border-radius: --radius-sm
padding: 10px 14px

يسار: زر × لإلغاء الربط  (18px, --text-muted)
يمين: أيقونة ↩ + "رد على:" + أول 60 حرف من النص الأصلي

Tap ×:
  → clearSelectedParent()
  → يختفي البانر
  → focus يرجع للـ textarea
```

---

### Textarea
```
margin: 0 16px
background: --bg-surface
border: 1.5px solid --border
border-radius: --radius-md
padding: 16px
min-height: 140px,  max-height: 40vh
font-size: 17px,  line-height: 1.7
color: --text-primary
direction: rtl,  text-align: right
placeholder: "ماذا يحدث معك الآن؟" بلون --text-muted
auto-resize: يكبر مع النص حتى max-height

Focus state:
  border-color: --primary
  box-shadow: 0 0 0 3px rgba(46,117,182,0.15)
```

---

### Action Bar
```
display: flex, justify-content: space-between, padding: 12px 16px

[زر الميكروفون — يسار]
  48×48px, دائري
  background: --bg-surface, border: 1.5px solid --border
  أيقونة mic بلون --text-secondary

  حالة التسجيل النشط:
    background: rgba(224,92,92,0.15)
    border-color: --mood-low
    أيقونة بلون --mood-low
    pulse animation: box-shadow يتمدد كل ثانية

  آلية: Toggle (ضغطة تبدأ، ضغطة تانية توقف وترسل)

[زر حفظ — يمين]
  border-radius: --radius-pill, padding: 12px 28px
  background: --primary, color: white
  font: 16px 600

  Disabled (textarea فارغ): opacity: 0.4
  حالة الحفظ: spinner بدل النص
```

---

### Voice Recording Flow

```
[أثناء التسجيل]
شريط فوق Action Bar:
  "🎙 جارٍ التسجيل..." + عداد "0:12"
  background: --bg-elevated

[بعد الإيقاف — إرسال لـ /audio/transcribe/]
  spinner في الـ textarea
  
[عند الرد]
  → الـ textarea يُملأ بالنص
  → لو confidence < 0.7:
    تحت الـ textarea: "⚠️ راجع النص قبل الحفظ" بلون --mood-mid
  → الـ textarea يبقى قابل للتعديل

[لو فشل الـ request]
  الـ textarea يبقى فارغ + رسالة "فشل التحويل، حاول مجدداً"
```

---

### منطق الحفظ

```javascript
const handleSave = async () => {
  if (!text.trim()) return
  setSaving(true)

  const payload = { text, parent_id: selectedParentId }

  // لو offline: احفظ في القائمة المحلية
  if (!navigator.onLine) {
    enqueue(payload)
    setText('')
    clearSelectedParent()
    showToast('محفوظ محلياً — سيُرفع عند عودة الإنترنت')
    setSaving(false)
    return
  }

  try {
    const { data } = await api.post('/entries/', payload)
    setText('')
    clearSelectedParent()
    addToTodayEntries(data)

    // بدء الـ polling
    pollEntryStatus(api, data.id,
      (updated) => {
        updateTodayEntry(updated)
        setLastReflection({
          reflection: updated.ai_reflection,
          mood_score: updated.mood_score,
          tags: updated.tags,
        })
        fetchTodayMetrics()  // تحديث الـ metrics cards
      },
      (reason) => {
        if (reason === 'rate_limited') {
          showToast('الذكاء الاصطناعي مشغول — سيُحلَّل لاحقاً', 'warning')
        }
      }
    )
  } catch {
    // فشل كليّ: حفظ offline
    enqueue(payload)
    showToast('حُفظ محلياً', 'info')
  } finally {
    setSaving(false)
  }
}
```

---

### Reflection Card (يظهر بعد الحفظ — يختفي عند بدء كتابة جديدة)

```
margin: 0 16px 16px
background: linear-gradient(135deg, rgba(46,117,182,0.12), rgba(46,117,182,0.05))
border: 1px solid rgba(46,117,182,0.3)
border-radius: --radius-md
padding: 14px 16px

الهيكل:
  [أيقونة مرايا صغيرة 16px + "انعكاسك"] — أعلى يسار، --primary، 12px

  [mood icon]  [mood label]     [tags كـ chips]
  ──────────────────────────────────────────
  [نص ai_reflection]

  [tag alert لو موجود]
  ⚠️ "التاج 'توتر' ظهر 4 مرات في آخر أسبوعين"
  background: rgba(232,168,56,0.1)
  border-right: 2px solid --mood-mid

mood icons:
  ≥ 3.5 → ⬆️  | 2.5-3.5 → ➡️  | < 2.5 → ⬇️

Tags chips:
  background: rgba(46,117,182,0.15)
  border-radius: 50px
  padding: 3px 10px

Animation: slideUp + fadeIn 300ms
```

---

### Metrics Dashboard

```
Header: "عاداتك اليوم" — 13px, --text-secondary, padding: 16px 16px 8px

لكل metric: كارد منفصل
  margin: 0 16px 10px
  background: --bg-surface
  border: 1px solid --border
  border-radius: --radius-md
  padding: 16px

  border-right: 3px solid [لون حسب الـ direction]

  ─────────────────────────────────────
  Direction colors (يراعي lower_is_better):
  
  الـ metric عادي (lower_is_better=false):
    up   → --mood-high (أخضر = أكثر = أحسن)
    down → --mood-low  (أحمر = أقل = أسوأ)
  
  الـ metric "أقل = أفضل" (سجاير، دواء):
    up   → --mood-low  (أحمر = أكثر = أسوأ)
    down → --mood-high (أخضر = أقل = أحسن)
  
  normal → --primary (كحلي = طبيعي)
  ─────────────────────────────────────

  هيكل الكارد:
    [اسم الـ metric]          [اليوم label]
    [الرقم الكبير + الوحدة]
    [progress bar 4px]
    [معدلك: X] [label: أقل من المعتاد ↓]

  Progress bar:
    عرضه = today_total / max(today_total, baseline_avg × 1.5) × 100%
    لون الـ fill = نفس لون الـ border-right

أول أسبوع (بدون baseline):
  بدل المعدل: "جارٍ حساب معدلك... (يوم 3 من 7)" — --text-muted
```

---

### قائمة أحداث اليوم

```
Header: "أحداث اليوم" — 13px, --text-secondary, padding: 16px 16px 8px

ترتيب: تصاعدي (الأقدم أولاً)

[إدخال مستقل]
  border-right: 2px solid --border
  border-radius: --radius-sm
  padding: 12px 14px
  margin: 0 16px 8px
  background: --bg-surface

  أعلى يمين: Timestamp (12px, --text-muted)
  أعلى يسار: أيقونة ↳ (زر الربط) + أيقونة 🔴 لو is_open_event
  وسط: Tags كـ chips صغيرة
  أسفل: أول سطرين من النص (--text-primary)

  Tap على ↳:
    1. الإدخال يُظلَّل (background: --bg-elevated)
    2. setSelectedParent(id, text)
    3. Reply-to Banner يظهر فوق الـ textarea
    4. focus ينتقل للـ textarea

[Thread — إدخال له أبناء]
  الأب يُعرض عادي
  الأبناء بـ indent:
    margin-right: 20px
    border-right: 2px solid --divider (خط رابط)
    border-radius: --radius-sm

[زر "عرض المزيد (N)"]
  يظهر لو total_today > 5
  font: 13px, color: --primary
  text-align: center, padding: 8px
  Tap: يُحمِّل الباقي في نفس المكان (لا navigation)
```

---

## 11. شاشة السجل (`/history`)

```
[Header: "السجل"]

[Search Bar]
  border-radius: --radius-pill
  placeholder: "ابحث في سجلاتك..."
  بحث في النص فقط (simple text search)

[Date Filter — شريط أفقي قابل للسكرول]
  [الكل] [يوليو] [يونيو] [مايو] ...
  المحدد: background --primary, color white
  الباقي: background --bg-surface, color --text-secondary

[قائمة مجمّعة بـ يوم]
  Header اليوم:
    يمين: التاريخ (14px, --text-primary)
    يسار: ◎ متوسط مود (ملوّن) + عدد السجلات (12px, --text-muted)
  ثم الإدخالات بنفس بنية شاشة الإدخال (threads)

Infinite Scroll:
  20 entry في المرة
  loading indicator في الأسفل
```

---

## 12. شاشة التحليل (`/insights`)

```
[Header: "تحليلاتك"]

[Mood Summary Card]
  background: linear-gradient(135deg, #1A2B3C, #243447)
  border-radius: --radius-md, margin: 16px, padding: 20px

  يمين: متوسط مود الأسبوع — 48px, ملوّن حسب القيمة
  يسار: "متوسط مودك هذا الأسبوع" + mini bar chart (7 أشرطة)

[Tabs: أسبوعي | شهري]
  active: --primary + underline 2px
  inactive: --text-muted

── التاب الأسبوعي ──

[Mood Line Chart — Recharts]
  X: أيام الأسبوع (ن ث ث أ خ ج س)
  Y: 1-5
  color: --primary
  مساحة تحت الخط: gradient شفاف
  نقاط: تُظهر القيمة عند tap

[Metrics Sparklines]
  Header: "اتجاه عاداتك"
  لكل metric: اسم + 7 أرقام صغيرة + mini sparkline

[Top Tags — Progress Bars]
  Header: "التصنيفات الأكثر"
  شغل  ████████░░  12 مرة
  توتر █████░░░░░   7 مرات

[Patterns]
  Header: "لاحظنا هذا الأسبوع"
  كل pattern في كارد: border-right: 2px solid --primary

── التاب الشهري ──

[Mood Bar Chart — أسابيع]
  مقارنة بالشهر السابق:
  +0.4 ↑ (--mood-high) أو -0.3 ↓ (--mood-low)

[Suggestions]
  Header: "اقتراحات"
  كل اقتراح: أيقونة 💡 + نص
  background: rgba(76,175,130,0.08)
  border-right: 2px solid --mood-high

[Prev Month Comparison]
  تاجز جديدة: رياضة، نوم
  تاجز اختفت: قلق_مادي
  سجلات أكثر: +5
```

---

## 13. شاشة الإعدادات (`/settings`)

```
[معلومات المستخدم]
  صورة Google avatar دائرية 56px
  الاسم (--text-primary) + البريد (--text-secondary)

[قائمة]
  📤 تصدير سجلاتي      ← (يفتح Export Modal)
  🗑 حذف جميع البيانات ← (نص --mood-low، يفتح Confirm Modal)
  🚪 تسجيل الخروج      ← (logout() + redirect /login)

  كل عنصر: padding 16px, border-bottom: 1px solid --divider

[Export Modal — Bottom Sheet]
  border-radius: 24px 24px 0 0
  background: --bg-surface
  ارتفاع: 50vh

  "تصدير سجلاتي كـ Markdown"
  من: [date picker]
  إلى: [date picker]
  [زر تصدير — --primary]
  [إلغاء — نص فقط]

  بعد الضغط على تصدير:
    const blob = new Blob([data.content], {type:'text/markdown'})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = data.filename
    a.click()
```

---

## 14. PWA Config

```javascript
// vite.config.js
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name:             'المرايا',
    short_name:       'المرايا',
    description:      'مساحتك للتأمل اليومي',
    theme_color:      '#0D1B2A',
    background_color: '#0D1B2A',
    display:          'standalone',
    orientation:      'portrait',
    start_url:        '/',
    dir:              'rtl',
    lang:             'ar',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ]
  }
})
```

---

## 15. قواعد UX (لا تُخالَف)

1. التطبيق يفتح دائماً على `/` بعد login
2. الـ textarea يأخذ focus تلقائياً عند فتح `/`
3. لا redirects بعد الحفظ — كل شيء في نفس الشاشة
4. لا dialogs وسط الشاشة — كل confirmations Bottom Sheets
5. كل النصوص `dir="rtl"` — `text-align: right` افتراضي
6. الألوان من الـ tokens فقط — لا قيم مباشرة في الكود
7. `prefers-reduced-motion: reduce` → إلغاء كل animations
8. لا `localStorage` لتخزين بيانات المستخدم (إلا offline queue) — الـ state في Zustand
