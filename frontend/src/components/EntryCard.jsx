import { useState } from 'react'

const TYPE_BADGE = {
  routine:    { label: 'اعتيادي', bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' },
  event:      { label: 'حدث',    bg: 'rgba(46,117,182,0.15)',   color: 'var(--primary)'    },
  reflection: { label: 'تأمل',   bg: 'rgba(76,175,130,0.1)',    color: 'var(--mood-high)'  },
}

const MOOD_CONFIG = (score) => {
  if (!score) return null
  if (score >= 4.0) return { icon: '⬆️', color: 'var(--mood-high)', bg: 'rgba(76,175,130,0.12)', label: score.toFixed(1) }
  if (score >= 2.5) return { icon: '➡️', color: 'var(--mood-mid)',  bg: 'rgba(255,193,68,0.12)',  label: score.toFixed(1) }
  return               { icon: '⬇️', color: 'var(--mood-low)',  bg: 'rgba(224,92,92,0.12)',   label: score.toFixed(1) }
}

export default function EntryCard({
  entry,
  onLinkClick,
  onReply,         // backward compat
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

  // دعم onLinkClick أو onReply (قديم)
  const handleLink = onLinkClick
    ? (e) => { e.stopPropagation(); onLinkClick(entry) }
    : onReply
      ? (e) => { e.stopPropagation(); onReply(entry.id, entry.text) }
      : null

  return (
    <div
      onClick={() => !isPending && setExpanded(e => !e)}
      className="animate-slide-down"
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
          {handleLink && (
            <button
              onClick={handleLink}
              title="ربط إدخال تابع"
              style={{
                background: 'none', border: 'none',
                color: 'var(--text-muted)', fontSize: 15,
                cursor: 'pointer', padding: '0 2px',
                lineHeight: 1,
              }}
            >↳</button>
          )}
        </div>
      </div>

      {/* ── ROW 2: Mood + Tags (يظهر دايماً لو البيانات موجودة) ── */}
      {!isPending && (mood || entry.tags?.length > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center',
          flexWrap: 'wrap', gap: 4, marginBottom: 6,
        }}>
          {/* Mood Score — ملوّن حسب المستوى */}
          {mood && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 12, color: mood.color, fontWeight: 600,
              background: mood.bg,
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
                  {m.definition?.name ?? m.name}: {m.value} {m.definition?.unit ?? m.unit}
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
    if (onEntryUpdated) {
      const { pollEntryStatus } = await import('../lib/utils')
      pollEntryStatus(api, entryId, onEntryUpdated, () => {})
    }
  } catch (e) {
    console.error('Retry failed', e)
  }
}
