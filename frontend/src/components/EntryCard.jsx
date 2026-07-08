import { useState } from 'react'
import api from '../lib/api'

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

export default function EntryCard({ entry, onReply, isChild = false }) {
  const [expanded, setExpanded] = useState(false)
  const mood   = MOOD_DISPLAY(entry.mood_score)
  const badge  = TYPE_BADGE[entry.entry_type] || TYPE_BADGE.event
  const isPending = ['pending', 'processing'].includes(entry.processing_status)
  const isFailed = ['failed', 'rate_limited', 'analysis_timeout'].includes(entry.processing_status)

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
          {/* زرار الرد */}
          {onReply && (
            <button
              onClick={(e) => { e.stopPropagation(); onReply(entry.id, entry.text) }}
              style={{
                background: 'none', border: 'none',
                color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer',
                padding: '0 4px',
              }}
              title="رد على هذا الحدث"
            >↳</button>
          )}

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

          {isFailed && (
            <button 
              onClick={(e) => {
                e.stopPropagation()
                api.patch(`/entries/${entry.id}/retry_analysis/`)
                  .then(() => window.location.reload())
              }}
              style={{
                marginTop: 8, padding: '4px 12px', background: 'var(--mood-low)',
                color: 'white', borderRadius: 4, border: 'none', fontSize: 12, cursor: 'pointer'
              }}
            >
              إعادة محاولة التحليل
            </button>
          )}

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
