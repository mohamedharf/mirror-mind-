import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { setTokens } = useAuthStore()
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const access = params.get('access')
    const refresh = params.get('refresh')

    if (access && refresh) {
      setTokens(access, refresh)
      window.history.replaceState(null, '', '/auth/callback')
      navigate('/', { replace: true })
    } else {
      navigate('/login?error=auth_failed', { replace: true })
    }
  }, [navigate, setTokens])

  return (
    <div className="flex flex-col justify-center items-center h-screen gap-4 text-text-secondary">
      <div
        className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"
        role="status"
      />
      <span className="text-[0.95rem]">جارٍ تسجيل الدخول...</span>
    </div>
  )
}
