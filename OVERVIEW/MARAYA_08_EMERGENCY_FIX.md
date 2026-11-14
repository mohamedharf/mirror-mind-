# المرايا — PATCH v4: إصلاح طارئ
> مشاكل نتجت عن تطبيق PATCH v3.
> نفّذ بالترتيب الحرفي — لا تتجاوز خطوة.

---

## المشاكل المكتشفة

| # | المشكلة | الجذر |
|---|---|---|
| P1 | سجاير + سيجارة كـ metric منفصلين | الـ agent أنشأ MetricDefinition جديد بدل alias |
| P2 | التاجز والتقييم مش بيظهروا فوق كل إدخال | EntryCard لا يعرض mood_score و tags بشكل صحيح |
| P3 | التحليل مكسور | extraction prompt تعارض مع تغييرات PATCH v3 |
| P4 | الأحداث المفتوحة مش ظاهرة فوق مربع الإدخال | مكوّن مفقود في Home.jsx |

---

## STEP 1: إصلاح قاعدة البيانات (الأهم أولاً)

### 1.1 كشف التكرار وإصلاحه

```python
# [ACTION: شغّل في python manage.py shell]

from apps.entries.models import MetricDefinition, Metric

# 1. اعرض كل الـ metrics الموجودة
print("=== MetricDefinitions الحالية ===")
for m in MetricDefinition.objects.all().order_by('name'):
    print(f"  id={m.id} | name='{m.name}' | is_system={m.is_system} | aliases={m.aliases}")

# 2. ابحث عن التكرار المتوقع
duplicates = ['سيجارة', 'cigarette', 'دخان']
for dup in duplicates:
    found = MetricDefinition.objects.filter(name=dup).first()
    if found:
        print(f"\n⚠️ تكرار مكتشف: '{dup}' (id={found.id})")
```

### 1.2 دمج التكرار في الـ Canonical

```python
# [ACTION: شغّل في python manage.py shell بعد Step 1.1]

from apps.entries.models import MetricDefinition, Metric
from django.db import transaction

def merge_metric(duplicate_name: str, canonical_name: str):
    """
    يدمج metric مكرر في الـ canonical ويحوّل كل القياسات.
    """
    try:
        duplicate  = MetricDefinition.objects.get(name=duplicate_name)
        canonical  = MetricDefinition.objects.get(name=canonical_name)
    except MetricDefinition.DoesNotExist as e:
        print(f"❌ {e}")
        return

    with transaction.atomic():
        # حوّل كل الـ Metrics من الـ duplicate للـ canonical
        moved = Metric.objects.filter(definition=duplicate).update(
            definition=canonical
        )
        print(f"  ✅ نُقل {moved} قياس من '{duplicate_name}' → '{canonical_name}'")

        # أضف الاسم المكرر كـ alias في الـ canonical
        aliases = canonical.aliases or []
        if duplicate_name not in aliases:
            aliases.append(duplicate_name)
            canonical.aliases = aliases
            canonical.save(update_fields=['aliases'])
            print(f"  ✅ أُضيف '{duplicate_name}' كـ alias لـ '{canonical_name}'")

        # احذف الـ duplicate
        duplicate.delete()
        print(f"  ✅ حُذف MetricDefinition '{duplicate_name}'")

# شغّل الدمج للتكرارات الموجودة:
merge_metric('سيجارة',  'سجاير')   # الأكثر احتمالاً
merge_metric('سجارة',   'سجاير')
merge_metric('cigarette','سجاير')
merge_metric('فنجان',   'قهوة')
merge_metric('coffee',  'قهوة')

print("\n=== MetricDefinitions بعد الدمج ===")
for m in MetricDefinition.objects.all().order_by('name'):
    count = Metric.objects.filter(definition=m).count()
    print(f"  '{m.name}' | قياسات: {count} | aliases: {m.aliases}")
```

### 1.3 التأكد من الـ Seed الصحيح

```python
# [ACTION: شغّل في python manage.py shell]

from apps.entries.models import MetricDefinition

CORRECT_SEED = [
    {
        "name":      "سجاير",
        "unit":      "سيجارة",
        "category":  "habit",
        "aliases":   ["سجارة", "سيجارة", "دخان", "تدخين", "cigarette"],
        "is_system": True,
        "is_duration_based": False,
    },
    {
        "name":      "قهوة",
        "unit":      "كوب",
        "category":  "habit",
        "aliases":   ["فنجان", "اسبريسو", "كباية قهوة", "coffee", "كافيه"],
        "is_system": True,
        "is_duration_based": False,
    },
    {
        "name":      "نوم",
        "unit":      "ساعة",
        "category":  "health",
        "aliases":   ["نمت", "صحيت", "هنام", "ساعات نوم", "نايم"],
        "is_system": True,
        "is_duration_based": True,
    },
    {
        "name":      "ماء",
        "unit":      "لتر",
        "category":  "nutrition",
        "aliases":   ["مية", "شربت مية", "كوباية مية", "water"],
        "is_system": True,
        "is_duration_based": False,
    },
    {
        "name":      "رياضة",
        "unit":      "دقيقة",
        "category":  "activity",
        "aliases":   ["جري", "جيم", "تمرين", "مشي", "workout"],
        "is_system": True,
        "is_duration_based": True,
    },
    {
        "name":      "أكل",
        "unit":      "وجبة",
        "category":  "nutrition",
        "aliases":   ["غدا", "غداء", "عشا", "عشاء", "فطار", "فطور", "وجبة"],
        "is_system": True,
        "is_duration_based": False,
    },
    {
        "name":      "شاي",
        "unit":      "كوب",
        "category":  "habit",
        "aliases":   ["كباية شاي", "شاي أخضر", "tea"],
        "is_system": True,
        "is_duration_based": False,
    },
    {
        "name":      "دواء",
        "unit":      "جرعة",
        "category":  "health",
        "aliases":   ["حبة", "علاج", "دوا", "أقراص", "medicine"],
        "is_system": True,
        "is_duration_based": False,
    },
    {
        "name":      "عمل",
        "unit":      "ساعة",
        "category":  "activity",
        "aliases":   ["شغل", "اشتغلت", "هشتغل", "بشتغل", "جلسة عمل", "work"],
        "is_system": True,
        "is_duration_based": True,
    },
]

print("=== تحديث الـ Seed ===")
for m in CORRECT_SEED:
    obj, created = MetricDefinition.objects.get_or_create(
        name=m['name'],
        defaults=m
    )
    if not created:
        # تحديث الـ aliases فقط بدون مسح البيانات
        obj.aliases            = m['aliases']
        obj.is_system          = True
        obj.is_duration_based  = m.get('is_duration_based', False)
        obj.save(update_fields=['aliases', 'is_system', 'is_duration_based'])
        print(f"  🔄 محدّث: {obj.name}")
    else:
        print(f"  ✅ جديد: {obj.name}")
```

---

## STEP 2: إصلاح الـ Extraction Prompt

```python
# [FILE: apps/entries/ai.py]
# [ACTION: استبدل EXTRACTION_SYSTEM و EXTRACTION_USER_OPTIMIZED كاملاً]

EXTRACTION_SYSTEM = """استخرج بيانات منظمة من نص يومي. أجب فقط بـ JSON صالح بدون أي نص إضافي."""

EXTRACTION_USER_OPTIMIZED = """
النص:
{text}

الـ Metrics المعرّفة — استخدم الاسم الرسمي بالضبط (العمود الأول):
{metrics_definitions}

التاجز الأخيرة للمستخدم (للاتساق):
{recent_tags}

قواعد استخراج الـ metrics:
- لو ذُكر الـ unit أو alias بدون عدد → value = 1 (مثال: "سجرت سيجارة" → سجاير, 1)
- لو ذُكر عدد → استخدمه (مثال: "شربت 3 كبايات" → قهوة, 3)
- لو مفيش unit ولا عدد → لا تُضف
- لو metric جديد مش في القائمة → is_new: true

أجب بـ JSON فقط:
{{
  "metrics": [
    {{"name": "الاسم الرسمي من القائمة", "value": رقم, "unit": "الوحدة", "is_new": false}}
  ],
  "mood_score": رقم من 1.0 إلى 5.0,
  "tags": ["كلمة1", "كلمة2"],
  "entry_type": "routine أو event أو reflection",
  "entities": {{"أشخاص": [], "مشاريع": [], "أماكن": []}},
  "reflection": "جملة وصفية واحدة",
  "is_open_event": true أو false
}}

تعريف mood_score:
1.0-1.9 = سلبي جداً | 2.0-2.9 = سلبي | 3.0-3.4 = محايد | 3.5-4.4 = إيجابي | 4.5-5.0 = إيجابي جداً

tags = أحداث ومشاعر فقط (مش العادات — دي في metrics)
is_open_event = true لو الحدث بدأ ولم يكتمل
"""
```

---

## STEP 3: إصلاح EntryCard — عرض التاجز والتقييم

```jsx
// [FILE: src/components/EntryCard.jsx]
// [ACTION: استبدل الملف كاملاً]

import { useState } from 'react'

const TYPE_BADGE = {
  routine:    { label: 'اعتيادي', bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' },
  event:      { label: 'حدث',    bg: 'rgba(46,117,182,0.15)',   color: 'var(--primary)'    },
  reflection: { label: 'تأمل',   bg: 'rgba(76,175,130,0.1)',    color: 'var(--mood-high)'  },
}

const MOOD_CONFIG = (score) => {
  if (!score) return null
  if (score >= 4.0) return { icon: '⬆️', color: 'var(--mood-high)', label: score.toFixed(1) }
  if (score >= 2.5) return { icon: '➡️', color: 'var(--mood-mid)',  label: score.toFixed(1) }
  return               { icon: '⬇️', color: 'var(--mood-low)',  label: score.toFixed(1) }
}

export default function EntryCard({
  entry,
  onLinkClick,
  onEntryUpdated,
  isChild = false,
}) {
  const [expanded, setExpanded] = useState(false)

  const isPending = ['pending', 'processing'].includes(entry.processing_status)
  const isFailed  = ['failed', 'rate_limited'].includes(entry.processing_status)
  const mood      = MOOD_CONFIG(entry.mood_score)
  const badge     = TYPE_BADGE[entry.entry_type] || TYPE_BADGE.event

  const timeStr = new Date(entry.created_at).toLocaleTimeString('ar-EG', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      onClick={() => !isPending && setExpanded(e => !e)}
      style={{
        background:   'var(--bg-surface)',
        border:       '1px solid var(--border)',
        borderRight:  entry.is_open_event
          ? '3px solid var(--mood-low)'
          : isChild
            ? '2px solid var(--divider)'
            : '2px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding:      '10px 14px',
        margin:       isChild ? '4px 0 4px 20px' : '0 16px 8px',
        cursor:       'pointer',
        transition:   'background 150ms',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
    >

      {/* ── ROW 1: وقت + نوع + ربط ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 6,
      }}>

        {/* يمين: الوقت */}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {timeStr}
        </span>

        {/* يسار: badges + زرار ربط */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* entry_type badge */}
          <span style={{
            fontSize: 10, padding: '1px 7px',
            borderRadius: 50, fontWeight: 500,
            background: badge.bg, color: badge.color,
          }}>
            {badge.label}
          </span>

          {/* open event badge */}
          {entry.is_open_event && (
            <span style={{ fontSize: 10, color: 'var(--mood-low)' }}>
              🔴 مفتوح
            </span>
          )}

          {/* زرار الربط */}
          <button
            onClick={e => { e.stopPropagation(); onLinkClick?.(entry) }}
            title="ربط إدخال تابع"
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-muted)', fontSize: 15,
              cursor: 'pointer', padding: '0 2px',
              lineHeight: 1,
            }}
          >↳</button>
        </div>
      </div>

      {/* ── ROW 2: Mood + Tags (يظهر دايماً لو البيانات موجودة) ── */}
      {!isPending && (mood || entry.tags?.length > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center',
          flexWrap: 'wrap', gap: 4, marginBottom: 6,
        }}>
          {/* Mood Score */}
          {mood && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 12, color: mood.color, fontWeight: 600,
              background: `${mood.color}15`,
              padding: '2px 8px', borderRadius: 50,
              flexShrink: 0,
            }}>
              {mood.icon} {mood.label}
            </span>
          )}

          {/* Tags */}
          {(entry.tags || []).slice(0, 4).map(tag => (
            <span key={tag} style={{
              fontSize: 11, padding: '2px 8px',
              borderRadius: 50,
              background: 'rgba(46,117,182,0.12)',
              color: 'var(--primary)',
            }}>
              {tag}
            </span>
          ))}

          {/* عدد التاجز المخفية */}
          {entry.tags?.length > 4 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              +{entry.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* ── ROW 3: النص ── */}
      {isPending ? (
        <SkeletonRows />
      ) : (
        <p style={{
          fontSize: 14, color: 'var(--text-primary)',
          lineHeight: 1.65, margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 2,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
        }}>
          {entry.text}
        </p>
      )}

      {/* ── Expanded: entities + metrics ── */}
      {expanded && !isPending && (
        <div style={{ marginTop: 8 }}>
          {/* Entities */}
          <EntitiesChips entities={entry.entities} />

          {/* Metrics المستخرجة */}
          {entry.metrics?.length > 0 && (
            <div style={{
              marginTop: 6, display: 'flex',
              flexWrap: 'wrap', gap: 4,
            }}>
              {entry.metrics.map(m => (
                <span key={m.id} style={{
                  fontSize: 11, padding: '2px 8px',
                  borderRadius: 50,
                  background: 'rgba(76,175,130,0.1)',
                  color: 'var(--mood-high)',
                }}>
                  {m.definition?.name}: {m.value} {m.definition?.unit}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Failed State ── */}
      {isFailed && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--mood-low)' }}>
            فشل التحليل —{' '}
          </span>
          <button
            onClick={e => { e.stopPropagation(); handleRetry(entry.id, onEntryUpdated) }}
            style={{
              background: 'none', border: 'none',
              color: 'var(--primary)', fontSize: 11,
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
    </div>
  )
}

/* Skeleton أثناء التحليل */
function SkeletonRows() {
  return (
    <div>
      <div style={{
        height: 12, borderRadius: 6, marginBottom: 8, width: '55%',
        background: 'linear-gradient(90deg,var(--bg-surface),var(--bg-elevated),var(--bg-surface))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite linear',
      }} />
      <div style={{
        height: 13, borderRadius: 6, width: '100%',
        background: 'linear-gradient(90deg,var(--bg-surface),var(--bg-elevated),var(--bg-surface))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite linear',
      }} />
    </div>
  )
}

/* Entities Chips */
function EntitiesChips({ entities }) {
  if (!entities) return null
  const sections = [
    { key: 'أشخاص',  icon: '👤' },
    { key: 'مشاريع', icon: '📁' },
    { key: 'أماكن',  icon: '📍' },
  ]
  const items = sections.flatMap(s =>
    (entities[s.key] || []).map(v => ({ icon: s.icon, value: v }))
  )
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {items.map(({ icon, value }) => (
        <span key={value} style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 50,
          background: 'rgba(255,255,255,0.06)',
          color: 'var(--text-muted)',
        }}>
          {icon} {value}
        </span>
      ))}
    </div>
  )
}

/* Retry helper */
async function handleRetry(entryId, onEntryUpdated) {
  try {
    const { default: api } = await import('../lib/api')
    await api.post(`/entries/${entryId}/retry_analysis/`)
    const { pollEntryStatus } = await import('../lib/polling')
    pollEntryStatus(api, entryId, onEntryUpdated, () => {})
  } catch (e) {
    console.error('Retry failed', e)
  }
}
```

---

## STEP 4: عرض الأحداث المفتوحة فوق مربع الإدخال

```jsx
// [FILE: src/components/OpenEventsBanner.jsx]
// [ACTION: أنشئ هذا المكون]

import { useState, useEffect } from 'react'
import api from '../lib/api'

export default function OpenEventsBanner({ onClose }) {
  const [openEvents, setOpenEvents] = useState([])

  useEffect(() => {
    fetchOpenEvents()
  }, [])

  const fetchOpenEvents = async () => {
    try {
      // جلب إدخالات اليوم وفلترة المفتوحة
      const { data } = await api.get('/entries/today/')
      const open = (data.entries || []).filter(
        e => e.is_open_event && !e.children?.length
      )
      setOpenEvents(open)
    } catch {}
  }

  if (!openEvents.length) return null

  return (
    <div style={{ margin: '0 16px 10px' }}>
      {openEvents.map(event => (
        <OpenEventItem
          key={event.id}
          event={event}
          onClosed={() => {
            setOpenEvents(prev => prev.filter(e => e.id !== event.id))
            onClose?.()
          }}
        />
      ))}
    </div>
  )
}

function OpenEventItem({ event, onClosed }) {
  const [closing, setClosing] = useState(false)

  const timeStr = new Date(event.created_at).toLocaleTimeString('ar-EG', {
    hour: '2-digit', minute: '2-digit',
  })

  // حساب المدة من بداية الحدث حتى الآن
  const durationMs = Date.now() - new Date(event.created_at).getTime()
  const durationH  = durationMs / 3600000
  const hours      = Math.floor(durationH)
  const minutes    = Math.round((durationH - hours) * 60)
  const durationStr = hours > 0
    ? `${hours}س ${minutes}د`
    : `${minutes} دقيقة`

  const handleClose = async () => {
    setClosing(true)
    try {
      // إرسال entry إغلاق تلقائي
      await api.post('/entries/', {
        text:      `تم إغلاق: ${event.text.slice(0, 50)}`,
        parent_id: event.id,
      })
      // تحديث الـ entry المفتوح
      await api.patch(`/entries/${event.id}/`, { is_open_event: false })
      onClosed?.()
    } catch {
      setClosing(false)
    }
  }

  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      background:   'rgba(224,92,92,0.08)',
      border:       '1px solid rgba(224,92,92,0.3)',
      borderRadius: 'var(--radius-sm)',
      padding:      '8px 12px',
      marginBottom: 6,
    }}>
      {/* معلومات الحدث */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2,
        }}>
          <span style={{ fontSize: 11, color: 'var(--mood-low)' }}>🔴</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            بدأ {timeStr} — منذ {durationStr}
          </span>
        </div>
        <p style={{
          fontSize: 13, color: 'var(--text-secondary)',
          margin: 0, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {event.text}
        </p>
      </div>

      {/* زرار الإغلاق */}
      <button
        onClick={handleClose}
        disabled={closing}
        style={{
          flexShrink:   0,
          marginRight:  8,
          padding:      '5px 12px',
          borderRadius: 'var(--radius-pill)',
          border:       '1px solid var(--mood-low)',
          background:   'transparent',
          color:        'var(--mood-low)',
          fontSize:     12,
          cursor:       closing ? 'not-allowed' : 'pointer',
          opacity:      closing ? 0.6 : 1,
        }}
      >
        {closing ? '⏳' : 'إغلاق'}
      </button>
    </div>
  )
}
```

```jsx
// [FILE: src/pages/Home.jsx]
// [ACTION: أضف OpenEventsBanner فوق الـ Reply-to Banner]

import OpenEventsBanner from '../components/OpenEventsBanner'

// في الـ JSX، بعد الـ Header مباشرة:
<OpenEventsBanner
  onClose={() => {
    fetchTodayEntries()   // تحديث القائمة
    fetchTodayMetrics()   // تحديث الـ metrics
  }}
/>

// ثم Reply-to Banner
// ثم Textarea
// إلخ...
```

---

## STEP 5: إصلاح API Entry لإرجاع Metrics مع كل Entry

```python
# [FILE: apps/entries/serializers.py]
# [ACTION: تأكد من وجود MetricSerializer وأنه مضمّن في EntrySerializer]

from rest_framework import serializers
from .models import Entry, Metric

class MetricInlineSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='definition.name', read_only=True)
    unit = serializers.CharField(source='definition.unit', read_only=True)
    is_duration_based = serializers.BooleanField(
        source='definition.is_duration_based', read_only=True
    )

    class Meta:
        model  = Metric
        fields = ['id', 'name', 'value', 'unit', 'is_duration_based', 'recorded_at']


class EntrySerializer(serializers.ModelSerializer):
    metrics  = MetricInlineSerializer(many=True, read_only=True)
    children = serializers.SerializerMethodField()

    class Meta:
        model  = Entry
        fields = [
            'id', 'text', 'created_at', 'updated_at',
            'parent_id', 'mood_score', 'tags', 'entities',
            'ai_reflection', 'entry_type', 'is_open_event',
            'processing_status', 'metrics', 'children',
        ]
        read_only_fields = [
            'mood_score', 'tags', 'entities', 'ai_reflection',
            'entry_type', 'is_open_event', 'processing_status',
            'metrics',
        ]

    def get_children(self, obj):
        children = obj.children.all().prefetch_related('metrics__definition')
        return EntrySerializer(children, many=True, context=self.context).data

    def validate_parent(self, parent):
        if parent is None:
            return parent
        if parent.parent_id is not None:
            raise serializers.ValidationError(
                "لا يمكن الربط بإدخال تابع — الحد الأقصى مستوى واحد."
            )
        request = self.context.get('request')
        if request and parent.user_id != request.user.id:
            raise serializers.ValidationError("إدخال غير موجود.")
        return parent
```

```python
# [FILE: apps/entries/views.py]
# [ACTION: تأكد من prefetch_related في get_queryset]

class EntryViewSet(UserScopedViewSet):
    queryset         = Entry.objects.all()
    serializer_class = EntrySerializer

    def get_queryset(self):
        return Entry.objects.filter(
            user=self.request.user
        ).prefetch_related(
            'children__metrics__definition',
            'metrics__definition',
        ).select_related('parent').order_by('-created_at')
```

---

## STEP 6: إصلاح TodayMetricsView لإرجاع is_duration_based

```python
# [FILE: apps/entries/views.py]
# [ACTION: عدّل TodayMetricsView]

class TodayMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date
        from django.db.models import Sum
        today = date.today()
        user  = request.user

        today_totals = Metric.objects.filter(
            user=user,
            recorded_at__date=today
        ).values(
            'definition__name',
            'definition__unit',
            'definition__is_duration_based',
        ).annotate(total=Sum('value'))

        result = []
        for row in today_totals:
            name     = row['definition__name']
            total    = row['total'] or 0
            is_dur   = row['definition__is_duration_based']

            try:
                baseline = MetricBaseline.objects.get(
                    user=user, definition__name=name
                )
                avg = baseline.daily_avg
                dev = ((total - avg) / avg * 100) if avg > 0 else 0
            except MetricBaseline.DoesNotExist:
                avg = None
                dev = None

            result.append({
                'name':               name,
                'unit':               row['definition__unit'],
                'today_total':        round(total, 1),
                'baseline_avg':       round(avg, 1) if avg else None,
                'deviation_pct':      round(dev, 1) if dev is not None else None,
                'direction':          get_direction(name, dev),
                'lower_is_better':    name in LOWER_IS_BETTER,
                'label':              get_label(name, get_direction(name, dev), dev),
                'is_duration_based':  is_dur,
            })

        return Response({'date': today, 'metrics': result})
```

---

## STEP 7: اختبار شامل بعد التنفيذ

```bash
# 1. تحقق من الـ MetricDefinitions بعد الإصلاح
python manage.py shell -c "
from apps.entries.models import MetricDefinition, Metric
print('=== MetricDefinitions ===')
for m in MetricDefinition.objects.all():
    count = Metric.objects.filter(definition=m).count()
    print(f'{m.name} | {count} قياسات | aliases: {m.aliases[:3]}')
"

# 2. اختبر استخراج القهوة
# اكتب في التطبيق: "بشرب فنجان قهوه"
# انتظر 10 ثواني
# يجب: Metric(قهوة, 1.0) ظاهر في الـ card

# 3. اختبر التاجز والتقييم
# اكتب: "اليوم كان فيه اجتماع صعب وحسيت بتوتر"
# انتظر
# يجب: فوق النص يظهر:  ⬇️ 2.3  |  اجتماع  |  توتر

# 4. اختبر الأحداث المفتوحة
# اكتب: "هبداء في الشغل"
# يجب: فوق مربع الإدخال يظهر banner أحمر "بدأ XX:XX — منذ X دقيقة" + زرار إغلاق
```

---

## ملخص الترتيب

```
STEP 1  → python manage.py shell  (دمج التكرارات + تصحيح الـ seed)
STEP 2  → apps/entries/ai.py      (إصلاح الـ prompt)
STEP 3  → src/components/EntryCard.jsx      (عرض التاجز والتقييم)
STEP 4  → src/components/OpenEventsBanner.jsx + Home.jsx
STEP 5  → apps/entries/serializers.py + views.py  (metrics في كل entry)
STEP 6  → apps/entries/views.py TodayMetricsView
STEP 7  → اختبار شامل
```

> ⚠️ ملاحظة مهمة: لا تشغّل أي migration في هذا الـ patch إلا لو STEP 1 أضاف حقل `is_duration_based` ناقص. لو الحقل موجود من PATCH v3 → تخطّى الـ migration.
