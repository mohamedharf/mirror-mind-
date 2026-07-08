import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { isAuth, setTokens, setUser } = useAuthStore()

  const [isRegistering, setIsRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [authError, setAuthError] = useState(params.get('error') ? 'فشل تسجيل الدخول بواسطة Google.' : '')

  useEffect(() => {
    if (isAuth) navigate('/', { replace: true })
  }, [isAuth, navigate])

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE}/accounts/google/login/`
  }

  const handleDevLogin = () => {
    window.location.href = `${API_BASE}/api/v1/auth/accounts/dev-login/`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError('')

    try {
      const endpoint = isRegistering ? '/auth/registration/' : '/auth/login/'
      const payload = isRegistering 
        ? { email, password, password1: password, password2: password } // dj-rest-auth registration usually needs password1/password2 or just password depending on config, but email/password is standard for login. Let's send what standard dj-rest-auth requires. Actually, dj-rest-auth registration by default requires `email`, `password1`, `password2`.
        : { email, password }
      
      // Fix payload for registration if needed
      const finalPayload = isRegistering ? { email, password1: password, password2: password } : payload;

      const resp = await api.post(endpoint, finalPayload)
      setTokens(resp.data.access, resp.data.refresh)
      if (resp.data.user) {
        setUser(resp.data.user)
      } else {
        // Fallback user details if API doesn't return it
        setUser({ email })
      }
      navigate('/')
    } catch (err) {
      console.error(err)
      const errorData = err.response?.data
      if (errorData && typeof errorData === 'object') {
        const firstError = Object.values(errorData)[0]
        setAuthError(Array.isArray(firstError) ? firstError[0] : 'حدث خطأ. يرجى التأكد من البيانات.')
      } else {
        setAuthError('حدث خطأ في الاتصال بالخادم.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #1F3864 0%, #0D1B2A 100%)' }}
    >
      <div style={{ height: '8vh' }} />

      <div className="flex flex-col items-center animate-[fadeIn_300ms_ease-in-out]">
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center mb-4"
          style={{ border: '1.5px solid var(--primary)' }}
        >
          <span className="material-symbols-outlined text-[36px] text-text-primary">mirror</span>
        </div>

        <h1 className="font-bold text-text-primary mb-2" style={{ fontSize: '36px' }}>
          المرايا
        </h1>
        <p className="text-text-secondary" style={{ fontSize: '15px' }}>
          مساحتك للتأمل اليومي
        </p>
      </div>

      <div style={{ height: '10vh' }} className="shrink-0" />

      <div className="w-full flex flex-col items-center px-4 animate-[fadeIn_450ms_ease-in-out_150ms_backwards]">
        
        {authError && (
          <p className="text-mood-low text-sm mb-3 text-center bg-red-500/10 p-2 rounded-lg border border-red-500/20 w-[85%] max-w-[340px]">
            {authError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="w-[85%] max-w-[340px] flex flex-col gap-3 mb-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="البريد الإلكتروني"
            required
            className="w-full h-[50px] rounded-2xl bg-surface/50 border border-border px-4 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors text-right"
            dir="rtl"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            required
            className="w-full h-[50px] rounded-2xl bg-surface/50 border border-border px-4 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors text-right"
            dir="rtl"
          />
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-[50px] bg-primary text-white rounded-full font-medium mt-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {isLoading ? 'جاري التحميل...' : (isRegistering ? 'إنشاء حساب جديد' : 'تسجيل الدخول')}
          </button>
          
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering)
              setAuthError('')
            }}
            className="text-text-secondary text-sm mt-1 hover:text-primary transition-colors"
          >
            {isRegistering ? 'لديك حساب بالفعل؟ سجل دخولك' : 'ليس لديك حساب؟ أنشئ حساباً جديداً'}
          </button>
        </form>

        <div className="flex items-center w-[85%] max-w-[340px] mb-6 gap-3">
          <div className="flex-1 h-[1px] bg-border"></div>
          <span className="text-text-muted text-xs">أو</span>
          <div className="flex-1 h-[1px] bg-border"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-[85%] max-w-[340px] h-[56px] bg-white rounded-full flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span style={{ fontSize: '16px', fontWeight: 500, color: '#3C4043' }}>
            الدخول بحساب Google
          </span>
        </button>

        {import.meta.env.DEV && (
          <button
            onClick={handleDevLogin}
            className="w-[85%] max-w-[340px] h-[56px] rounded-full flex items-center justify-center gap-2 border border-border mt-4 text-text-primary active:scale-[0.98] transition-transform"
          >
            🧪 الدخول الوهمي للمطور
          </button>
        )}

        <p className="text-center mt-[20px]" style={{ fontSize: '12px', color: '#6B86A8' }}>
          بياناتك الشخصية مخزّنة بخصوصية تامة ولا تُشارك مع أي طرف
        </p>
      </div>

      <div className="fixed bottom-[24px] w-full text-center text-text-muted" style={{ fontSize: '11px' }}>
        نسخة تجريبية داخلية
      </div>
    </div>
  )
}
