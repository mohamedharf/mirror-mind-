import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  accessToken: localStorage.getItem('access_token'),
  refreshToken: localStorage.getItem('refresh_token'),
  isAuth: !!localStorage.getItem('access_token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  setTokens: (access, refresh) => {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
    set({ accessToken: access, refreshToken: refresh, isAuth: true })
  },

  setUser: (userData) => {
    localStorage.setItem('user', JSON.stringify(userData))
    set({ user: userData })
  },

  logout: () => {
    localStorage.clear()
    set({ accessToken: null, refreshToken: null, isAuth: false, user: null })
  },
}))
