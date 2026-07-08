import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Home from './pages/Home'
import History from './pages/History'
import Habits from './pages/Habits'
import Insights from './pages/Insights'
import Settings from './pages/Settings'

function PrivateRoute({ children }) {
  const { isAuth } = useAuthStore()
  return isAuth ? <Layout>{children}</Layout> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/"              element={<PrivateRoute><Home /></PrivateRoute>} />
        <Route path="/history"       element={<PrivateRoute><History /></PrivateRoute>} />
        <Route path="/habits"        element={<PrivateRoute><Habits /></PrivateRoute>} />
        <Route path="/insights"      element={<PrivateRoute><Insights /></PrivateRoute>} />
        <Route path="/settings"      element={<PrivateRoute><Settings /></PrivateRoute>} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
