import { create } from 'zustand'
import { fetchMe, login as apiLogin, register as apiRegister } from '../api/auth'
import { getStoredToken, setStoredToken, type UserOut, type UserRole } from '../api/client'

type AuthState = {
  token: string | null
  user: UserOut | null
  loading: boolean
  bootstrapped: boolean
  bootstrap: () => Promise<void>
  login: (username: string, password: string) => Promise<UserOut>
  register: (username: string, password: string, name?: string) => Promise<UserOut>
  logout: () => void
  homePath: () => string
}

export function roleHome(role: string): string {
  if (role === 'admin') return '/admin/overview'
  if (role === 'counselor') return '/counselor/agent'
  return '/student'
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getStoredToken(),
  user: null,
  loading: false,
  bootstrapped: false,

  bootstrap: async () => {
    const token = getStoredToken()
    if (!token) {
      set({ token: null, user: null, bootstrapped: true })
      return
    }
    try {
      const user = await fetchMe()
      set({ token, user, bootstrapped: true })
    } catch {
      setStoredToken(null)
      set({ token: null, user: null, bootstrapped: true })
    }
  },

  login: async (username, password) => {
    set({ loading: true })
    try {
      const res = await apiLogin(username, password)
      setStoredToken(res.access_token)
      set({ token: res.access_token, user: res.user, loading: false })
      return res.user
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  register: async (username, password, name = '') => {
    set({ loading: true })
    try {
      const res = await apiRegister(username, password, name)
      setStoredToken(res.access_token)
      set({ token: res.access_token, user: res.user, loading: false })
      return res.user
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  logout: () => {
    setStoredToken(null)
    sessionStorage.removeItem('mh_active_session_id')
    set({ token: null, user: null })
  },

  homePath: () => roleHome((get().user?.role as UserRole) || 'student'),
}))
