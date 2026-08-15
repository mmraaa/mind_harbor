import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../api/client'
import { roleHome, useAuthStore } from '../stores/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const login = useAuthStore((s) => s.login)

  const [account, setAccount] = useState('student')
  const [password, setPassword] = useState('student123')
  const [error, setError] = useState('')

  if (user) {
    return <Navigate to={roleHome(user.role)} replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const u = await login(account.trim(), password)
      navigate(roleHome(u.role), { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, '账号或密码不正确'))
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="MindHarbor 说明">
        <div className="brand brand--login">
          <span className="brand__mark">MH</span>
          <span>
            <strong>MindHarbor</strong>
            <small>Mind Harbor</small>
          </span>
        </div>
        <div className="login-story__copy">
          <p className="eyebrow">
            <ShieldCheck size={16} style={{ verticalAlign: '-3px' }} /> 私密、克制、有边界
          </p>
          <h1>
            给自己一个
            <br />
            可以停泊的港湾
          </h1>
          <p>你的感受不需要先变得有条理。登录之后，我们从你最想说的一点开始。</p>
        </div>
        <p className="login-boundary">
          <LockKeyhole size={16} /> AI 陪伴不替代专业心理咨询、诊断或治疗。
        </p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="login-card__eyebrow">欢迎回来</p>
          <h2>进入 MindHarbor</h2>
          <p className="login-card__lead">登录后按账号角色进入对应工作台。</p>

          <form onSubmit={onSubmit}>
            <label className="field-label" htmlFor="account">
              账号
            </label>
            <input
              id="account"
              className="text-input"
              autoComplete="username"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            />

            <label className="field-label" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              className="text-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <p className="login-hint" role="alert" style={{ color: 'var(--danger)', textAlign: 'left' }}>
                {error}
              </p>
            )}

            <button className="primary-button login-submit" type="submit" disabled={loading}>
              {loading ? '正在登录…' : '登录'}
            </button>
          </form>

          <p className="login-hint">
            演示账号：student / counselor / admin，密码均为对应名 + 123（如 student123）
          </p>
        </div>
      </section>
    </main>
  )
}
