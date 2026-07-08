import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../lib/api'
import { AR_MONTHS, moodToColor } from '../lib/utils'
import EntryItem from '../components/EntryItem'

function buildThreadFromList(results) {
  const threadView = []
  for (const entry of results) {
    threadView.push({ ...entry, isChild: false })
  }
  return threadView
}

export default function History() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)

  const currentYear = new Date().getFullYear()
  const [selectedMonth, setSelectedMonth] = useState(null)

  const observer = useRef()
  const lastElementRef = useCallback(node => {
    if (loading) return
    if (observer.current) observer.current.disconnect()
    observer.current = new IntersectionObserver(ents => {
      if (ents[0].isIntersecting && hasMore) setPage(p => p + 1)
    })
    if (node) observer.current.observe(node)
  }, [loading, hasMore])

  const fetchHistory = useCallback(async (pageNum, searchQuery, month, reset = false) => {
    setLoading(true)
    try {
      const params = { page: pageNum, page_size: 20, search: searchQuery || undefined }
      if (month) {
        params.month = month
        params.year = currentYear
      }
      const res = await api.get('/entries/', { params })
      setEntries(prev => reset ? res.data.results : [...prev, ...res.data.results])
      setHasMore(!!res.data.next)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [currentYear])

  useEffect(() => {
    setPage(1)
    setHasMore(true)
    fetchHistory(1, query, selectedMonth, true)
  }, [selectedMonth])

  useEffect(() => {
    if (page > 1) fetchHistory(page, query, selectedMonth, false)
  }, [page])

  const handleSearch = (e) => {
    const val = e.target.value
    setQuery(val)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => {
      setPage(1)
      setHasMore(true)
      fetchHistory(1, val, selectedMonth, true)
    }, 500)
  }

  const grouped = {}
  entries.forEach(e => {
    const d = new Date(e.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
    if (!grouped[d]) grouped[d] = { entries: [], moods: [] }
    grouped[d].entries.push(e)
    if (e.mood_score != null) grouped[d].moods.push(e.mood_score)
    for (const c of e.children || []) {
      if (c.mood_score != null) grouped[d].moods.push(c.mood_score)
    }
  })

  const groupKeys = Object.keys(grouped)

  return (
    <>
      <header className="sticky top-0 z-40 bg-bg-deep/90 backdrop-blur pb-2">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-text-primary mb-3">السجل</h1>
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث في سجلاتك..."
              value={query}
              onChange={handleSearch}
              className="w-full bg-surface border border-border rounded-[var(--radius-pill)] pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary text-text-primary placeholder-text-muted"
            />
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-muted text-sm">search</span>
          </div>
        </div>

        <div className="flex overflow-x-auto gap-2 px-4 pb-2 scrollbar-hide">
          {AR_MONTHS.map(m => (
            <button
              key={m.label}
              type="button"
              onClick={() => { setSelectedMonth(m.value); setPage(1) }}
              className={`shrink-0 px-4 py-1.5 rounded-[var(--radius-pill)] text-sm transition-colors
                ${selectedMonth === m.value ? 'bg-primary text-white' : 'bg-surface text-text-secondary'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <main className="pb-24">
        {groupKeys.map((date, index) => {
          const { entries: dayEntries, moods } = grouped[date]
          const avgMood = moods.length
            ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)
            : null
          const threadView = buildThreadFromList(dayEntries)

          return (
            <div key={date} className="mb-6">
              <div className="flex justify-between items-center px-4 mb-2">
                <span className="text-[14px] font-bold text-text-primary">{date}</span>
                <span className="text-[12px] text-text-muted flex items-center gap-1">
                  {avgMood && (
                    <span style={{ color: moodToColor(Number(avgMood)) }}>◎ {avgMood}</span>
                  )}
                  {dayEntries.length} سجل
                </span>
              </div>
              <div className="flex flex-col">
                {threadView.map((e, idx) => {
                  const isLast = index === groupKeys.length - 1 && idx === threadView.length - 1
                  const hasChildren = !e.isChild && e.children && e.children.length > 0
                  const childrenCount = e.children?.length || 0
                  const children = e.children || []
                  return (
                    <div key={e.id} ref={isLast ? lastElementRef : null}>
                      <EntryItem
                        entry={e}
                        isChild={e.isChild}
                        hasChildren={hasChildren}
                        childrenCount={childrenCount}
                        children={children}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {loading && <div className="text-center text-text-muted text-sm py-4">جارٍ التحميل...</div>}
        {!loading && entries.length === 0 && (
          <div className="mx-4 text-center p-8 text-text-muted text-sm border border-dashed border-border rounded-[var(--radius-sm)]">
            لا توجد إدخالات.
          </div>
        )}
      </main>
    </>
  )
}
