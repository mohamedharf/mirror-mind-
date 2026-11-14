import { useState, useEffect } from 'react'
import api from '../lib/api'

export default function OpenEventsBanner({ onClose }) {
  const [openEvents, setOpenEvents] = useState([])

  useEffect(() => {
    fetchOpenEvents()
  }, [])

  const fetchOpenEvents = async () => {
    try {
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

  const durationMs  = Date.now() - new Date(event.created_at).getTime()
  const durationH   = durationMs / 3600000
  const hours       = Math.floor(durationH)
  const minutes     = Math.round((durationH - hours) * 60)
  const durationStr = hours > 0 ? `${hours}س ${minutes}د` : `${minutes} دقيقة`

  const handleClose = async () => {
    setClosing(true)
    try {
      await api.post(`/entries/${event.id}/close/`)
      onClosed?.()
    } catch {
      setClosing(false)
    }
  }

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      background:     'rgba(224,92,92,0.08)',
      border:         '1px solid rgba(224,92,92,0.3)',
      borderRadius:   'var(--radius-sm)',
      padding:        '8px 12px',
      marginBottom:   6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
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
