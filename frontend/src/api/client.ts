import axios from 'axios'

const TOKEN_KEY = 'mh_access_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export const api = axios.create({
  baseURL: '/api/v1',
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
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
    if (err.message) return err.message
  }
  if (err instanceof Error) return err.message
  return fallback
}
