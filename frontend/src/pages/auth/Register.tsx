import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../stores/auth'
import Lighthouse from '../../components/Lighthouse'
import './auth.css'

export default function Register() {
  const navigate = useNavigate()
  const setAuth = useAuth((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      const { data } = await api.post('/auth/register', { username, password, name })
      setAuth(data.access_token, data.user)
      navigate('/student/chat', { replace: true })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string | unknown } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '注册失败,请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <Lighthouse size={56} />
        <h1 className="auth-brand-title">MindHarbor</h1>
        <p className="auth-brand-copy">每个人的海面,都需要一座灯塔。</p>
      </aside>

      <main className="auth-card-wrap">
        <form className="auth-card" onSubmit={submit}>
          <h2 className="auth-card-title">点亮你的灯</h2>
          <label className="auth-field">
            <span>用户名(3-32 字符)</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
          </label>
          <label className="auth-field">
            <span>昵称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="怎么称呼你?" />
          </label>
          <label className="auth-field">
            <span>密码(至少 6 位)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" disabled={busy}>
            {busy ? '正在点亮…' : '注册并开始'}
          </button>
          <p className="auth-switch">
            已有账号?<Link to="/login">直接登录</Link>
          </p>
        </form>
      </main>
    </div>
  )
}
