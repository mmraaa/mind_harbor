import { FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage } from '../../api/client'
import { authVisual, type AuthMode } from './roles'
import { roleHome, useAuthStore } from '../../stores/auth'

function isAuthMode(value: string | undefined): value is AuthMode {
  return value === 'login' || value === 'register'
}

export function AuthPage() {
  const params = useParams()
  // 兼容 /auth/:mode 和旧路径 /auth/:role/:mode
  const modeParam = params.mode ?? params.role
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const validMode = isAuthMode(modeParam) ? modeParam : null

  useEffect(() => {
    if (!validMode) return
    setNickname('')
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setSubmitting(false)
    setError('')
  }, [validMode])

  if (!validMode) {
    return <Navigate to="/auth/login" replace />
  }

  const mode = validMode
  const isRegister = mode === 'register'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isRegister && confirmPassword !== password) {
      setError('两次输入的密码不一致。')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const user = isRegister
        ? await register(username.trim(), password, nickname.trim())
        : await login(username.trim(), password)
      navigate(roleHome(user.role), { replace: true })
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="登录入口自然影像">
        <img className="auth-visual-image" src={authVisual.image} alt="自然与宠物陪伴的温暖场景" />
        <div className="auth-visual-copy">
          <Link className="wordmark wordmark-light" to="/">
            <span className="wordmark-mark">M</span>
            MindHarbor
          </Link>
          <p className="auth-kicker">{authVisual.kicker}</p>
          <h1>{authVisual.title}</h1>
          <p>留一点空白，给呼吸，也给重新开始的勇气。</p>
        </div>
        <div className="auth-photo-caption">NATURE / PETS / QUIET COMPANY</div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-panel-inner">
          <Link className="auth-back" to="/"> 返回首页</Link>
          <p className="eyebrow">{isRegister ? 'START A GENTLE SPACE' : 'WELCOME BACK'}</p>
          <h2 id="auth-heading">{isRegister ? '把这份陪伴带回身边' : '回到为你留着的位置'}</h2>

          <form className="auth-form" onSubmit={onSubmit}>
            {isRegister && (
              <label>
                <span>昵称</span>
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  autoComplete="nickname"
                  maxLength={40}
                  required
                  placeholder="希望被怎样称呼"
                />
              </label>
            )}
            <label>
              <span>账号</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                minLength={3}
                maxLength={32}
                required
                placeholder="输入账号"
              />
            </label>
            <label>
              <span>密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={6}
                maxLength={128}
                required
                placeholder="至少 6 位字符"
              />
            </label>
            {isRegister && (
              <label>
                <span>确认密码</span>
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                  required
                  placeholder="再次输入密码"
                />
              </label>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? '正在连接...' : isRegister ? '创建用户账号' : '登录'}
            </button>
          </form>

          <p className="auth-mode-link">
            {isRegister ? '已经有账号？' : '第一次来到这里？'}
            <Link to={`/auth/${isRegister ? 'login' : 'register'}`}>{isRegister ? '去登录' : '创建账号'}</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
