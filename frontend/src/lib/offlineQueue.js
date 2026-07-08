const KEY = 'maraya_offline_queue'

export const enqueue = (entry) => {
  const q = JSON.parse(localStorage.getItem(KEY) || '[]')
  q.push({ ...entry, queued_at: new Date().toISOString() })
  localStorage.setItem(KEY, JSON.stringify(q))
}

export const flush = async (api) => {
  const q = JSON.parse(localStorage.getItem(KEY) || '[]')
  if (!q.length) return 0
  const failed = []
  for (const item of q) {
    try {
      await api.post('/entries/', {
        text:      item.text,
        parent_id: item.parent_id || null,
      })
    } catch {
      failed.push(item)
    }
  }
  localStorage.setItem(KEY, JSON.stringify(failed))
  return q.length - failed.length
}

export const getCount = () =>
  JSON.parse(localStorage.getItem(KEY) || '[]').length
