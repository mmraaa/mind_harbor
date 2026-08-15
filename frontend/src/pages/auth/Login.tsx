import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../stores/auth'
import Lighthouse from '../../components/Lighthouse'
import './auth.css'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuth((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/login', { username, password })
      setAuth(data.access_token, data.user)
      navigate('/student/chat', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || '登录失败,请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <Lighthouse size={56} />
        <h1 className="auth-brand-title">MindHarbor</h1>
        <p className="auth-brand-copy">深夜的港口,总有一盏灯为你亮着。</p>
      </aside>

      <main className="auth-card-wrap">
        <form className="auth-card" onSubmit={submit}>
          <h2 className="auth-card-title">回到你的港湾</h2>
          <label className="auth-field">
            <span>用户名</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label className="auth-field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" disabled={busy}>
            {busy ? '正在靠岸…' : '登录'}
          </button>
          <p className="auth-switch">
            还没有账号?<Link to="/register">注册一个</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
