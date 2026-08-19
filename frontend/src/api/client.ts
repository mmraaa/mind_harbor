import axios from 'axios'

const TOKEN_KEY = 'mh_access_token'

function tokenStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

export function getStoredToken(): string | null {
  return tokenStorage()?.getItem(TOKEN_KEY) ?? null
}

export function setStoredToken(token: string | null) {
  const storage = tokenStorage()
  if (!storage) return
  if (token) storage.setItem(TOKEN_KEY, token)
  else storage.removeItem(TOKEN_KEY)
}

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_PREFIX || '/api/v1'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      setStoredToken(null)
    }
    return Promise.reject(err)
  },
)

export type UserRole = 'student' | 'counselor' | 'admin'

export type UserOut = {
  id: number
  username: string
  name: string
  role: UserRole | string
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: UserOut
}

export function getErrorMessage(err: unknown, fallback = '请求失败，请稍后重试'): string {
  if (axios.isAxiosError(err)) {
    const payload = err.response?.data as { detail?: unknown; message?: unknown; msg?: unknown; error?: unknown } | undefined
    const detail = payload?.detail ?? payload?.message ?? payload?.msg ?? payload?.error
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && 'msg' in detail[0]) {
      return String((detail[0] as { msg: unknown }).msg)
    }
    if (err.message) return err.message
  }
  if (err instanceof Error) return err.message
  return fallback
}
