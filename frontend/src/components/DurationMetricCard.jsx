import { useEffect, useState } from 'react'

/**
 * DurationMetricCard
 * كارد خاص للـ metrics المبنية على الوقت (نوم، عمل، رياضة).
 * يعرض: الساعات بشكل كبير + progress bar نحو المثالي + sparkline أسبوعي.
 */

const IDEAL = {
  'نوم':    8,
  'عمل':    8,
  'رياضة':  0.5,
}

const EMOJI = {
  'نوم':   '😴',
  'عمل':   '💼',
  'رياضة': '⚡',
}

function formatHours(h) {
  if (!h) return '—'
  const hours   = Math.floor(h)
  const minutes = Math.round((h - hours) * 60)
  if (hours === 0) return `${minutes} د`
  return minutes > 0 ? `${hours}س ${minutes}د` : `${hours} ساعة`
}

function getColor(value, ideal) {
  const ratio = value / ideal
  if (ratio >= 0.85) return 'var(--mood-high)'
  if (ratio >= 0.5)  return 'var(--mood-mid)'
  return 'var(--mood-low)'
}

export default function DurationMetricCard({ metric, weeklyData = [], index = 0 }) {
  const ideal    = IDEAL[metric.name] ?? metric.baseline_avg ?? 8
  const total    = metric.today_total ?? 0
  const pct      = Math.min((total / ideal) * 100, 100)
  const todayColor = getColor(total, ideal)
  const emoji    = EMOJI[metric.name] ?? '⏱'

  // Progress bar animation
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(pct), 150 + index * 60)
    return () => clearTimeout(t)
  }, [pct, index])

  return (
    <div
      className="animate-fade-in"
      style={{
        minWidth:     200,
        background:   'var(--bg-surface)',
        border:       '1px solid var(--border)',
        borderRight:  `3px solid ${todayColor}`,
        borderRadius: 'var(--radius-md)',
        padding:      '14px 16px',
        flexShrink:   0,
        animationDelay: `${index * 80}ms`,
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>
          {emoji} {metric.name}
        </span>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>اليوم</span>
      </div>

      {/* الرقم الكبير */}
      <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:12 }}>
        <span style={{ fontSize:30, fontWeight:700, color: todayColor, lineHeight:1 }}>
          {total ? formatHours(total) : '—'}
        </span>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
          {total >= ideal ? '✓' : `من ${ideal} المثالية`}
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: weeklyData.length > 0 ? 10 : 0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>نحو {ideal} ساعة</span>
          <span style={{ fontSize:11, color: todayColor, fontWeight:600 }}>{Math.round(pct)}%</span>
        </div>
        <div style={{ height:5, background:'var(--bg-elevated)', borderRadius:3, overflow:'hidden' }}>
          <div style={{
            height:'100%',
            borderRadius:3,
            background: todayColor,
            width:`${barWidth}%`,
            transition:'width 700ms cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>

      {/* Sparkline أسبوعي بسيط بـ CSS bars */}
      {weeklyData.length > 0 && (
        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:5 }}>
            آخر {weeklyData.length} أيام
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:28 }}>
            {weeklyData.slice(-7).map((d, i) => {
              const h = d.value ?? 0
              const barH = Math.min(Math.round((h / (ideal * 1.5)) * 28), 28)
              return (
                <div
                  key={i}
                  style={{
                    flex:1,
                    height: barH || 3,
                    background: getColor(h, ideal),
                    borderRadius: 2,
                    opacity: 0.8,
                  }}
                  title={`${d.date}: ${formatHours(h)}`}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Baseline */}
      {metric.baseline_avg != null && (
        <div style={{ marginTop:8, fontSize:11, color:'var(--text-muted)', display:'flex', justifyContent:'space-between' }}>
          <span>معدلك: {formatHours(metric.baseline_avg)}/يوم</span>
          {metric.deviation_pct != null && (
            <span style={{ color: Math.abs(metric.deviation_pct) < 15 ? 'var(--text-muted)' : todayColor }}>
              {metric.deviation_pct > 0 ? '+' : ''}{metric.deviation_pct.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}
