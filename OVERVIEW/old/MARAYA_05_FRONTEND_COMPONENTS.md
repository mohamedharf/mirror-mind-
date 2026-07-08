# المرايا — مواصفات المكونات الكاملة + صفحة العادات
> ملف تنفيذي للـ agent. يغطي كل مكون UI بكوده الكامل، كل animation، وصفحة العادات الجديدة.
> يُقرأ بعد MARAYA_02_FRONTEND.md ويُكمله — لا يتعارض معه.

---

## 0. Backend Coverage Audit — ما ليس له frontend بعد

| Backend Endpoint / Data | الحالة | الحل في هذا الملف |
|---|---|---|
| `entry.entry_type` (routine/event/reflection) | ❌ مش معروض | Badge على Entry Card |
| `entry.entities` (أشخاص/مشاريع/أماكن) | ❌ مش معروض | Chips في Reflection Card |
| `entry.is_open_event` | ❌ مش معروض | Badge أحمر على Entry Card |
| `entry.processing_status` | ❌ مش معروض | Skeleton loader |
| `daily_reflection.summary` | ❌ مش معروض | Daily Card |
| `daily_reflection.tag_alerts` | ❌ مش معروض | Alert Banner في Insights |
| `metrics.lower_is_better` | ❌ لون غلط | عكس الألوان حسب النوع |
| `weekly_insight.metrics_summary` | ❌ مش معروض | Sparklines في Insights |
| `monthly_insight.prev_month_comparison` | ❌ مش معروض | Comparison Card |
| `GET /metrics/definitions/` | ❌ مش معروض | صفحة العادات الجديدة |
| `GET /metrics/history/` | ❌ مش معروض | صفحة العادات الجديدة |
| Offline queue count | ❌ مش معروض | Badge على زرار الحفظ |
| Streak counter | ❌ مش موجود | Header في Home |

---

## 1. CSS Animations (src/styles/animations.css)

```css
/* ── Shimmer (skeleton loader) ──────────────────── */
@keyframes shimmer {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}
.shimmer {
  background: linear-gradient(
    90deg,
    var(--bg-surface) 25%,
    var(--bg-elevated) 50%,
    var(--bg-surface) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}

/* ── Pulse (mic recording) ──────────────────────── */
@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0px rgba(224,92,92,0.5); }
  70%  { box-shadow: 0 0 0 14px rgba(224,92,92,0); }
  100% { box-shadow: 0 0 0 0px rgba(224,92,92,0); }
}
.pulse-recording { animation: pulse-ring 1.2s infinite; }

/* ── Fade + Slide ────────────────────────────────── */
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes popIn {
  0%   { opacity: 0; transform: scale(0.8); }
  70%  { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

.animate-slide-down { animation: slideDown 250ms ease-out forwards; }
.animate-slide-up   { animation: slideUp  300ms ease-out forwards; }
.animate-fade-in    { animation: fadeIn   200ms ease-out forwards; }
.animate-pop-in     { animation: popIn    400ms cubic-bezier(.175,.885,.32,1.275) forwards; }

/* ── Stagger helper ──────────────────────────────── */
.stagger-1 { animation-delay: 50ms;  }
.stagger-2 { animation-delay: 100ms; }
.stagger-3 { animation-delay: 150ms; }
.stagger-4 { animation-delay: 200ms; }
.stagger-5 { animation-delay: 250ms; }

/* ── Reduced motion ──────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
}
```

---

## 2. useCounter Hook (للأرقام المتحركة)

```javascript
// src/hooks/useCounter.js
import { useState, useEffect, useRef } from 'react'

export function useCounter(target, duration = 600) {
  const [value, setValue] = useState(0)
  const startTime = useRef(null)
  const startValue = useRef(0)

  useEffect(() => {
    if (target === 0) { setValue(0); return }
    startValue.current = value
    startTime.current  = performance.now()

    const animate = (now) => {
      const elapsed  = now - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(startValue.current + (target - startValue.current) * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [target])

  return value
}
```

---

## 3. EntryCard Component

```jsx
// src/components/EntryCard.jsx
import { useState } from 'react'

const TYPE_BADGE = {
  routine:    { label: 'اعتيادي', bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' },
  event:      { label: 'حدث',    bg: 'rgba(46,117,182,0.15)',  color: 'var(--primary)' },
  reflection: { label: 'تأمل',   bg: 'rgba(76,175,130,0.1)',  color: 'var(--mood-high)' },
}

const MOOD_DISPLAY = (score) => {
  if (!score) return { icon: '➡️', label: 'غير محدد', color: 'var(--text-muted)' }
  if (score >= 4.0) return { icon: '⬆️', label: 'جيد',  color: 'var(--mood-high)' }
  if (score >= 2.5) return { icon: '➡️', label: 'عادي', color: 'var(--mood-mid)'  }
  return              { icon: '⬇️', label: 'صعب',  color: 'var(--mood-low)'  }
}

export default function EntryCard({ entry, onLinkClick, isChild = false }) {
  const [expanded, setExpanded] = useState(false)
  const mood   = MOOD_DISPLAY(entry.mood_score)
  const badge  = TYPE_BADGE[entry.entry_type] || TYPE_BADGE.event
  const isPending = ['pending', 'processing'].includes(entry.processing_status)

  return (
    <div
      className="animate-slide-down"
      style={{
        background:   'var(--bg-surface)',
        border:       `1px solid var(--border)`,
        borderRight:  entry.is_open_event ? '3px solid var(--mood-low)' : '2px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding:      '12px 14px',
        margin:       isChild ? '4px 0 4px 20px' : '0 16px 8px',
        borderLeft:   isChild ? '2px solid var(--divider)' : undefined,
        cursor:       'pointer',
        transition:   'background 200ms',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* ── Row 1: Meta ── */}
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {/* زرار الربط */}
          <button
            onClick={(e) => { e.stopPropagation(); onLinkClick(entry) }}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer',
              padding: '0 4px',
            }}
            title="ربط إدخال تابع"
          >↳</button>

          {/* entry_type badge */}
          <span style={{
            fontSize: 11, padding: '2px 8px',
            borderRadius: 50, fontWeight: 500,
            background: badge.bg, color: badge.color,
          }}>
            {badge.label}
          </span>

          {/* open event badge */}
          {entry.is_open_event && !entry.children?.length && (
            <span style={{ fontSize: 11, color: 'var(--mood-low)' }}>🔴 مفتوح</span>
          )}
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(entry.created_at).toLocaleTimeString('ar-EG', {
            hour:'2-digit', minute:'2-digit'
          })}
        </span>
      </div>

      {/* ── Skeleton أو المحتوى ── */}
      {isPending ? (
        <SkeletonContent />
      ) : (
        <>
          {/* Tags */}
          {entry.tags?.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
              {entry.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 12, padding: '2px 8px',
                  borderRadius: 50,
                  background: 'rgba(46,117,182,0.12)',
                  color: 'var(--primary)',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* النص */}
          <p style={{
            fontSize: 15, color: 'var(--text-primary)',
            lineHeight: 1.6, margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
            overflow: expanded ? 'visible' : 'hidden',
          }}>
            {entry.text}
          </p>

          {/* Entities (لما expanded) */}
          {expanded && entry.entities && (
            <EntitiesDisplay entities={entry.entities} />
          )}

          {/* Mood (لما expanded) */}
          {expanded && entry.mood_score && (
            <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color: mood.color }}>{mood.icon}</span>
              <span style={{ fontSize:12, color: mood.color }}>{mood.label}</span>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                ({entry.mood_score?.toFixed(1)}/5)
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* Skeleton أثناء التحليل */
function SkeletonContent() {
  return (
    <div>
      <div className="shimmer" style={{
        height: 12, borderRadius: 6, marginBottom: 8, width: '60%'
      }} />
      <div className="shimmer" style={{
        height: 14, borderRadius: 6, marginBottom: 6, width: '100%'
      }} />
      <div className="shimmer" style={{
        height: 14, borderRadius: 6, width: '75%'
      }} />
    </div>
  )
}

/* Entities Chips */
function EntitiesDisplay({ entities }) {
  const sections = [
    { key: 'أشخاص',  icon: '👤', color: 'rgba(255,255,255,0.08)' },
    { key: 'مشاريع', icon: '📁', color: 'rgba(46,117,182,0.15)'  },
    { key: 'أماكن',  icon: '📍', color: 'rgba(76,175,130,0.12)'  },
  ]
  const hasAny = sections.some(s => entities[s.key]?.length > 0)
  if (!hasAny) return null

  return (
    <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:4 }}>
      {sections.map(({ key, icon, color }) =>
        (entities[key] || []).map(item => (
          <span key={`${key}-${item}`} style={{
            fontSize: 11, padding: '2px 8px',
            borderRadius: 50, background: color,
            color: 'var(--text-secondary)',
          }}>
            {icon} {item}
          </span>
        ))
      )}
    </div>
  )
}
```

---

## 4. ReflectionCard Component

```jsx
// src/components/ReflectionCard.jsx

export default function ReflectionCard({ data, onDismiss }) {
  if (!data) return null
  const { reflection, mood_score, tags, entities, tag_alerts } = data
  const mood = MOOD_DISPLAY(mood_score)

  return (
    <div
      className="animate-slide-up"
      style={{
        margin:        '0 16px 16px',
        background:    'linear-gradient(135deg,rgba(46,117,182,0.1),rgba(46,117,182,0.04))',
        border:        '1px solid rgba(46,117,182,0.25)',
        borderRadius:  'var(--radius-md)',
        padding:       '14px 16px',
        position:      'relative',
      }}
    >
      {/* Header */}
      <div style={{
        display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:10,
      }}>
        <span style={{ fontSize:12, color:'var(--primary)', fontWeight:500 }}>
          🪞 انعكاسك
        </span>
        <button
          onClick={onDismiss}
          style={{ background:'none', border:'none',
            color:'var(--text-muted)', cursor:'pointer', fontSize:16 }}
        >×</button>
      </div>

      {/* Mood + Tags Row */}
      <div style={{ display:'flex', alignItems:'center',
        justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }} className="animate-pop-in">
          <span style={{ fontSize:20 }}>{mood.icon}</span>
          <span style={{ fontSize:13, color: mood.color, fontWeight:500 }}>
            {mood.label}
          </span>
          {mood_score && (
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {mood_score.toFixed(1)}/5
            </span>
          )}
        </div>

        {/* Tags staggered */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, justifyContent:'flex-end' }}>
          {(tags || []).slice(0, 4).map((tag, i) => (
            <span
              key={tag}
              className={`animate-fade-in stagger-${i + 1}`}
              style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 50,
                background: 'rgba(46,117,182,0.15)', color: 'var(--primary)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height:1, background:'var(--divider)', margin:'8px 0' }} />

      {/* Reflection text */}
      {reflection && (
        <p style={{
          fontSize: 14, color:'var(--text-secondary)',
          lineHeight: 1.7, margin:'8px 0',
        }}>
          {reflection}
        </p>
      )}

      {/* Entities */}
      {entities && <EntitiesDisplay entities={entities} />}

      {/* Tag Alerts */}
      {(tag_alerts || []).map((alert, i) => (
        <div
          key={i}
          className="animate-slide-up"
          style={{
            marginTop: 8, padding: '8px 12px',
            background: 'rgba(232,168,56,0.08)',
            borderRight: '2px solid var(--mood-mid)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12, color: 'var(--mood-mid)',
            animationDelay: `${300 + i * 100}ms`,
          }}
        >
          ⚠️ {alert.message}
        </div>
      ))}
    </div>
  )
}
```

---

## 5. MetricCard Component

```jsx
// src/components/MetricCard.jsx
import { useCounter } from '../hooks/useCounter'
import { useEffect, useState } from 'react'

const LOWER_IS_BETTER = new Set(['سجاير', 'دواء'])

function getAccentColor(name, direction) {
  const lib = LOWER_IS_BETTER.has(name)
  if (direction === 'normal' || direction === 'no_baseline') return 'var(--primary)'
  if (direction === 'up')   return lib ? 'var(--mood-low)' : 'var(--mood-high)'
  if (direction === 'down') return lib ? 'var(--mood-high)' : 'var(--mood-low)'
  return 'var(--primary)'
}

export default function MetricCard({ metric, index }) {
  const [barWidth, setBarWidth] = useState(0)
  const animatedValue = useCounter(Math.round(metric.today_total || 0), 600)

  // Progress bar animation
  const targetWidth = metric.baseline_avg
    ? Math.min((metric.today_total / (metric.baseline_avg * 1.5)) * 100, 100)
    : Math.min(metric.today_total * 10, 100)

  useEffect(() => {
    const timer = setTimeout(() => setBarWidth(targetWidth), 200 + index * 80)
    return () => clearTimeout(timer)
  }, [targetWidth])

  const accent = getAccentColor(metric.name, metric.direction)

  return (
    <div
      className="animate-fade-in"
      style={{
        margin:        `0 16px ${index === 0 ? 10 : 8}px`,
        background:    'var(--bg-surface)',
        border:        '1px solid var(--border)',
        borderRight:   `3px solid ${accent}`,
        borderRadius:  'var(--radius-md)',
        padding:       '14px 16px',
        animationDelay: `${index * 80}ms`,
        transition:    'border-right-color 400ms ease',
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>
          {metric.name}
        </span>
        <span style={{
          fontSize: 11, padding:'2px 8px', borderRadius:50,
          background: `${accent}22`, color: accent, fontWeight:500,
        }}>
          {metric.label || 'اليوم'}
        </span>
      </div>

      {/* الرقم الكبير */}
      <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:10 }}>
        <span style={{ fontSize:32, fontWeight:700, color:'var(--text-primary)' }}>
          {animatedValue}
        </span>
        <span style={{ fontSize:14, color:'var(--text-secondary)' }}>
          {metric.unit}
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{
        height:4, background:'var(--bg-elevated)',
        borderRadius:2, overflow:'hidden', marginBottom:6,
      }}>
        <div style={{
          height:'100%', borderRadius:2,
          background: accent,
          width: `${barWidth}%`,
          transition: 'width 800ms cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>

      {/* Baseline */}
      <div style={{ fontSize:12, color:'var(--text-muted)' }}>
        {metric.direction === 'no_baseline' ? (
          <span>جارٍ حساب معدلك... ({Math.min(metric.sample_days || 0, 7)} من 7 أيام)</span>
        ) : (
          <span>معدلك: {metric.baseline_avg?.toFixed(1)} {metric.unit}</span>
        )}
      </div>
    </div>
  )
}
```

---

## 6. VoiceButton Component

```jsx
// src/components/VoiceButton.jsx
import { useState, useRef } from 'react'
import api from '../lib/api'

export default function VoiceButton({ onTranscribed, onError }) {
  const [state, setState] = useState('idle') // idle | recording | processing
  const [duration, setDuration] = useState(0)
  const mediaRecorder = useRef(null)
  const chunks        = useRef([])
  const timer         = useRef(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream,
        { mimeType: 'audio/webm' })
      chunks.current = []

      mediaRecorder.current.ondataavailable = (e) => chunks.current.push(e.data)
      mediaRecorder.current.onstop = handleStop

      mediaRecorder.current.start()
      setState('recording')
      setDuration(0)
      timer.current = setInterval(() => setDuration(d => d + 1), 1000)

      // حد أقصى 60 ثانية
      setTimeout(() => {
        if (mediaRecorder.current?.state === 'recording') stopRecording()
      }, 60000)
    } catch {
      onError?.('لا يمكن الوصول للميكروفون')
    }
  }

  const stopRecording = () => {
    clearInterval(timer.current)
    mediaRecorder.current?.stop()
    mediaRecorder.current?.stream.getTracks().forEach(t => t.stop())
  }

  const handleStop = async () => {
    setState('processing')
    const blob = new Blob(chunks.current, { type:'audio/webm' })
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')

    try {
      const { data } = await api.post('/audio/transcribe/', form)
      onTranscribed(data.text, data.confidence)
    } catch {
      onError?.('فشل التحويل — حاول مجدداً')
      setState('idle')
    } finally {
      setState('idle')
    }
  }

  const toggle = () => state === 'idle' ? startRecording() : stopRecording()

  const formatDuration = (s) =>
    `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <button
        onClick={toggle}
        className={state === 'recording' ? 'pulse-recording' : ''}
        style={{
          width:48, height:48, borderRadius:'50%',
          border:`1.5px solid ${state === 'recording' ? 'var(--mood-low)' : 'var(--border)'}`,
          background: state === 'recording' ? 'rgba(224,92,92,0.15)' : 'var(--bg-surface)',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          transition: 'all 200ms',
          transform: 'scale(1)',
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {state === 'processing'
          ? <Spinner />
          : <MicIcon active={state === 'recording'} />}
      </button>

      {state === 'recording' && (
        <span className="animate-fade-in"
          style={{ fontSize:13, color:'var(--mood-low)' }}>
          🎙 {formatDuration(duration)}
        </span>
      )}

      {state === 'processing' && (
        <span className="animate-fade-in"
          style={{ fontSize:13, color:'var(--text-muted)' }}>
          جارٍ التحويل...
        </span>
      )}
    </div>
  )
}

const MicIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--mood-low)' : 'var(--text-secondary)'}
    strokeWidth="2" strokeLinecap="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8"  y1="23" x2="16" y2="23"/>
  </svg>
)

const Spinner = () => (
  <div style={{
    width:18, height:18, border:'2px solid var(--border)',
    borderTop:'2px solid var(--primary)', borderRadius:'50%',
    animation:'spin 0.8s linear infinite',
  }}/>
)
```

---

## 7. OfflineBanner + SaveButton Badge

```jsx
// src/components/OfflineBanner.jsx
import { useState, useEffect } from 'react'
import { getCount, flush } from '../lib/offlineQueue'
import api from '../lib/api'

export function OfflineBanner() {
  const [online, setOnline]       = useState(navigator.onLine)
  const [syncing, setSyncing]     = useState(false)
  const [syncedCount, setSynced]  = useState(0)

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      setSyncing(true)
      const count = await flush(api)
      setSyncing(false)
      if (count > 0) setSynced(count)
      setTimeout(() => setSynced(0), 3000)
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online && !syncedCount) return null

  return (
    <div
      className={online ? 'animate-slide-up' : ''}
      style={{
        padding:    '8px 16px',
        background: online ? 'rgba(76,175,130,0.1)' : 'rgba(224,92,92,0.1)',
        borderBottom: `1px solid ${online ? 'var(--mood-high)' : 'var(--mood-low)'}`,
        fontSize:   13,
        color:      online ? 'var(--mood-high)' : 'var(--mood-low)',
        textAlign:  'center',
      }}
    >
      {syncing   && '🔄 جارٍ رفع الإدخالات المحفوظة...'}
      {syncedCount > 0 && `✅ تمت مزامنة ${syncedCount} إدخال`}
      {!online   && `🔴 بلا إنترنت — الإدخالات ستُرفع تلقائياً (${getCount()} محفوظ)`}
    </div>
  )
}

// Badge على زرار الحفظ
export function SaveButtonBadge({ count }) {
  if (!count) return null
  return (
    <span style={{
      position:'absolute', top:-6, left:-6,
      background:'var(--mood-mid)', color:'white',
      borderRadius:50, fontSize:10,
      padding:'1px 5px', fontWeight:600,
    }}>
      {count}
    </span>
  )
}
```

---

## 8. Toast Component

```jsx
// src/components/Toast.jsx
import { useState, useCallback } from 'react'

let toastFn = null

export function useToast() {
  const show = useCallback((message, type = 'info') => {
    toastFn?.(message, type)
  }, [])
  return { showToast: show }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  toastFn = (message, type) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const colors = {
    info:    'var(--primary)',
    success: 'var(--mood-high)',
    warning: 'var(--mood-mid)',
    error:   'var(--mood-low)',
  }

  return (
    <div style={{
      position:'fixed', bottom:72, left:0, right:0,
      display:'flex', flexDirection:'column', alignItems:'center', gap:8,
      zIndex:1000, pointerEvents:'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} className="animate-slide-up" style={{
          background: 'var(--bg-elevated)',
          border: `1px solid ${colors[t.type]}`,
          borderRadius: 'var(--radius-pill)',
          padding: '8px 20px',
          fontSize: 13, color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-elevated)',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
```

---

## 9. صفحة العادات — الجديدة (`/habits`)

### الفكرة
صفحة مركزية تجمع كل ما يخص العادات الكمية:
- إحصائيات كل عادة عبر الزمن
- مقارنة بالـ baseline
- Chart تفصيلي لكل عادة
- قائمة بالعادات المعرّفة (system + user)

### إضافة الـ Tab لـ BottomNav

```jsx
// BottomNav: 5 tabs بدل 4
// ✏️ كتابة | 📋 سجل | 🔄 عادات | 📊 تحليل | ⚙️ إعدادات
```

### Layout الشاشة

```
[Header: "عاداتي"]
[Today Summary Bar]
[Habit Selector Tabs]
[Chart Section]
[Stats Grid]
[All Habits List]
[BottomNav]
```

### الكود الكامل

```jsx
// src/pages/Habits.jsx
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip,
         ResponsiveContainer, ReferenceLine } from 'recharts'
import api from '../lib/api'
import { useCounter } from '../hooks/useCounter'

const LOWER_IS_BETTER = new Set(['سجاير', 'دواء'])
const CATEGORY_ICONS = {
  habit:     '🔄',
  health:    '❤️',
  activity:  '⚡',
  nutrition: '🥗',
}

export default function Habits() {
  const [metrics,     setMetrics]     = useState([])
  const [definitions, setDefinitions] = useState({ system:[], user_pending:[] })
  const [selected,    setSelected]    = useState(null)
  const [history,     setHistory]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [days,        setDays]        = useState(30)

  useEffect(() => { fetchData() }, [])
  useEffect(() => {
    if (selected) fetchHistory(selected, days)
  }, [selected, days])

  const fetchData = async () => {
    setLoading(true)
    const [todayRes, defsRes] = await Promise.all([
      api.get('/metrics/today/'),
      api.get('/metrics/definitions/'),
    ])
    setMetrics(todayRes.data.metrics)
    setDefinitions(defsRes.data)
    if (todayRes.data.metrics.length > 0) {
      setSelected(todayRes.data.metrics[0].name)
    }
    setLoading(false)
  }

  const fetchHistory = async (name, daysCount) => {
    const { data } = await api.get('/metrics/history/', {
      params: { name, days: daysCount }
    })
    setHistory(data.data || [])
  }

  const selectedMetric = metrics.find(m => m.name === selected)

  if (loading) return <Habitsskeleton />

  return (
    <div style={{ paddingBottom:72 }}>

      {/* ── Header ── */}
      <div style={{ padding:'16px 16px 8px',
        display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)' }}>
          عاداتي
        </span>
        <span style={{ fontSize:13, color:'var(--text-muted)' }}>
          {new Date().toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'long'})}
        </span>
      </div>

      {/* ── Today Summary Bar ── */}
      <TodaySummaryBar metrics={metrics} />

      {/* ── Habit Selector ── */}
      <div style={{
        display:'flex', overflowX:'auto', gap:8,
        padding:'12px 16px', scrollbarWidth:'none',
      }}>
        {metrics.map((m) => (
          <button
            key={m.name}
            onClick={() => setSelected(m.name)}
            style={{
              flexShrink:0,
              padding:'8px 16px',
              borderRadius:'var(--radius-pill)',
              border:`1.5px solid ${selected === m.name ? 'var(--primary)' : 'var(--border)'}`,
              background: selected === m.name
                ? 'rgba(46,117,182,0.15)' : 'var(--bg-surface)',
              color: selected === m.name ? 'var(--primary)' : 'var(--text-secondary)',
              fontSize:14, fontWeight: selected === m.name ? 600 : 400,
              cursor:'pointer', transition:'all 200ms',
            }}
          >
            {m.name}
          </button>
        ))}
      </div>

      {/* ── Selected Habit Detail ── */}
      {selectedMetric && (
        <>
          <HabitStatsGrid metric={selectedMetric} />
          <HabitChart
            name={selected}
            data={history}
            baseline={selectedMetric.baseline_avg}
            unit={selectedMetric.unit}
            lowerIsBetter={LOWER_IS_BETTER.has(selected)}
            days={days}
            onDaysChange={setDays}
          />
        </>
      )}

      {/* ── All Habits List ── */}
      <AllHabitsList
        system={definitions.system}
        pending={definitions.user_pending}
        activeMetrics={metrics}
      />
    </div>
  )
}

/* ── Today Summary Bar ── */
function TodaySummaryBar({ metrics }) {
  if (!metrics.length) return null
  return (
    <div style={{
      margin:'0 16px 4px',
      background:'var(--bg-surface)',
      border:'1px solid var(--border)',
      borderRadius:'var(--radius-md)',
      padding:'12px 16px',
      display:'flex', gap:16, overflowX:'auto',
    }}>
      {metrics.map((m, i) => {
        const lib = LOWER_IS_BETTER.has(m.name)
        const color = m.direction === 'normal' || m.direction === 'no_baseline'
          ? 'var(--text-secondary)'
          : m.direction === 'up'
            ? (lib ? 'var(--mood-low)' : 'var(--mood-high)')
            : (lib ? 'var(--mood-high)' : 'var(--mood-low)')

        return (
          <div key={m.name} className={`animate-fade-in stagger-${Math.min(i+1,5)}`}
            style={{ flexShrink:0, textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:700, color }}>
              {m.today_total || 0}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{m.name}</div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Stats Grid ── */
function HabitStatsGrid({ metric }) {
  const todayVal = useCounter(Math.round(metric.today_total || 0))
  const lib = LOWER_IS_BETTER.has(metric.name)
  const devColor = metric.direction === 'normal' || metric.direction === 'no_baseline'
    ? 'var(--text-secondary)'
    : metric.direction === 'up'
      ? (lib ? 'var(--mood-low)' : 'var(--mood-high)')
      : (lib ? 'var(--mood-high)' : 'var(--mood-low)')

  const stats = [
    { label:'اليوم',    value: `${todayVal} ${metric.unit}`,               color:'var(--text-primary)' },
    { label:'معدلك',    value: metric.baseline_avg
        ? `${metric.baseline_avg.toFixed(1)} ${metric.unit}`
        : '—',                                                               color:'var(--text-secondary)' },
    { label:'الفرق',    value: metric.deviation_pct != null
        ? `${metric.deviation_pct > 0 ? '+' : ''}${metric.deviation_pct.toFixed(0)}%`
        : '—',                                                               color: devColor },
    { label:'الحالة',   value: metric.label || '—',                         color: devColor },
  ]

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr',
      gap:8, margin:'8px 16px',
    }}>
      {stats.map(({ label, value, color }, i) => (
        <div key={label}
          className={`animate-fade-in stagger-${i+1}`}
          style={{
            background:'var(--bg-surface)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-sm)', padding:'10px 8px', textAlign:'center',
          }}>
          <div style={{ fontSize:16, fontWeight:700, color }}>{value}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Chart ── */
function HabitChart({ name, data, baseline, unit, lowerIsBetter, days, onDaysChange }) {
  const accentColor = 'var(--primary)'
  const baselineColor = lowerIsBetter ? 'var(--mood-high)' : 'var(--mood-mid)'

  const chartData = data.map(d => ({
    date: new Date(d.date).toLocaleDateString('ar-EG',{day:'numeric',month:'short'}),
    value: d.value,
  }))

  return (
    <div style={{
      margin:'8px 16px',
      background:'var(--bg-surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-md)', padding:'16px',
    }}>
      {/* Days selector */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>
          {name} — آخر {days} يوم
        </span>
        <div style={{ display:'flex', gap:4 }}>
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => onDaysChange(d)} style={{
              padding:'3px 10px', borderRadius:50, fontSize:12,
              border:`1px solid ${days===d ? 'var(--primary)' : 'var(--border)'}`,
              background: days===d ? 'rgba(46,117,182,0.15)' : 'var(--bg-elevated)',
              color: days===d ? 'var(--primary)' : 'var(--text-muted)',
              cursor:'pointer',
            }}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div style={{ textAlign:'center', padding:32,
          color:'var(--text-muted)', fontSize:13 }}>
          لا توجد بيانات بعد
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top:8, right:8, bottom:0, left:-20 }}>
            <XAxis dataKey="date" tick={{ fontSize:10, fill:'var(--text-muted)' }}
              interval="preserveStartEnd" />
            <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} />
            <Tooltip
              contentStyle={{
                background:'var(--bg-elevated)', border:'1px solid var(--border)',
                borderRadius:8, fontSize:12,
              }}
              formatter={(v) => [`${v} ${unit}`, name]}
            />
            {baseline && (
              <ReferenceLine y={baseline} stroke={baselineColor}
                strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value:'معدلك', position:'insideTopRight',
                  fontSize:10, fill:baselineColor }} />
            )}
            <Line
              type="monotone" dataKey="value"
              stroke={accentColor} strokeWidth={2}
              dot={{ fill:accentColor, r:3 }}
              activeDot={{ r:5 }}
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

/* ── All Habits List ── */
function AllHabitsList({ system, pending, activeMetrics }) {
  const activeNames = new Set(activeMetrics.map(m => m.name))

  return (
    <div style={{ margin:'16px 16px 0' }}>
      <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:8 }}>
        العادات المعرّفة في النظام
      </p>

      {system.map((def, i) => (
        <div key={def.name}
          className={`animate-fade-in stagger-${Math.min(i+1,5)}`}
          style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'12px 14px',
            borderBottom:'1px solid var(--divider)',
            opacity: activeNames.has(def.name) ? 1 : 0.5,
          }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>
              {CATEGORY_ICONS[def.category] || '🔄'}
            </span>
            <div>
              <div style={{ fontSize:14, color:'var(--text-primary)' }}>{def.name}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                يُقاس بـ {def.unit}
              </div>
            </div>
          </div>
          <span style={{
            fontSize:11, padding:'2px 8px', borderRadius:50,
            background: activeNames.has(def.name)
              ? 'rgba(76,175,130,0.1)' : 'var(--bg-elevated)',
            color: activeNames.has(def.name)
              ? 'var(--mood-high)' : 'var(--text-muted)',
          }}>
            {activeNames.has(def.name) ? 'نشط' : 'غير مسجّل'}
          </span>
        </div>
      ))}

      {/* Pending — user-generated */}
      {pending.length > 0 && (
        <>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:16, marginBottom:8 }}>
            عادات جديدة (قيد الترقية للنظام)
          </p>
          {pending.map(def => (
            <div key={def.name} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'12px 14px',
              borderBottom:'1px solid var(--divider)',
            }}>
              <div>
                <div style={{ fontSize:14, color:'var(--text-primary)' }}>{def.name}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                  يُقاس بـ {def.unit} — {def.suggested_by_count} مستخدم
                </div>
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                {def.suggested_by_count}/3 للترقية
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/* ── Skeleton ── */
function HabitsKeleton() {
  return (
    <div style={{ padding:'16px' }}>
      {[1,2,3].map(i => (
        <div key={i} className="shimmer" style={{
          height:80, borderRadius:'var(--radius-md)',
          marginBottom:12,
        }} />
      ))}
    </div>
  )
}
```

---

## 10. تحديث App Router — إضافة /habits

```jsx
// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Login    from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Home     from './pages/Home'
import History  from './pages/History'
import Habits   from './pages/Habits'       // ← جديد
import Insights from './pages/Insights'
import Settings from './pages/Settings'
import { BottomNav } from './components/BottomNav'
import { OfflineBanner } from './components/OfflineBanner'
import { ToastContainer } from './components/Toast'
import { useAuthStore } from './store/authStore'

export default function App() {
  const { isAuth } = useAuthStore()

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/"       element={isAuth ? <Home />     : <Navigate to="/login" />} />
        <Route path="/history" element={isAuth ? <History /> : <Navigate to="/login" />} />
        <Route path="/habits"  element={isAuth ? <Habits />  : <Navigate to="/login" />} />
        <Route path="/insights"element={isAuth ? <Insights />: <Navigate to="/login" />} />
        <Route path="/settings"element={isAuth ? <Settings />: <Navigate to="/login" />} />
      </Routes>
      {isAuth && <BottomNav />}
      <ToastContainer />
    </>
  )
}
```

---

## 11. تحديث BottomNav — إضافة تاب العادات

```jsx
// src/components/BottomNav.jsx
import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path:'/',        icon:'✏️', label:'كتابة'  },
  { path:'/history', icon:'📋', label:'سجل'    },
  { path:'/habits',  icon:'🔄', label:'عادات'  },  // ← جديد
  { path:'/insights',icon:'📊', label:'تحليل'  },
  { path:'/settings',icon:'⚙️', label:'إعدادات'},
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav style={{
      position:'fixed', bottom:0, left:0, right:0,
      background:'var(--bg-surface)',
      borderTop:'1px solid var(--border)',
      display:'grid',
      gridTemplateColumns:`repeat(${TABS.length}, 1fr)`,
      zIndex:100,
    }}>
      {TABS.map(tab => {
        const active = location.pathname === tab.path
        return (
          <button key={tab.path} onClick={() => navigate(tab.path)} style={{
            background:'none', border:'none', cursor:'pointer',
            padding:'10px 0 6px',
            display:'flex', flexDirection:'column',
            alignItems:'center', gap:2,
            borderTop:`2px solid ${active ? 'var(--primary)' : 'transparent'}`,
            transition:'border-color 200ms',
          }}>
            <span style={{ fontSize:18 }}>{tab.icon}</span>
            <span style={{
              fontSize:10,
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: active ? 600 : 400,
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
```

---

## 12. ترتيب التنفيذ للـ Agent

```
1. أضف src/styles/animations.css واستوردها في main.jsx
2. أضف src/hooks/useCounter.js
3. src/components/EntryCard.jsx
4. src/components/ReflectionCard.jsx
5. src/components/MetricCard.jsx
6. src/components/VoiceButton.jsx
7. src/components/OfflineBanner.jsx + SaveButtonBadge
8. src/components/Toast.jsx
9. src/pages/Habits.jsx (الصفحة الجديدة)
10. حدّث src/components/BottomNav.jsx (5 tabs)
11. حدّث src/App.jsx (أضف route /habits)
12. في Home.jsx:
    - استبدل entry rendering بـ EntryCard
    - أضف ReflectionCard بعد الحفظ
    - استبدل metric cards بـ MetricCard
    - أضف VoiceButton في Action Bar
    - أضف OfflineBanner في الأعلى
    - أضف SaveButtonBadge على زرار الحفظ
```

---

## 13. Checklist نهائي

```
□ Skeleton loader يظهر فور الحفظ وقبل اكتمال LLM
□ Reflection Card يظهر بعد polling يرجع status=done
□ entry_type badge يظهر على كل entry
□ is_open_event badge أحمر يظهر
□ entities chips تظهر عند expand الـ entry
□ Metrics Cards بألوان صحيحة (lower_is_better معكوس)
□ Progress bar animation يبدأ بعد 200ms من ظهور الكارد
□ Voice recording: pulse + عداد وقت + typewriter للنص
□ Offline banner يظهر ويختفي مع تغيير الـ network
□ Offline queue badge على زرار الحفظ
□ صفحة /habits تعمل وتظهر في BottomNav
□ Chart في Habits يتغير مع تغيير الـ days selector
□ AllHabitsList يُظهر system + pending بحالتهم
□ Reduced motion: كل animations مُعطّلة
□ RTL: كل النصوص والـ layouts من اليمين
```
