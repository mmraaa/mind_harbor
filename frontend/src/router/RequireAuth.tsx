import { Navigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'

/** 登录守卫:无 token 跳登录页。 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token)
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
