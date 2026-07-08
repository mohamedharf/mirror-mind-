/**
 * Polls entry processing_status with exponential backoff.
 */
export function pollEntryStatus(api, entryId, onDone, onFail) {
  let attempts = 0
  const MAX_ATTEMPTS = 10

  const check = async () => {
    attempts++
    if (attempts > MAX_ATTEMPTS) {
      onFail('analysis_timeout')
      return
    }
    try {
      const { data } = await api.get(`/entries/${entryId}/`)
      if (data.processing_status === 'done') {
        onDone(data)
        return
      }
      if (['failed', 'rate_limited'].includes(data.processing_status)) {
        onFail(data.processing_status)
        return
      }
    } catch {
      // network error — keep polling
    }
    const delay = Math.min(2000 * attempts, 15000)
    setTimeout(check, delay)
  }

  setTimeout(check, 2000)
}

export function toArabicDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  return d.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function toArabicTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export function moodToColor(score) {
  if (!score) return 'var(--text-muted)'
  if (score >= 4) return 'var(--mood-high)'
  if (score >= 3) return 'var(--mood-mid)'
  return 'var(--mood-low)'
}

/** بداية الأسبوع (الاثنين — مطابق للباك إند) */
export function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toISOString().split('T')[0]
}

export function getCurrentMonthParam() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export const AR_MONTHS = [
  { label: 'الكل', value: null },
  { label: 'يناير', value: 1 },
  { label: 'فبراير', value: 2 },
  { label: 'مارس', value: 3 },
  { label: 'أبريل', value: 4 },
  { label: 'مايو', value: 5 },
  { label: 'يونيو', value: 6 },
  { label: 'يوليو', value: 7 },
  { label: 'أغسطس', value: 8 },
  { label: 'سبتمبر', value: 9 },
  { label: 'أكتوبر', value: 10 },
  { label: 'نوفمبر', value: 11 },
  { label: 'ديسمبر', value: 12 },
]

/** حساب streak من قائمة تواريخ ISO */
export function computeStreakFromDates(dates) {
  if (!dates.length) return 0

  const unique = [...new Set(dates.map(d => d.split('T')[0]))].sort().reverse()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let streak = 0
  let expected = new Date(today)

  for (const dateStr of unique) {
    const entryDate = new Date(dateStr + 'T00:00:00')
    const expectedStr = expected.toISOString().split('T')[0]
    if (dateStr === expectedStr) {
      streak++
      expected.setDate(expected.getDate() - 1)
    } else if (dateStr < expectedStr) {
      break
    }
  }
  return streak
}

/** بناء عرض threads من قائمة مسطحة (parent_id) */
export function buildThreadView(entries) {
  // الـ API في الباك إند بيجيب الأحداث الرئيسية بس (parent__isnull=True)
  // والأبناء موجودين بداخل entry.children
  // لذلك لا نحتاج لتصفية الأبناء ووضعهم كأحداث مستقلة
  return [...entries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/** بناء threads من نتائج list API (children متداخلة) */
export function flattenListEntries(results) {
  const flat = []
  for (const entry of results) {
    flat.push({ ...entry, parent_id: entry.parent_id ?? null })
    for (const child of entry.children || []) {
      flat.push({ ...child, parent_id: entry.id, isChild: true })
    }
  }
  return flat
}

export function groupEntriesByDate(entries) {
  const grouped = {}
  entries.forEach(e => {
    const d = new Date(e.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(e)
  })
  return grouped
}

export async function fetchStreak(api) {
  try {
    const dates = []
    let page = 1
    let hasMore = true
    while (hasMore && page <= 5) {
      const { data } = await api.get('/entries/', { params: { page, page_size: 50 } })
      for (const entry of data.results || []) {
        dates.push(entry.created_at)
        for (const child of entry.children || []) {
          dates.push(child.created_at)
        }
      }
      hasMore = !!data.next
      page++
    }
    return computeStreakFromDates(dates)
  } catch {
    return 0
  }
}

export async function deleteAllUserEntries(api) {
  while (true) {
    const { data } = await api.get('/entries/', { params: { page: 1, page_size: 50 } })
    const results = data.results || []
    if (!results.length) break
    for (const entry of results) {
      for (const child of entry.children || []) {
        await api.delete(`/entries/${child.id}/`)
      }
      await api.delete(`/entries/${entry.id}/`)
    }
  }
}
