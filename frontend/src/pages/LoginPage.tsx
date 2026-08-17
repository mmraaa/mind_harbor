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
  const register = useAuthStore((s) => s.register)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [account, setAccount] = useState('student')
  const [password, setPassword] = useState('student123')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  if (user) {
    return <Navigate to={roleHome(user.role)} replace />
  }

  function switchToRegister() {
    setMode('register')
    setAccount('')
    setPassword('')
    setError('')
  }

  function switchToLogin() {
    setMode('login')
    setAccount('student')
    setPassword('student123')
    setName('')
    setError('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const u =
        mode === 'login'
          ? await login(account.trim(), password)
          : await register(account.trim(), password, name.trim())
      navigate(roleHome(u.role), { replace: true })
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          mode === 'login' ? '账号或密码不正确' : '注册失败，用户名可能已被占用',
        ),
      )
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
          <p className="login-card__eyebrow">{mode === 'login' ? '欢迎回来' : '创建账号'}</p>
          <h2>{mode === 'login' ? '进入 MindHarbor' : '注册学生账号'}</h2>
          <p className="login-card__lead">
            {mode === 'login'
              ? '登录后按账号角色进入对应工作台。'
              : '注册成功后将自动登录（仅学生角色）。'}
          </p>

          <form onSubmit={onSubmit}>
            {mode === 'register' && (
              <>
                <label className="field-label" htmlFor="display-name">
                  昵称
                </label>
                <input
                  id="display-name"
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="希望如何称呼你"
                />
              </>
            )}

            <label className="field-label" htmlFor="account">
              账号
            </label>
            <input
              id="account"
              className="text-input"
              autoComplete="username"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={mode === 'register' ? '3–32 位字母数字下划线' : undefined}
              required
              minLength={mode === 'register' ? 3 : undefined}
              maxLength={32}
            />

            <label className="field-label" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              className="text-input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : undefined}
              required
              minLength={mode === 'register' ? 6 : undefined}
            />

            <div className="login-switch">
              {mode === 'login' ? (
                <button type="button" className="text-link" onClick={switchToRegister}>
                  注册
                </button>
              ) : (
                <button type="button" className="text-link" onClick={switchToLogin}>
                  已有账号，去登录
                </button>
              )}
            </div>

            {error && (
              <p className="login-hint" role="alert" style={{ color: 'var(--danger)', textAlign: 'left' }}>
                {error}
              </p>
            )}

            <button className="primary-button login-submit" type="submit" disabled={loading}>
              {loading ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
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
