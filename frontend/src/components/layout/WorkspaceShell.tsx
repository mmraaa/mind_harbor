import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LifeBuoy, LogOut, Phone, ShieldCheck, X } from 'lucide-react'
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

function EmergencyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="emergency-overlay" onClick={onClose}>
      <div
        className="emergency-modal"
        role="alertdialog"
        aria-label="紧急求助"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="emergency-modal__close" type="button" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
        <div className="emergency-modal__icon">
          <LifeBuoy size={32} />
        </div>
        <h2>紧急求助</h2>
        <p className="emergency-modal__desc">
          如果你正在经历心理危机或有伤害自己的想法，请立即联系以下资源。你并不孤单。
        </p>

        <div className="emergency-modal__cards">
          <a href="tel:400-161-9995" className="emergency-card emergency-card--primary">
            <Phone size={20} />
            <div>
              <strong>心理危机干预热线</strong>
              <span>400-161-9995（24小时）</span>
            </div>
          </a>
          <a href="tel:010-82951332" className="emergency-card">
            <Phone size={20} />
            <div>
              <strong>北京心理危机研究与干预中心</strong>
              <span>010-82951332</span>
            </div>
          </a>
          <div className="emergency-card">
            <LifeBuoy size={20} />
            <div>
              <strong>校内心理咨询中心</strong>
              <span>工作时间可直接预约（详询学校官网）</span>
            </div>
          </div>
        </div>

        <p className="emergency-modal__footer">
          专业帮助比任何 AI 都更重要——请务必拨打上方热线或联系身边信任的人。
        </p>
      </div>
    </div>
  )
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
  const [showSOS, setShowSOS] = useState(false)

  function onLogout() {
    logout()
    useChatStore.getState().startNewSession()
    useChatStore.setState({ hydrated: false })
    navigate('/login')
  }

  return (
    <div className="app-shell">
      {showSOS && <EmergencyModal onClose={() => setShowSOS(false)} />}

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
              <button className="help-button" type="button" onClick={() => setShowSOS(true)}>
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
          <button className="help-button" type="button" aria-label="紧急求助" onClick={() => setShowSOS(true)}>
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
