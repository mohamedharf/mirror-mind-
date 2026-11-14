import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { enqueue, flush } from '../lib/offlineQueue'
import { pollEntryStatus, toArabicDate, buildThreadView, fetchStreak } from '../lib/utils'
import EntryCard from '../components/EntryCard'
import MetricCard from '../components/MetricCard'
import DurationMetricCard from '../components/DurationMetricCard'
import CloseSuggestionBanner from '../components/CloseSuggestionBanner'
import OpenEventsBanner from '../components/OpenEventsBanner'
import ReflectionCard from '../components/ReflectionCard'
import Toast from '../components/Toast'

const MicIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 14C13.6569 14 15 12.6569 15 11V5C15 3.34315 13.6569 2 12 2C10.3431 2 9 3.34315 9 5V11C9 12.6569 10.3431 14 12 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M19 10V11C19 14.866 15.866 18 12 18C8.13401 18 5 14.866 5 11V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 22H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

function MoodCard({ score }) {
  const isAvailable = score !== '-';
  const numericScore = parseFloat(score);
  
  let emoji = '➡️';
  let color = 'var(--text-muted)';
  let label = 'غير محدد';
  
  if (isAvailable) {
    if (numericScore >= 4.0) { emoji = '⬆️'; color = 'var(--mood-high)'; label = 'جيد'; }
    else if (numericScore >= 2.5) { emoji = '➡️'; color = 'var(--mood-mid)'; label = 'عادي'; }
    else { emoji = '⬇️'; color = 'var(--mood-low)'; label = 'صعب'; }
  }

  return (
    <div
      className="animate-fade-in snap-center"
      style={{
        width: '150px',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderBottom: `3px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 12px',
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>متوسط المزاج</span>
      </div>
      <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:10 }}>
        <span style={{ fontSize:32, fontWeight:700, color:'var(--text-primary)' }}>{score}</span>
        {isAvailable && <span style={{ fontSize:18 }}>{emoji}</span>}
      </div>
      <div style={{ fontSize:12, color:'var(--text-muted)' }}>
        {label}
      </div>
    </div>
  )
}

export default function Home() {
  const [text, setText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [interimText, setInterimText] = useState('')  // نص مؤقت أثناء التسجيل
  const [voiceWarning, setVoiceWarning] = useState('')
  const [toast, setToast] = useState({ msg: '', type: 'info' })

  const [todayEntries, setTodayEntries] = useState([])
  const [openEvents, setOpenEvents] = useState([])
  const [suggestedCloseEvent, setSuggestedCloseEvent] = useState(null)
  const [totalToday, setTotalToday] = useState(0)
  const [showMore, setShowMore] = useState(false)
  const [lastReflection, setLastReflection] = useState(null)
  const [lastSavedEntryId, setLastSavedEntryId] = useState(null)   // للـ CloseSuggestionBanner
  const [metrics, setMetrics] = useState([])
  const [weeklyMetrics, setWeeklyMetrics] = useState({})            // تاريخ أسبوعي للـ duration metrics
  const [showAllMetrics, setShowAllMetrics] = useState(false)
  const [streak, setStreak] = useState(0)

  const [selectedParentId, setSelectedParentId] = useState(null)
  const [selectedParentText, setSelectedParentText] = useState('')
  const [highlightedId, setHighlightedId] = useState(null)

  const speechRef = useRef(null)          // SpeechRecognition instance
  const isRecordingRef = useRef(false)    // حل Stale Closure في الـ callbacks
  const baseTextRef = useRef('')          // النص قبل بدء التسجيل
  const textareaRef = useRef(null)
  const [recordSecs, setRecordSecs] = useState(0)
  const timerRef = useRef(null)

  const showToastMsg = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'info' }), 3000)
  }, [])

  const fetchMetrics = useCallback(async () => {
    try {
      const { data } = await api.get('/metrics/today/')
      const metricsData = data.metrics || []
      setMetrics(metricsData)
      // جلب السجل الأسبوعي للـ duration metrics
      const durationOnes = metricsData.filter(m => m.is_duration_based)
      if (durationOnes.length > 0) {
        const results = {}
        await Promise.all(durationOnes.map(async (m) => {
          try {
            const { data: hist } = await api.get('/metrics/history/', { params: { name: m.name, days: 7 } })
            results[m.name] = hist.data || []
          } catch { results[m.name] = [] }
        }))
        setWeeklyMetrics(results)
      }
    } catch {
      setMetrics([])
    }
  }, [])

  const fetchMetricHistory = useCallback(async (name, days = 30) => {
    try {
      const { data } = await api.get('/metrics/history/', { params: { name, days } })
      return data
    } catch {
      return null
    }
  }, [])

  const fetchTodayEntries = useCallback(async (loadAll = false) => {
    try {
      if (loadAll) {
        const today = new Date().toISOString().split('T')[0]
        const { data } = await api.get('/entries/', { params: { date: today, page_size: 100 } })
        setTodayEntries(data.results || [])
        setTotalToday(data.count ?? (data.results?.length || 0))
        setShowMore(false)
      } else {
        const { data } = await api.get('/entries/today/')
        setTodayEntries(data.entries || [])
        setTotalToday(data.total_today || 0)
        setShowMore(data.show_more || false)
      }
    } catch {
      setTodayEntries([])
    }
  }, [])

  const fetchDashboard = useCallback(async () => {
    await Promise.all([fetchTodayEntries(), fetchMetrics()])
    try {
      const openRes = await api.get('/entries/open_events/')
      setOpenEvents(openRes.data || [])
    } catch {}
    const s = await fetchStreak(api)
    setStreak(s)
  }, [fetchTodayEntries, fetchMetrics])

  useEffect(() => {
    fetchDashboard()
    textareaRef.current?.focus()
  }, [fetchDashboard])

  useEffect(() => {
    if (isRecording) {
      setRecordSecs(0)
      timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRecording])

  useEffect(() => {
    const handleOnline = async () => {
      const synced = await flush(api)
      if (synced > 0) {
        showToastMsg(`تمت مزامنة ${synced} إدخال محفوظ`)
        fetchDashboard()
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [fetchDashboard, showToastMsg])

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const updateTodayEntry = (updated) => {
    setTodayEntries(prev => prev.map(e => {
      if (e.id === updated.id) return { ...e, ...updated }
      if (e.children) {
        return {
          ...e,
          children: e.children.map(c => c.id === updated.id ? { ...c, ...updated } : c)
        }
      }
      return e
    }))
  }

  const addToTodayEntries = (entry) => {
    if (entry.parent_id) {
      setTodayEntries(prev => prev.map(e => {
        if (e.id === entry.parent_id) {
          return { ...e, children: [...(e.children || []), entry] }
        }
        return e
      }))
    } else {
      setTodayEntries(prev => [...prev, entry])
      setTotalToday(n => n + 1)
    }
  }

  const handleSave = async () => {
    if (!text.trim() || isSaving) return
    setIsSaving(true)
    setVoiceWarning('')

    const payload = { text: text.trim(), parent_id: selectedParentId }

    if (!navigator.onLine) {
      enqueue(payload)
      setText('')
      setSelectedParentId(null)
      setSelectedParentText('')
      showToastMsg('محفوظ محلياً — سيُرفع عند عودة الإنترنت')
      setIsSaving(false)
      return
    }

    try {
      const { data } = await api.post('/entries/', payload)
      setText('')
      setSelectedParentId(null)
      setSelectedParentText('')
      setSuggestedCloseEvent(null)
      setLastSavedEntryId(data.id)   // تفعيل CloseSuggestionBanner
      addToTodayEntries(data)
      
      // إذا كان الإدخال يقفل حدثاً مفتوحاً، جلب الأحداث المفتوحة مرة أخرى لتحديث الواجهة
      if (payload.parent_id) {
        api.get('/entries/open_events/').then(res => setOpenEvents(res.data || [])).catch(() => {})
      }
      pollEntryStatus(
        api,
        data.id,
        (updated) => {
          updateTodayEntry(updated)
          setLastReflection({
            reflection: updated.ai_reflection,
            mood_score: updated.mood_score,
            tags: updated.tags,
            entities: updated.entities,
            tag_alerts: [],
          })
          fetchMetrics()
          api.get('/insights/daily/', { params: { date: new Date().toISOString().split('T')[0] } })
            .then(res => {
              const daily = res.data.results?.[0]
              if (daily?.tag_alerts?.length) {
                setLastReflection(prev => ({ ...prev, tag_alerts: daily.tag_alerts }))
              }
            })
            .catch(() => {})
        },
        (reason) => {
          if (reason === 'rate_limited') {
            showToastMsg('الذكاء الاصطناعي مشغول — سيُحلَّل لاحقاً', 'warning')
          } else if (reason === 'analysis_timeout') {
            showToastMsg('استغرق التحليل وقتاً أطول — سيُحدَّث لاحقاً', 'warning')
          } else if (reason === 'failed') {
            showToastMsg('تعذر تحليل الحدث لوجود مشكلة في الخادم', 'error')
          }
          // Update the local entry state to reflect the final failure reason
          updateTodayEntry({ ...data, processing_status: reason })
        }
      )
    } catch {
      enqueue(payload)
      setText('')
      setSelectedParentId(null)
      setSelectedParentText('')
      showToastMsg('حُفظ محلياً', 'info')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleRecord = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      showToastMsg('متصفحك لا يدعم التحويل الصوتي — استخدم Chrome أو Edge', 'error')
      return
    }

    if (isRecordingRef.current) {
      // إيقاف التسجيل
      isRecordingRef.current = false
      speechRef.current?.stop()
      speechRef.current = null
      setIsRecording(false)
      setInterimText('')
      textareaRef.current?.focus()
      return
    }

    // حفظ النص الحالي كـ base (before recording)
    baseTextRef.current = text

    const recognition = new SpeechRecognition()
    recognition.lang = 'ar-EG'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let finalAdded = ''
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalAdded += t
        } else {
          interim = t
        }
      }

      // أضف النص النهائي للـ base
      if (finalAdded) {
        const separator = baseTextRef.current.trim() ? ' ' : ''
        baseTextRef.current = (baseTextRef.current.trimEnd() + separator + finalAdded.trim())
        setText(baseTextRef.current)
      }

      // عرض النص المؤقت
      setInterimText(interim)
    }

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        showToastMsg('يرجى السماح بالوصول للميكروفون', 'error')
        isRecordingRef.current = false
        setIsRecording(false)
      }
      // no-speech: طبيعي لا حاجة لإيقاف
    }

    recognition.onend = () => {
      // إذا لا يزال التسجيل نشطاً (توقف بسبب صمت) — أعد التشغيل تلقائياً
      if (isRecordingRef.current) {
        try { recognition.start() } catch (err) {
          console.warn('Restart failed:', err)
          isRecordingRef.current = false
          setIsRecording(false)
          setInterimText('')
        }
      } else {
        setInterimText('')
      }
    }

    recognition.start()
    speechRef.current = recognition
    isRecordingRef.current = true
    setIsRecording(true)
    setVoiceWarning('')
  }

  const handleTextChange = (e) => {
    const val = e.target.value
    setText(val)
    if (lastReflection) setLastReflection(null)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, window.innerHeight * 0.4) + 'px'

    // Keyword detection للإغلاق التلقائي للأحداث المفتوحة
    if (openEvents.length > 0 && !selectedParentId) {
      const closeKeywords = ['صحيت', 'قمت', 'خلصت', 'وقفت', 'انتهيت', 'رجعت']
      const foundKeyword = closeKeywords.some(kw => val.includes(kw))
      
      if (foundKeyword) {
        // اقتراح إغلاق أول حدث مفتوح
        setSuggestedCloseEvent(openEvents[0])
      } else {
        setSuggestedCloseEvent(null)
      }
    } else {
      setSuggestedCloseEvent(null)
    }
  }

  const handleCloseSuggestedEvent = () => {
    if (suggestedCloseEvent) {
      setSelectedParentId(suggestedCloseEvent.id)
      setSelectedParentText(suggestedCloseEvent.text.slice(0, 60))
      setSuggestedCloseEvent(null)
      textareaRef.current?.focus()
    }
  }

  const handleCloseActiveEvent = (event) => {
    setSelectedParentId(event.id)
    setSelectedParentText(event.text.slice(0, 60))
    setText('انتهيت من الحدث')
    textareaRef.current?.focus()
  }

  const clearParent = () => {
    setSelectedParentId(null)
    setSelectedParentText('')
    textareaRef.current?.focus()
  }

  const handleReply = (id, txt) => {
    setHighlightedId(id)
    setSelectedParentId(id)
    setSelectedParentText(txt.slice(0, 60))
    textareaRef.current?.focus()
    setTimeout(() => setHighlightedId(null), 600)
  }

  const threadView = buildThreadView(todayEntries)
  const visibleEvents = showMore ? threadView : threadView.slice(0, 5)

  const hasPending = todayEntries.some(e => ['pending', 'processing'].includes(e.processing_status))

  return (
    <>
      {/* hasPending overlay removed to allow user interaction while loading */}

      <header className="sticky top-0 z-40 px-4 py-4 flex justify-between items-center bg-bg-deep/80 backdrop-blur">
        <div className="text-[14px] text-text-secondary">{toArabicDate()}</div>
        <div className="text-[13px] text-text-secondary">🔥 {streak} أيام</div>
      </header>

      <main className="pb-24">
        <ReflectionCard data={lastReflection} onDismiss={() => setLastReflection(null)} />

        {selectedParentId && (
          <div className="mx-4 mb-3 bg-bg-elevated border-r-[3px] border-primary rounded-[var(--radius-sm)] px-[14px] py-[10px] flex justify-between items-start">
            <button type="button" onClick={clearParent} className="text-[18px] text-text-muted hover:text-text-primary">✕</button>
            <div className="flex gap-2 flex-1 mr-2">
              <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">reply</span>
              <div>
                <span className="text-[12px] text-text-muted">رد على:</span>
                <p className="text-[13px] text-text-primary line-clamp-1">{selectedParentText}</p>
              </div>
            </div>
          </div>
        )}

        {isRecording && (
          <div className="mx-4 mb-2 bg-[rgba(224,92,92,0.08)] border border-[rgba(224,92,92,0.2)] px-4 py-2 rounded-[var(--radius-sm)] text-center text-sm text-text-primary flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-mood-low animate-pulse" />
              <span>جارٍ الاستماع... تكلم الآن</span>
            </div>
            {interimText && (
              <p className="text-[13px] text-text-muted italic mt-1 max-w-full truncate">「{interimText}」</p>
            )}
          </div>
        )}

        {/* الأحداث المفتوحة (Active Timers) فوق التيكست اريا */}
        {!selectedParentId && (
          <OpenEventsBanner
            onClose={() => {
              fetchTodayEntries()
              fetchMetrics()
            }}
          />
        )}

        <div className="mx-4 mb-2 relative">
          <textarea
            ref={textareaRef}
            className="w-full min-h-[140px] max-h-[40vh] p-4 bg-surface border-[1.5px] border-border rounded-[var(--radius-md)] text-[17px] leading-[1.7] text-text-primary placeholder-text-muted resize-none transition-shadow outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(46,117,182,0.15)]"
            placeholder="ماذا يحدث معك الآن؟"
            value={text}
            onChange={handleTextChange}
            dir="rtl"
          />
          
          {suggestedCloseEvent && (
            <div className="absolute top-[-36px] right-0 left-0 bg-[rgba(76,175,130,0.1)] border border-[rgba(76,175,130,0.3)] text-text-primary text-[12px] px-3 py-1.5 rounded-[var(--radius-sm)] flex justify-between items-center animate-slide-down">
              <span>هل تريد إنهاء حدث "{(suggestedCloseEvent.tags && suggestedCloseEvent.tags[0]) || 'المفتوح'}"؟</span>
              <button onClick={handleCloseSuggestedEvent} className="bg-[rgba(76,175,130,0.2)] text-[var(--mood-high)] px-2 py-1 rounded">نعم، أربط النص</button>
            </div>
          )}

          {voiceWarning && (
            <p className="text-[12px] mt-1" style={{ color: 'var(--mood-mid)' }}>{voiceWarning}</p>
          )}
        </div>

        <div className="flex justify-between items-center px-4 py-3 mb-4">
          <button
            type="button"
            onClick={toggleRecord}
            disabled={false}
            className={`w-[48px] h-[48px] rounded-full flex items-center justify-center border-[1.5px] transition-all
              ${isRecording
                ? 'bg-[rgba(224,92,92,0.15)] border-mood-low text-mood-low animate-pulse'
                : 'bg-surface border-border text-text-secondary'}`}
          >
            <MicIcon active={isRecording} />
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!text.trim() || isSaving}
            className="bg-primary text-white px-7 py-3 rounded-[var(--radius-pill)] font-[600] text-[16px] disabled:opacity-40 transition-opacity flex items-center justify-center min-w-[100px]"
          >
            {isSaving ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'حفظ'}
          </button>
        </div>

        {/* العادات والحالة المزاجية */}
        {(metrics.length > 0 || todayEntries.filter(e => e.mood_score != null).length > 0) && (
          <section className="mb-6">
            <h2 className="text-[13px] text-text-secondary px-4 pb-2">لوحة القيادة</h2>
            <div 
              className="flex overflow-x-auto gap-3 px-4 pb-2 snap-x snap-mandatory hide-scrollbar" 
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <MoodCard score={
                todayEntries.filter(e => e.mood_score != null).length > 0
                  ? (todayEntries.filter(e => e.mood_score != null).reduce((sum, e) => sum + e.mood_score, 0) / todayEntries.filter(e => e.mood_score != null).length).toFixed(1)
                  : '-'
              } />
              
              {metrics.map((m, i) =>
                m.is_duration_based
                  ? <DurationMetricCard key={m.name} metric={m} weeklyData={weeklyMetrics[m.name] || []} index={i} />
                  : <MetricCard key={m.name} metric={m} index={i} />
              )}
            </div>
          </section>
        )}

        <section className="mt-4">
          <h2 className="text-[13px] text-text-secondary px-4 pb-2">أحداث اليوم</h2>
          {visibleEvents.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isChild={entry.isChild || false}
              onReply={!entry.isChild ? handleReply : null}
            />
          ))}
          {threadView.length === 0 && (
            <div className="mx-4 text-center p-4 text-text-muted text-sm border border-dashed border-border rounded-[var(--radius-sm)]">
              لا توجد إدخالات اليوم.
            </div>
          )}
          {showMore && (
            <div className="text-center mt-2">
              <button
                type="button"
                onClick={() => fetchTodayEntries(true)}
                className="text-[13px] text-primary p-2 w-full active:bg-surface transition-colors"
              >
                عرض المزيد ({totalToday - 5})
              </button>
            </div>
          )}
        </section>



        {lastSavedEntryId && (
          <CloseSuggestionBanner
            entryId={lastSavedEntryId}
            onConfirmed={({ metricName, durationHours }) => {
              showToastMsg(`✅ سُجّل ${metricName}: ${durationHours} ساعة`)
              fetchMetrics()
              setLastSavedEntryId(null)
            }}
            onDismissed={() => setLastSavedEntryId(null)}
          />
        )}
      </main>

      <Toast message={toast.msg} type={toast.type} />
    </>
  )
}
