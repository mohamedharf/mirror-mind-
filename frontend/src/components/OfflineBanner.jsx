import { useState, useEffect } from 'react'
import { getCount, flush } from '../lib/offlineQueue'
import api from '../lib/api'

export function OfflineBanner() {
  const [online, setOnline]      = useState(navigator.onLine)
  const [syncing, setSyncing]    = useState(false)
  const [syncedCount, setSynced] = useState(0)

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
      {syncing    && '🔄 جارٍ رفع الإدخالات المحفوظة...'}
      {syncedCount > 0 && `✅ تمت مزامنة ${syncedCount} إدخال`}
      {!online    && `🔴 بلا إنترنت — الإدخالات ستُرفع تلقائياً (${getCount()} محفوظ)`}
    </div>
  )
}

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
