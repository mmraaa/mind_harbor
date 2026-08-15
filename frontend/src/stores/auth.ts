import { create } from 'zustand'

export interface AuthUser {
  id: number
  username: string
  name: string
  role: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  logout: () => void
}

const KEY = 'mindharbor.auth'

function load(): { token: string | null; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { token: null, user: null }
    const { token, user } = JSON.parse(raw)
    return { token: token ?? null, user: user ?? null }
  } catch {
    return { token: null, user: null }
  }
}

const initial = load()

export const useAuth = create<AuthState>((set) => ({
  token: initial.token,
  user: initial.user,
  setAuth: (token, user) => {
    localStorage.setItem(KEY, JSON.stringify({ token, user }))
    set({ token, user })
  },
  logout: () => {
    localStorage.removeItem(KEY)
    set({ token: null, user: null })
  },
}))
