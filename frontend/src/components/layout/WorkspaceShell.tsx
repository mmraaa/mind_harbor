import type { LucideIcon } from 'lucide-react'
import { LifeBuoy, LogOut, ShieldCheck } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LocalReminderHost } from '../LocalReminderHost'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'

export type NavItem = {
  label: string
  shortLabel: string
  path: string
  icon: LucideIcon
  end?: boolean
}

type WorkspaceShellProps = {
  brandTo: string
  nav: NavItem[]
  roleNote?: string
  /** 仅学生端需要紧急求助入口 */
  showEmergencyHelp?: boolean
}

function Brand({ to }: { to: string }) {
  return (
    <NavLink className="brand" to={to} aria-label="MindHarbor 首页">
      <span className="brand__mark" aria-hidden>
        MH
      </span>
      <span>
        <strong>MindHarbor</strong>
        <small>情感陪伴助手</small>
      </span>
    </NavLink>
  )
}

function NavigationLinks({ items, mobile = false }: { items: NavItem[]; mobile?: boolean }) {
  return items.map(({ label, shortLabel, path, icon: Icon, end }) => (
    <NavLink
      key={path}
      to={path}
      end={end}
      className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
    >
      <Icon size={mobile ? 18 : 17} strokeWidth={1.8} aria-hidden />
      <span>{mobile ? shortLabel : label}</span>
    </NavLink>
  ))
}

export function WorkspaceShell({
  brandTo,
  nav,
  roleNote,
  showEmergencyHelp = false,
}: WorkspaceShellProps) {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  function onLogout() {
    logout()
    useChatStore.getState().startNewSession()
    useChatStore.setState({ hydrated: false })
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="workspace-header">
        <div className="workspace-header__inner">
          <Brand to={brandTo} />
          <nav className="workspace-nav" aria-label="主要导航">
            <NavigationLinks items={nav} />
          </nav>
          <div className="workspace-header__tools">
            {user?.name && (
              <span className="boundary-chip">{user.name}</span>
            )}
            {roleNote && (
              <span className="boundary-chip">
                <ShieldCheck size={15} aria-hidden />
                {roleNote}
              </span>
            )}
            {showEmergencyHelp && (
              <button className="help-button" type="button">
                <LifeBuoy size={16} aria-hidden />
                紧急求助
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              aria-label="退出登录"
              onClick={onLogout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <header className="mobile-header">
        <Brand to={brandTo} />
        {showEmergencyHelp ? (
          <button className="help-button" type="button" aria-label="紧急求助">
            <LifeBuoy size={16} />
          </button>
        ) : (
          <button
            className="icon-button"
            type="button"
            aria-label="退出登录"
            onClick={onLogout}
          >
            <LogOut size={17} />
          </button>
        )}
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        <NavigationLinks items={nav} mobile />
      </nav>

      {showEmergencyHelp ? <LocalReminderHost /> : null}
    </div>
  )
}
