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

export default function MetricCard({ metric, index = 0 }) {
  const [barWidth, setBarWidth] = useState(0)
  
  const hasDecimal = (metric.today_total || 0) % 1 !== 0
  const decimals = hasDecimal ? 1 : 0
  const animatedValue = useCounter(metric.today_total || 0, 600, decimals)

  const targetWidth = metric.baseline_avg
    ? Math.min((metric.today_total / (metric.baseline_avg * 1.5)) * 100, 100)
    : Math.min((metric.today_total || 0) * 10, 100)

  useEffect(() => {
    const timer = setTimeout(() => setBarWidth(targetWidth), 200 + index * 80)
    return () => clearTimeout(timer)
  }, [targetWidth, index])

  const accent = getAccentColor(metric.name, metric.direction)

  return (
    <div
      className="animate-fade-in snap-center"
      style={{
        width:         '150px',
        flexShrink:    0,
        background:    'var(--bg-surface)',
        border:        '1px solid var(--border)',
        borderBottom:  `3px solid ${accent}`,
        borderRadius:  'var(--radius-md)',
        padding:       '14px 12px',
        animationDelay: `${index * 80}ms`,
        transition:    'border-bottom-color 400ms ease',
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {metric.name}
        </span>
        <span style={{
          fontSize: 10, padding:'2px 6px', borderRadius:50,
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
