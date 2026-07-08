const MOOD_DISPLAY = (score) => {
  if (!score) return { icon: '➡️', label: 'غير محدد', color: 'var(--text-muted)' }
  if (score >= 4.0) return { icon: '⬆️', label: 'جيد',  color: 'var(--mood-high)' }
  if (score >= 2.5) return { icon: '➡️', label: 'عادي', color: 'var(--mood-mid)'  }
  return              { icon: '⬇️', label: 'صعب',  color: 'var(--mood-low)'  }
}

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
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{ background:'none', border:'none',
              color:'var(--text-muted)', cursor:'pointer', fontSize:16 }}
          >×</button>
        )}
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
          ⚠️ {typeof alert === 'string' ? alert : alert.message}
        </div>
      ))}
    </div>
  )
}
