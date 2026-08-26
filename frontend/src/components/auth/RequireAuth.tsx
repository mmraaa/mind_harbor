import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'

type RoleGuardProps = {
  roles?: string[]
}

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const bootstrapped = useAuthStore((s) => s.bootstrapped)
  const bootstrapError = useAuthStore((s) => s.bootstrapError)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (!bootstrapped) {
    return (
      <div style={{ padding: '30vh 24px', textAlign: 'center', color: 'var(--muted)' }}>
        正在确认登录状态…
      </div>
    )
  }

  if (token && bootstrapError) {
    return (
      <div style={{ padding: '24vh 24px', textAlign: 'center', color: 'var(--muted)' }}>
        <p>{bootstrapError}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
          <button className="primary-button" type="button" onClick={() => void bootstrap()}>
            重试
          </button>
          <button className="ghost-button" type="button" onClick={logout}>
            返回登录
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/** 需登录；可按角色限制 */
export function RequireAuth({ roles }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
