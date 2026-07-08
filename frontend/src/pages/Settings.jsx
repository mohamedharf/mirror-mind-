import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { deleteAllUserEntries } from '../lib/utils'

export default function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const [showExport, setShowExport] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exportFormat, setExportFormat] = useState('markdown')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const handleLogout = () => { logout(); navigate('/login', { replace:true }) }

  const handleExport = async () => {
    if (!fromDate || !toDate) { setErr('يجب تحديد التواريخ'); return }
    setLoading(true)
    setErr('')
    try {
      const endpoints = {
        markdown: '/export/markdown/',
        json:     '/export/json/',
        csv:      '/export/csv/',
      }
      const { data, headers } = await api.post(endpoints[exportFormat], {
        from_date: fromDate,
        to_date: toDate
      }, { responseType: exportFormat === 'csv' ? 'blob' : 'json' })
      
      const blob = exportFormat === 'csv' 
        ? data 
        : new Blob(
            [exportFormat === 'json' ? JSON.stringify(data.data, null, 2) : data.content],
            { type: exportFormat === 'json' ? 'application/json' : 'text/markdown' }
          )
          
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFormat === 'csv' 
        ? `maraya_${fromDate}_to_${toDate}.csv` 
        : data.filename
      link.click()
      URL.revokeObjectURL(url)
      setShowExport(false)
    } catch {
      setErr('فشل التصدير')
    } finally { setLoading(false) }
  }

  const handleDeleteAll = async () => {
    setLoading(true)
    try {
      await api.delete('/account/delete-data/')
    } catch {
      // Continue with logout even if deletion fails
    } finally {
      setLoading(false)
      logout()
      navigate('/login', { replace:true })
    }
  }

  return (
    <>
      <header className="px-4 py-4 sticky top-0 bg-bg-deep/90 backdrop-blur z-40">
        <h1 className="text-xl font-bold text-text-primary">الإعدادات</h1>
      </header>

      <main className="pb-24">
        {/* User Info */}
        <section className="flex flex-col items-center py-6 border-b border-divider">
          <div className="w-[56px] h-[56px] rounded-full bg-surface border border-border flex items-center justify-center mb-3 overflow-hidden">
            <span className="material-symbols-outlined text-text-muted text-[32px]">person</span>
          </div>
          <h2 className="text-[16px] font-bold text-text-primary">{user?.name || user?.username || 'مستخدم المرايا'}</h2>
          <p className="text-[14px] text-text-secondary mt-1">{user?.email || 'لا يوجد بريد مرتبط'}</p>
        </section>

        {/* List */}
        <section className="flex flex-col">
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-3 p-4 border-b border-divider text-text-primary hover:bg-surface transition-colors text-right"
          >
            <span className="material-symbols-outlined text-text-secondary">upload_file</span>
            <span className="text-[15px] font-medium">تصدير سجلاتي</span>
          </button>

          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-3 p-4 border-b border-divider text-mood-low hover:bg-[rgba(224,92,92,0.05)] transition-colors text-right"
          >
            <span className="material-symbols-outlined">delete_forever</span>
            <span className="text-[15px] font-medium">حذف جميع البيانات</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 p-4 border-b border-divider text-text-primary hover:bg-surface transition-colors text-right"
          >
            <span className="material-symbols-outlined text-text-secondary">logout</span>
            <span className="text-[15px] font-medium">تسجيل الخروج</span>
          </button>
        </section>
      </main>

      {/* Export Bottom Sheet */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-md h-[50vh] bg-surface rounded-t-[24px] p-6 flex flex-col animate-[slideUp_300ms_ease-out]">
            <h3 className="text-lg font-bold text-text-primary mb-4">تصدير سجلاتي</h3>

            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-[13px] text-text-secondary mb-1">من</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full bg-bg-deep border border-border rounded p-3 text-text-primary text-[15px] focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-[13px] text-text-secondary mb-1">إلى</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full bg-bg-deep border border-border rounded p-3 text-text-primary text-[15px] focus:border-primary outline-none" />
              </div>
              
              <div style={{display:'flex', gap:8, margin:'12px 0'}}>
                {['markdown','json','csv'].map(fmt => (
                  <button key={fmt} onClick={() => setExportFormat(fmt)} style={{
                    padding:'6px 14px', borderRadius:'var(--radius-pill)',
                    border:`1px solid ${exportFormat===fmt ? 'var(--primary)':'var(--border)'}`,
                    background: exportFormat===fmt ? 'rgba(46,117,182,0.15)':'var(--bg-surface)',
                    color: exportFormat===fmt ? 'var(--primary)':'var(--text-secondary)',
                    cursor:'pointer', fontSize:13, flex: 1
                  }}>
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
              
              {err && <p className="text-mood-low text-[13px]">{err}</p>}
            </div>

            <div className="space-y-2 mt-4">
              <button
                onClick={handleExport} disabled={loading}
                className="w-full bg-primary text-white py-3.5 rounded-full font-bold text-[15px] disabled:opacity-50"
              >
                {loading ? 'جارٍ التصدير...' : 'تصدير'}
              </button>
              <button
                onClick={() => setShowExport(false)}
                className="w-full py-3.5 text-text-muted font-bold text-[15px]"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Bottom Sheet */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-md bg-surface rounded-t-[24px] p-6 flex flex-col animate-[slideUp_300ms_ease-out]">
            <h3 className="text-lg font-bold text-mood-low mb-2">حذف جميع البيانات</h3>
            <p className="text-[14px] text-text-secondary mb-6 leading-relaxed">
              هذا الإجراء نهائي ولا يمكن التراجع عنه. سيتم مسح كافة سجلاتك وتحليلاتك من النظام.
            </p>

            <div className="space-y-2 mt-auto">
              <button onClick={handleDeleteAll} disabled={loading} className="w-full bg-mood-low text-white py-3.5 rounded-full font-bold text-[15px] disabled:opacity-50">
                {loading ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </button>
              <button onClick={() => setShowDelete(false)} className="w-full py-3.5 text-text-muted font-bold text-[15px]">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
