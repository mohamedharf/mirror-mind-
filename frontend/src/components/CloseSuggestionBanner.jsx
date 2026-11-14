import { useState, useEffect } from 'react'
import api from '../lib/api'

/**
 * CloseSuggestionBanner
 * يظهر بعد حفظ entry بثانيتين إذا اكتشف الباك إند أن هذا الـ entry يُغلق حدثاً مفتوحاً.
 * يعرض اسم الـ metric والمدة، ويطلب تأكيداً أو رفضاً من المستخدم.
 */
export default function CloseSuggestionBanner({ entryId, onConfirmed, onDismissed }) {
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entryId) return
    // انتظر ثانيتين عشان Celery task يخزن الاقتراح في Cache
    const timer = setTimeout(() => fetchSuggestion(), 2000)
    return () => clearTimeout(timer)
  }, [entryId])

  const fetchSuggestion = async () => {
    try {
      const { data } = await api.get(`/entries/${entryId}/close-suggestion/`)
      if (data.has_suggestion) setSuggestion(data)
    } catch { /* تجاهل الأخطاء */ }
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const { data } = await api.post(`/entries/${entryId}/close-suggestion/`)
      if (data.success) {
        onConfirmed?.({ metricName: data.metric_name, durationHours: data.duration_hours })
      }
      setSuggestion(null)
    } catch {
      setSuggestion(null)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = async () => {
    try { await api.delete(`/entries/${entryId}/close-suggestion/`) } catch {}
    setSuggestion(null)
    onDismissed?.()
  }

  if (!suggestion) return null

  // تحويل الساعات لنص مقروء
  const hours   = Math.floor(suggestion.duration_hours)
  const minutes = Math.round((suggestion.duration_hours - hours) * 60)
  const durationText = hours > 0
    ? `${hours} ساعة${minutes > 0 ? ` و${minutes} دقيقة` : ''}`
    : `${minutes} دقيقة`

  const metricEmoji = {
    'نوم':    '😴',
    'عمل':    '💼',
    'رياضة':  '⚡',
  }[suggestion.metric_name] || '⏱'

  return (
    <div
      className="animate-slide-up"
      style={{
        margin:       '0 16px 12px',
        background:   'rgba(46,117,182,0.08)',
        border:       '1px solid rgba(46,117,182,0.3)',
        borderRadius: 'var(--radius-md)',
        padding:      '12px 14px',
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--primary)' }}>
          ⏱ إغلاق حدث؟
        </span>
        <button
          onClick={handleDismiss}
          style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18 }}
        >×</button>
      </div>

      {/* الحدث المفتوح */}
      <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 4px' }}>بدأت:</p>
      <p style={{
        fontSize:13, color:'var(--text-secondary)',
        background:'var(--bg-elevated)',
        padding:'6px 10px', borderRadius:'var(--radius-sm)',
        margin:'0 0 12px', lineHeight:1.5,
      }}>
        "{suggestion.open_entry_text}"
      </p>

      {/* المدة المحسوبة */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <span style={{ fontSize:28 }}>{metricEmoji}</span>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:'var(--primary)', lineHeight:1 }}>
            {suggestion.duration_hours.toFixed(1)} ساعة
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
            {suggestion.metric_name} · {durationText}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display:'flex', gap:8 }}>
        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            flex:1, padding:'10px',
            borderRadius:'var(--radius-pill)',
            background:'var(--primary)', color:'white',
            border:'none', fontSize:13, fontWeight:600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition:'opacity 200ms',
          }}
        >
          {loading ? '⏳' : `✓ سجّل ${suggestion.metric_name}`}
        </button>
        <button
          onClick={handleDismiss}
          style={{
            flex:1, padding:'10px',
            borderRadius:'var(--radius-pill)',
            background:'transparent',
            border:'1px solid var(--border)',
            color:'var(--text-secondary)',
            fontSize:13, cursor:'pointer',
          }}
        >
          تجاهل
        </button>
      </div>
    </div>
  )
}
