import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import './profile.css'

const ROLE_LABEL: Record<string, string> = {
  student: '学生',
  counselor: '咨询师',
  admin: '管理员',
}

export default function Profile() {
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()

  return (
    <div className="profile-page">
      <header className="page-head">
        <h2 className="page-title">我的</h2>
      </header>

      <div className="profile-card">
        <div className="profile-avatar" aria-hidden>
          {(user?.name || user?.username || '?').slice(0, 1)}
        </div>
        <div className="profile-info">
          <p className="profile-name">{user?.name || user?.username}</p>
          <p className="profile-meta">
            @{user?.username} · {ROLE_LABEL[user?.role || ''] || user?.role}
          </p>
        </div>
      </div>

      <div className="profile-tips">
        <h3 className="tips-title">关于 MindHarbor</h3>
        <p className="tips-text">
          MindHarbor 是面向大学生的 AI 情感陪伴助手。我能陪你聊聊情绪、查心理科普、
          做呼吸练习、推荐校园资源,并在每次对话结束时为你写下一篇情绪日记。
        </p>
        <p className="tips-warn">
          如果你正处于危机中,请优先联系危机干预热线或校内心理咨询中心——专业帮助比陪伴更重要。
        </p>
      </div>

      <button
        className="profile-logout"
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
      >
        退出登录
      </button>
    </div>
  )
}
