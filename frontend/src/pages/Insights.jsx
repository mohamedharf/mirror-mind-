import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts'
import api from '../lib/api'
import { moodToColor } from '../lib/utils'

export default function Insights() {
  const [weeklyData, setWeeklyData] = useState(null)
  const [monthlyData, setMonthlyData] = useState(null)
  const [metricsHistory, setMetricsHistory] = useState(null)
  const [selectedMetric, setSelectedMetric] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('weekly')

  useEffect(() => {
    fetchInsights()
  }, [])

  const fetchInsights = async () => {
    setLoading(true)
    try {
      const [weeklyRes, monthlyRes] = await Promise.all([
        api.get('/insights/weekly/'),
        api.get('/insights/monthly/')
      ])
      if (weeklyRes.data.results?.length > 0) {
        setWeeklyData(weeklyRes.data.results[0])
      }
      if (monthlyRes.data.results?.length > 0) {
        setMonthlyData(monthlyRes.data.results[0])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchMetricHistory = async (name) => {
    try {
      const { data } = await api.get('/metrics/history/', { params: { name, days: 30 } })
      setMetricsHistory(data)
      setSelectedMetric(name)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <div className="text-center py-10 text-text-muted">جارٍ التحميل...</div>

  const hasData = weeklyData || monthlyData
  if (!hasData) {
    return (
      <div className="mx-4 p-8 text-center text-text-muted border border-dashed border-border mt-10 rounded-[var(--radius-sm)]">
        لا توجد بيانات كافية لعرض الرؤى. واصل كتابة يومياتك!
      </div>
    )
  }

  const weeklyAvg = weeklyData?.mood_avg || 0
  const weeklyAvgColor = moodToColor(weeklyAvg)

  const weeklyChartData = weeklyData?.mood_trend?.map((score, i) => ({
    name: ['ن', 'ث', 'أ', 'خ', 'ج', 'س', 'ح'][i] || `ي${i}`,
    score
  })) || []

  const monthlyAvg = monthlyData?.mood_avg || 0
  const monthlyAvgColor = moodToColor(monthlyAvg)

  const monthlyChartData = monthlyData?.mood_trend?.map((score, i) => ({
    name: `أسبوع ${i + 1}`,
    score
  })) || []

  const historyChartData = metricsHistory?.data?.map(d => ({
    name: new Date(d.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
    value: d.value
  })) || []

  return (
    <>
      <header className="px-4 py-4 sticky top-0 bg-bg-deep/90 backdrop-blur z-40">
        <h1 className="text-xl font-bold text-text-primary">تحليلاتك</h1>
      </header>

      <main className="pb-24">
        {/* Mood Summary Card */}
        {weeklyData && tab === 'weekly' && (
          <div
            className="mx-4 mb-4 mt-4 p-5 rounded-[var(--radius-md)] flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #1A2B3C, #243447)' }}
          >
            <div>
              <div className="text-[14px] text-text-secondary mb-2">متوسط مودك هذا الأسبوع</div>
              <div className="flex items-end gap-1 h-8">
                {weeklyChartData.map((d, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-t-sm transition-all"
                    style={{
                      height: `${(d.score / 5) * 100}%`,
                      backgroundColor: moodToColor(d.score)
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="text-[48px] font-bold" style={{ color: weeklyAvgColor }}>
              {weeklyAvg.toFixed(1)}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border mx-4 mb-6">
          <button
            onClick={() => setTab('weekly')}
            className={`flex-1 py-3 text-[14px] font-bold transition-colors ${tab === 'weekly' ? 'text-primary border-b-2 border-primary' : 'text-text-muted'}`}
          >
            أسبوعي
          </button>
          <button
            onClick={() => setTab('monthly')}
            className={`flex-1 py-3 text-[14px] font-bold transition-colors ${tab === 'monthly' ? 'text-primary border-b-2 border-primary' : 'text-text-muted'}`}
          >
            شهري
          </button>
          <button
            onClick={() => setTab('metrics')}
            className={`flex-1 py-3 text-[14px] font-bold transition-colors ${tab === 'metrics' ? 'text-primary border-b-2 border-primary' : 'text-text-muted'}`}
          >
            عادات
          </button>
        </div>

        {tab === 'weekly' && weeklyData && (
          <div className="px-4 space-y-6">

            <section>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{fontSize: 12, fill: 'var(--text-muted)'}} axisLine={false} tickLine={false} />
                    <YAxis domain={[1, 5]} hide />
                    <Tooltip cursor={{stroke: 'var(--border)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', border: 'none', borderRadius: '8px', color: 'var(--text-primary)'}} />
                    <Area type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {weeklyData.metrics_summary && Object.keys(weeklyData.metrics_summary).length > 0 && (
              <section>
                <h2 className="text-[14px] font-bold text-text-primary mb-3">اتجاه عاداتك</h2>
                <div className="bg-surface p-4 rounded-[var(--radius-md)] border border-border space-y-3">
                  {Object.entries(weeklyData.metrics_summary).map(([name, data]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-[13px] text-text-primary">{name}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {data.trend?.slice(-7).map((val, i) => (
                            <div
                              key={i}
                              className="w-1 h-3 rounded-sm"
                              style={{
                                backgroundColor: val > (data.baseline || 0) ? 'var(--mood-high)' : 'var(--mood-low)',
                                opacity: 0.5 + (val / (Math.max(...data.trend) || 1)) * 0.5
                              }}
                            />
                          ))}
                        </div>
                        <span className="text-[12px] text-text-secondary">{data.avg?.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {weeklyData.top_tags && weeklyData.top_tags.length > 0 && (
              <section>
                <h2 className="text-[14px] font-bold text-text-primary mb-3">التصنيفات الأكثر</h2>
                <div className="bg-surface p-4 rounded-[var(--radius-md)] border border-border space-y-4">
                  {weeklyData.top_tags.map(({ tag, count }) => {
                    const maxCount = Math.max(...weeklyData.top_tags.map(t => t.count))
                    const width = (count / maxCount) * 100
                    return (
                      <div key={tag}>
                        <div className="flex justify-between text-[13px] text-text-primary mb-1">
                          <span>{tag}</span>
                          <span className="text-text-secondary">{count} مرة</span>
                        </div>
                        <div className="w-full bg-bg-deep rounded-full h-2 overflow-hidden">
                          <div className="bg-primary h-full rounded-full" style={{ width: `${width}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {weeklyData.patterns && weeklyData.patterns.length > 0 && (
              <section>
                <h2 className="text-[14px] font-bold text-text-primary mb-3">لاحظنا هذا الأسبوع</h2>
                <div className="space-y-3">
                  {weeklyData.patterns.map((pattern, i) => (
                    <div
                      key={i}
                      className="bg-surface p-4 rounded-[var(--radius-md)] border border-border border-r-[3px] border-r-primary"
                    >
                      <p className="text-[13px] text-text-primary leading-relaxed">{pattern}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'monthly' && monthlyData && (
          <div className="px-4 space-y-6">
            <div
              className="p-5 rounded-[var(--radius-md)] flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #1A2B3C, #243447)' }}
            >
              <div>
                <div className="text-[14px] text-text-secondary mb-2">متوسط مودك هذا الشهر</div>
                {monthlyData.prev_month_comparison && (
                  <div className="text-[13px] text-text-secondary">
                    {monthlyData.prev_month_comparison.mood_change > 0 ? (
                      <span style={{ color: 'var(--mood-high)' }}>+{monthlyData.prev_month_comparison.mood_change.toFixed(1)} ↑</span>
                    ) : (
                      <span style={{ color: 'var(--mood-low)' }}>{monthlyData.prev_month_comparison.mood_change.toFixed(1)} ↓</span>
                    )}
                    {' '}مقارنة بالشهر السابق
                  </div>
                )}
              </div>
              <div className="text-[48px] font-bold" style={{ color: monthlyAvgColor }}>
                {monthlyAvg.toFixed(1)}
              </div>
            </div>

            <section>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{fontSize: 12, fill: 'var(--text-muted)'}} axisLine={false} tickLine={false} />
                    <YAxis domain={[1, 5]} hide />
                    <Tooltip cursor={{stroke: 'var(--border)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', border: 'none', borderRadius: '8px', color: 'var(--text-primary)'}} />
                    <Bar dataKey="score" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {monthlyData.suggestions && monthlyData.suggestions.length > 0 && (
              <section>
                <h2 className="text-[14px] font-bold text-text-primary mb-3">اقتراحات</h2>
                <div className="space-y-3">
                  {monthlyData.suggestions.map((suggestion, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-[var(--radius-md)] border-r-[2px] border-r-mood-high"
                      style={{ background: 'rgba(76,175,130,0.08)' }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">💡</span>
                        <p className="text-[13px] text-text-primary leading-relaxed">{suggestion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {monthlyData.prev_month_comparison && (
              <section>
                <h2 className="text-[14px] font-bold text-text-primary mb-3">مقارنة بالشهر السابق</h2>
                <div className="bg-surface p-4 rounded-[var(--radius-md)] border border-border space-y-2">
                  {monthlyData.prev_month_comparison.new_tags && monthlyData.prev_month_comparison.new_tags.length > 0 && (
                    <div className="text-[13px] text-text-primary">
                      <span className="text-text-secondary">تاجز جديدة: </span>
                      {monthlyData.prev_month_comparison.new_tags.join(', ')}
                    </div>
                  )}
                  {monthlyData.prev_month_comparison.dropped_tags && monthlyData.prev_month_comparison.dropped_tags.length > 0 && (
                    <div className="text-[13px] text-text-primary">
                      <span className="text-text-secondary">تاجز اختفت: </span>
                      {monthlyData.prev_month_comparison.dropped_tags.join(', ')}
                    </div>
                  )}
                  {monthlyData.prev_month_comparison.entry_change != null && (
                    <div className="text-[13px] text-text-primary">
                      <span className="text-text-secondary">سجلات أكثر: </span>
                      {monthlyData.prev_month_comparison.entry_change > 0 ? `+${monthlyData.prev_month_comparison.entry_change}` : monthlyData.prev_month_comparison.entry_change}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'monthly' && !monthlyData && (
          <div className="px-4 text-center py-8 text-text-muted">
            التحليلات الشهرية ستتوفر لاحقاً
          </div>
        )}

        {tab === 'metrics' && (
          <div className="px-4 space-y-6">
            <section>
              <h2 className="text-[14px] font-bold text-text-primary mb-3">تاريخ العادات</h2>
              {weeklyData?.metrics_summary && Object.keys(weeklyData.metrics_summary).length > 0 ? (
                <div className="space-y-3">
                  {Object.keys(weeklyData.metrics_summary).map(metricName => (
                    <button
                      key={metricName}
                      onClick={() => fetchMetricHistory(metricName)}
                      className={`w-full p-4 rounded-[var(--radius-md)] border border-border text-right transition-colors ${
                        selectedMetric === metricName ? 'bg-bg-elevated border-primary' : 'bg-surface hover:bg-bg-elevated'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[15px] font-medium text-text-primary">{metricName}</span>
                        <span className="material-symbols-outlined text-text-muted">
                          {selectedMetric === metricName ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center p-4 text-text-muted text-sm border border-dashed border-border rounded-[var(--radius-sm)]">
                  لا توجد عادات محددة بعد
                </div>
              )}
            </section>

            {selectedMetric && metricsHistory && (
              <section>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-[14px] font-bold text-text-primary">{selectedMetric}</h2>
                  <button
                    onClick={() => { setSelectedMetric(null); setMetricsHistory(null); }}
                    className="text-text-muted hover:text-primary"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyChartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{fontSize: 12, fill: 'var(--text-muted)'}} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip cursor={{stroke: 'var(--border)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', border: 'none', borderRadius: '8px', color: 'var(--text-primary)'}} />
                      <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} dot={{fill: 'var(--primary)', r: 4}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}
          </div>
        )}

        <div className="flex border-b border-border mx-4 mb-6">
          <button
            onClick={() => setTab('weekly')}
            className={`flex-1 py-3 text-[14px] font-bold transition-colors ${tab === 'weekly' ? 'text-primary border-b-2 border-primary' : 'text-text-muted'}`}
          >
            أسبوعي
          </button>
          <button
            onClick={() => setTab('monthly')}
            className={`flex-1 py-3 text-[14px] font-bold transition-colors ${tab === 'monthly' ? 'text-primary border-b-2 border-primary' : 'text-text-muted'}`}
          >
            شهري
          </button>
          <button
            onClick={() => setTab('metrics')}
            className={`flex-1 py-3 text-[14px] font-bold transition-colors ${tab === 'metrics' ? 'text-primary border-b-2 border-primary' : 'text-text-muted'}`}
          >
            عادات
          </button>
        </div>
      </main>
    </>
  )
}
