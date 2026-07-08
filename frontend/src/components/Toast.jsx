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
          border: `1px solid ${colors[t.type] || colors.info}`,
          borderRadius: 'var(--radius-pill)',
          padding: '8px 20px',
          fontSize: 13, color: 'var(--text-primary)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

// Legacy default export for backward compatibility with Home.jsx
export default function Toast({ message, type = 'info' }) {
  if (!message) return null

  const colors = {
    info:    'var(--primary)',
    success: 'var(--mood-high)',
    warning: 'var(--mood-mid)',
    error:   'var(--mood-low)',
  }

  return (
    <div
      className="animate-slide-up"
      style={{
        position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)',
        background: 'var(--bg-elevated)',
        border: `1px solid ${colors[type] || colors.info}`,
        borderRadius: 'var(--radius-pill)',
        padding: '8px 20px',
        fontSize: 13, color: 'var(--text-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        zIndex: 1000, whiteSpace: 'nowrap',
      }}
      role="status"
    >
      {message}
    </div>
  )
}
