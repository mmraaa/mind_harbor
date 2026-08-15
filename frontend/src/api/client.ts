import axios from 'axios'
import { useAuth } from '../stores/auth'

/** 统一 axios 实例:自动注入 Bearer token。 */
export const api = axios.create({
  baseURL: '/api/v1',
})

api.interceptors.request.use((config) => {
  const { token } = useAuth.getState()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
