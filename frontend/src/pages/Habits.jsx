import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
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
  const [definitions, setDefinitions] = useState({ system: [], user_pending: [] })
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
    try {
      const [todayRes, defsRes] = await Promise.all([
        api.get('/metrics/today/'),
        api.get('/metrics/definitions/'),
      ])
      const metricsData = todayRes.data.metrics || []
      setMetrics(metricsData)
      setDefinitions(defsRes.data || { system: [], user_pending: [] })
      if (metricsData.length > 0) {
        setSelected(metricsData[0].name)
      }
    } catch {
      setMetrics([])
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async (name, daysCount) => {
    try {
      const { data } = await api.get('/metrics/history/', {
        params: { name, days: daysCount }
      })
      setHistory(data.data || [])
    } catch {
      setHistory([])
    }
  }

  const selectedMetric = metrics.find(m => m.name === selected)

  if (loading) return <HabitsSkeleton />

  return (
    <div style={{ paddingBottom: 80 }} dir="rtl">

      {/* ── Header ── */}
      <div style={{
        padding: '16px 16px 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          عاداتي
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* ── Today Summary Bar ── */}
      <TodaySummaryBar metrics={metrics} />

      {metrics.length === 0 ? (
        <div style={{
          margin: '32px 16px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 14
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
          <p>لا توجد عادات مسجّلة اليوم بعد.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>سجّل حدثاً يحتوي على كمية (مثل «شربت 2 قهوة») وستظهر هنا.</p>
        </div>
      ) : (
        <>
          {/* ── Habit Selector Tabs ── */}
          <div style={{
            display: 'flex', overflowX: 'auto', gap: 8,
            padding: '12px 16px', scrollbarWidth: 'none',
          }}>
            {metrics.map((m) => (
              <button
                key={m.name}
                onClick={() => setSelected(m.name)}
                style={{
                  flexShrink: 0,
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-pill)',
                  border: `1.5px solid ${selected === m.name ? 'var(--primary)' : 'var(--border)'}`,
                  background: selected === m.name
                    ? 'rgba(46,117,182,0.15)' : 'var(--bg-surface)',
                  color: selected === m.name ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: 14, fontWeight: selected === m.name ? 600 : 400,
                  cursor: 'pointer', transition: 'all 200ms',
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
        </>
      )}

      {/* ── All Habits List ── */}
      <AllHabitsList
        system={definitions.system || []}
        pending={definitions.user_pending || []}
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
      margin: '0 16px 4px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 16px',
      display: 'flex', gap: 20, overflowX: 'auto',
    }}>
      {metrics.map((m, i) => {
        const lib = LOWER_IS_BETTER.has(m.name)
        const color = m.direction === 'normal' || m.direction === 'no_baseline'
          ? 'var(--text-secondary)'
          : m.direction === 'up'
            ? (lib ? 'var(--mood-low)' : 'var(--mood-high)')
            : (lib ? 'var(--mood-high)' : 'var(--mood-low)')

        return (
          <div key={m.name}
            className={`animate-fade-in stagger-${Math.min(i + 1, 5)}`}
            style={{ flexShrink: 0, textAlign: 'center', minWidth: 50 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>
              {m.today_total || 0}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.name}</div>
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
    { label: 'اليوم',  value: `${todayVal} ${metric.unit}`,        color: 'var(--text-primary)' },
    { label: 'معدلك',  value: metric.baseline_avg
        ? `${metric.baseline_avg.toFixed(1)} ${metric.unit}` : '—',color: 'var(--text-secondary)' },
    { label: 'الفرق',  value: metric.deviation_pct != null
        ? `${metric.deviation_pct > 0 ? '+' : ''}${metric.deviation_pct.toFixed(0)}%` : '—', color: devColor },
    { label: 'الحالة', value: metric.label || '—',                  color: devColor },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
      gap: 8, margin: '8px 16px',
    }}>
      {stats.map(({ label, value, color }, i) => (
        <div key={label}
          className={`animate-fade-in stagger-${i + 1}`}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 8px', textAlign: 'center',
          }}>
          <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Chart ── */
function HabitChart({ name, data, baseline, unit, lowerIsBetter, days, onDaysChange }) {
  const accentColor    = 'var(--primary)'
  const baselineColor  = lowerIsBetter ? 'var(--mood-high)' : 'var(--mood-mid)'

  const chartData = data.map(d => ({
    date:  new Date(d.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
    value: d.value,
  }))

  return (
    <div style={{
      margin: '8px 16px',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '16px',
    }}>
      {/* Days selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {name} — آخر {days} يوم
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => onDaysChange(d)} style={{
              padding: '3px 10px', borderRadius: 50, fontSize: 12,
              border: `1px solid ${days === d ? 'var(--primary)' : 'var(--border)'}`,
              background: days === d ? 'rgba(46,117,182,0.15)' : 'var(--bg-elevated)',
              color: days === d ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32,
          color: 'var(--text-muted)', fontSize: 13 }}>
          لا توجد بيانات لهذه الفترة بعد
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 12,
              }}
              formatter={(v) => [`${v} ${unit}`, name]}
            />
            {baseline && (
              <ReferenceLine y={baseline} stroke={baselineColor}
                strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: 'معدلك', position: 'insideTopRight',
                  fontSize: 10, fill: baselineColor }} />
            )}
            <Line
              type="monotone" dataKey="value"
              stroke={accentColor} strokeWidth={2}
              dot={{ fill: accentColor, r: 3 }}
              activeDot={{ r: 5 }}
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

  if (system.length === 0 && pending.length === 0) return null

  return (
    <div style={{ margin: '16px 16px 0' }}>
      {system.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            العادات المعرّفة في النظام
          </p>

          {system.map((def, i) => (
            <div key={def.name}
              className={`animate-fade-in stagger-${Math.min(i + 1, 5)}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: '1px solid var(--divider)',
                opacity: activeNames.has(def.name) ? 1 : 0.55,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>
                  {CATEGORY_ICONS[def.category] || '🔄'}
                </span>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{def.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    يُقاس بـ {def.unit}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 50,
                background: activeNames.has(def.name)
                  ? 'rgba(76,175,130,0.1)' : 'var(--bg-elevated)',
                color: activeNames.has(def.name)
                  ? 'var(--mood-high)' : 'var(--text-muted)',
              }}>
                {activeNames.has(def.name) ? 'نشط اليوم' : 'غير مسجّل'}
              </span>
            </div>
          ))}
        </>
      )}

      {pending.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 16, marginBottom: 8 }}>
            عادات جديدة (قيد الترقية للنظام)
          </p>
          {pending.map(def => (
            <div key={def.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid var(--divider)',
            }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{def.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  يُقاس بـ {def.unit}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
function HabitsSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="shimmer" style={{
          height: 80, borderRadius: 'var(--radius-md)',
          marginBottom: 12,
        }} />
      ))}
    </div>
  )
}
