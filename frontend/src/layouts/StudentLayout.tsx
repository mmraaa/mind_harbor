import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import Lighthouse from '../components/Lighthouse'
import './layout.css'

const NAV_ITEMS = [
  { to: '/student/chat', label: '聊天', icon: '💬' },
  { to: '/student/journal', label: '情绪日记', icon: '📖' },
  { to: '/student/favorites', label: '收藏与历史', icon: '✦' },
  { to: '/student/profile', label: '我的', icon: '⚓' },
]

/** 学生端外壳:桌面左侧竖导航 + 移动底部 tab。 */
export default function StudentLayout() {
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()

  return (
    <div className="layout">
      <aside className="layout-side">
        <div className="layout-brand">
          <Lighthouse size={34} />
          <span className="layout-brand-name">MindHarbor</span>
        </div>
        <nav className="layout-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-item is-active' : 'nav-item')}
            >
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="layout-side-foot">
          <span className="layout-user">{user?.name || user?.username}</span>
          <button
            className="layout-logout"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            退出
          </button>
        </div>
      </aside>

      <main className="layout-main">
        <Outlet />
      </main>

      <nav className="layout-tabbar">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'tab-item is-active' : 'tab-item')}
          >
            <span className="tab-icon" aria-hidden>{item.icon}</span>
            <span className="tab-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
