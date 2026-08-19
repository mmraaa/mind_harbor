import { FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage } from '../../api/client'
import { getAuthPath, getRoleMeta, isRole, roles, type AuthMode } from './roles'
import { roleHome, useAuthStore } from '../../stores/auth'

function isAuthMode(value: string | undefined): value is AuthMode {
  return value === 'login' || value === 'register'
}

export function AuthPage() {
  const { role: roleParam, mode: modeParam } = useParams()
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const logout = useAuthStore((state) => state.logout)
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const validRole = isRole(roleParam) ? roleParam : null
  const validMode = isAuthMode(modeParam) ? modeParam : null

  useEffect(() => {
    if (!validRole || !validMode) {
      return
    }
    setNickname('')
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setSubmitting(false)
    setError('')
  }, [validMode, validRole])

  if (!validRole || !validMode) {
    return <Navigate to={getAuthPath('student', 'login')} replace />
  }

  const role = validRole
  const mode = validMode
  const roleMeta = getRoleMeta(role)
  const isRegister = mode === 'register'
  const alternateMode: AuthMode = isRegister ? 'login' : 'register'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isRegister && confirmPassword !== password) {
      setError('两次输入的密码不一致。')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      if (isRegister && role !== 'student') {
        throw new Error('管理端和咨询师端账号由管理员创建。')
      }
      const user = isRegister
        ? await register(username.trim(), password, nickname.trim())
        : await login(username.trim(), password, role)
      if (user.role !== role) {
        logout()
        throw new Error('账号与所选身份不匹配，请切换到正确的入口。')
      }
      navigate(roleHome(user.role), { replace: true })
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label={`${roleMeta.label}入口自然影像`}>
        <img className="auth-visual-image" src={roleMeta.image} alt="自然与宠物陪伴的温暖场景" />
        <div className="auth-visual-copy">
          <Link className="wordmark wordmark-light" to="/">
            <span className="wordmark-mark">M</span>
            MindHarbor
          </Link>
          <p className="auth-kicker">{roleMeta.kicker}</p>
          <h1>{roleMeta.title}</h1>
          <p>留一点空白，给呼吸，也给重新开始的勇气。</p>
        </div>
        <div className="auth-photo-caption">NATURE / PETS / QUIET COMPANY</div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-panel-inner">
          <Link className="auth-back" to="/">返回首页</Link>
          <p className="eyebrow">{isRegister ? 'START A GENTLE SPACE' : 'WELCOME BACK'}</p>
          <h2 id="auth-heading">{isRegister ? '把这份陪伴带回身边' : '回到为你留着的位置'}</h2>
          <p className="auth-intro">当前以 <strong>{roleMeta.label}</strong> 身份{isRegister ? '创建' : '进入'} MindHarbor。</p>

          <div className="role-switch" aria-label="选择登录身份">
            {roles.map((item) => (
              <button
                key={item}
                className={item === role ? 'is-active' : ''}
                type="button"
                aria-pressed={item === role}
                onClick={() => navigate(getAuthPath(item, mode))}
              >
                {getRoleMeta(item).label}
              </button>
            ))}
          </div>

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
            {isRegister && role !== 'student' && (
              <p className="auth-note" role="status">
                管理端和咨询师端账号由管理员创建，请切换到用户端注册。
              </p>
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
              disabled={submitting || (isRegister && role !== 'student')}
            >
              {submitting ? '正在连接...' : isRegister ? `创建${roleMeta.label}账号` : `以${roleMeta.label}身份登录`}
            </button>
          </form>

          <p className="auth-mode-link">
            {isRegister ? '已经有账号？' : '第一次来到这里？'}
            <Link to={getAuthPath(role, alternateMode)}>{isRegister ? '去登录' : '创建账号'}</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
