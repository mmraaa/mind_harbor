import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, Check, ContactRound, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../../api/client'
import { getAccount, updateAccount, updatePassword, type AccountInfo } from '../../api/account'
import { useAuthStore } from '../../stores/auth'

function formatNextChange(value: string | null) {
  if (!value) return '现在可以修改'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '稍后可再次修改' : `${date.toLocaleString('zh-CN')} 后可再次修改`
}

function PasswordField({
  label,
  value,
  autoComplete,
  onChange,
  minLength,
}: {
  label: string
  value: string
  autoComplete: string
  onChange: (value: string) => void
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)
  return <label className="account-password-field"><span>{label}</span><div className="password-input-wrap"><input className="text-input" type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} maxLength={64} value={value} onChange={(event) => onChange(event.target.value)} required /><button type="button" className="password-visibility-button" aria-label={visible ? `隐藏${label}` : `显示${label}`} title={visible ? `隐藏${label}` : `显示${label}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}</button></div></label>
}

export default function AccountPage() {
  const navigate = useNavigate()
  const logout = useAuthStore((state) => state.logout)
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [form, setForm] = useState({ name: '', gender: '', display_username: '' })
  const [password, setPassword] = useState({ old: '', next: '', confirm: '' })
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [pageError, setPageError] = useState('')
  const [profileFeedback, setProfileFeedback] = useState({ type: '', text: '' })
  const [passwordFeedback, setPasswordFeedback] = useState({ type: '', text: '' })

  async function load() {
    setLoading(true); setPageError('')
    try {
      const data = await getAccount()
      setAccount(data)
      setForm({ name: data.name, gender: data.gender, display_username: data.display_username })
      useAuthStore.setState((current) => current.user ? {
        user: { ...current.user, id: data.id, username: data.account, name: data.name, role: data.role, display_username: data.display_username, gender: data.gender },
      } : current)
    } catch (caught) { setPageError(getErrorMessage(caught, '用户信息暂时无法加载')) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim() || !form.display_username.trim()) return
    setSavingProfile(true); setProfileFeedback({ type: '', text: '' })
    try {
      const data = await updateAccount({
        name: form.name.trim(),
        gender: form.gender,
        ...(form.display_username.trim() !== account?.display_username ? { display_username: form.display_username.trim() } : {}),
      })
      setAccount(data); setForm({ name: data.name, gender: data.gender, display_username: data.display_username }); setProfileFeedback({ type: 'success', text: '用户信息已保存' })
      useAuthStore.setState((current) => current.user ? {
        user: { ...current.user, name: data.name, display_username: data.display_username, gender: data.gender },
      } : current)
    } catch (caught) { setProfileFeedback({ type: 'error', text: getErrorMessage(caught, '用户信息保存失败') }) } finally { setSavingProfile(false) }
  }

  const passwordMismatch = password.confirm.length > 0 && password.next !== password.confirm

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (password.next.length < 6) { setPasswordFeedback({ type: 'error', text: '新密码至少 6 位' }); return }
    if (passwordMismatch) { setPasswordFeedback({ type: '', text: '' }); return }
    setSavingPassword(true); setPasswordFeedback({ type: '', text: '' })
    try {
      const result = await updatePassword(password.old, password.next)
      setAccount((current) => current ? { ...current, next_password_change_at: result.next_password_change_at } : current)
      setPassword({ old: '', next: '', confirm: '' }); setPasswordFeedback({ type: 'success', text: '密码已更新。为保护账号，7 天内不能再次修改。' })
    } catch (caught) { setPasswordFeedback({ type: 'error', text: getErrorMessage(caught, '密码修改失败') }) } finally { setSavingPassword(false) }
  }

  function onLogout() { logout(); navigate('/login') }
  if (loading) return <p className="inline-state">正在加载用户信息…</p>

  return <div className="account-page">
    <header className="page-header"><div><Link className="account-back" to="/student"><ArrowLeft size={16} />返回陪伴</Link><p className="page-header__eyebrow">ACCOUNT</p><h1>用户信息</h1><p className="page-header__description">管理你的基础资料和账号安全。这里的内容不会进入人物画像或对话记忆。</p></div><ContactRound size={38} strokeWidth={1.3} aria-hidden /></header>
    {pageError && <p className="archive-alert" role="alert">{pageError}</p>}
    {account && <>
      <form className="account-panel" onSubmit={(event) => void saveProfile(event)}><div className="account-panel__heading"><div><p className="section-kicker">PROFILE</p><h2>基础资料</h2></div><ContactRound size={22} /></div><div className="account-form-grid"><label><span>姓名</span><input className="text-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={64} required /></label><label><span>性别</span><select className="text-input" value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}><option value="">保密</option><option value="男">男</option><option value="女">女</option><option value="其他">其他</option></select></label><label><span>账号 <small>不可修改</small></span><input className="text-input" value={account.account} readOnly disabled /></label><label><span>用户名</span><input className="text-input" value={form.display_username} onChange={(event) => setForm((current) => ({ ...current, display_username: event.target.value }))} maxLength={64} required /></label></div>{profileFeedback.text && <p className={`account-feedback account-feedback--${profileFeedback.type}`} role={profileFeedback.type === 'error' ? 'alert' : 'status'}>{profileFeedback.type === 'success' && <Check size={16} aria-hidden />}{profileFeedback.text}</p>}<div className="account-actions"><button type="submit" className="primary-button" disabled={savingProfile}>{savingProfile ? '保存中…' : '保存资料'}</button></div></form>
      <form className="account-panel" onSubmit={(event) => void savePassword(event)}><div className="account-panel__heading"><div><p className="section-kicker">SECURITY</p><h2>修改密码</h2></div><KeyRound size={22} /></div><div className="account-form-grid account-form-grid--password"><PasswordField label="当前密码" autoComplete="current-password" value={password.old} onChange={(value) => setPassword((current) => ({ ...current, old: value }))} /><PasswordField label="新密码" autoComplete="new-password" minLength={6} value={password.next} onChange={(value) => setPassword((current) => ({ ...current, next: value }))} /><PasswordField label="确认新密码" autoComplete="new-password" minLength={6} value={password.confirm} onChange={(value) => setPassword((current) => ({ ...current, confirm: value }))} /></div><p className="account-password-hint">密码至少 6 位</p>{passwordMismatch && <p className="account-feedback account-feedback--error" role="alert">两次输入的新密码不一致</p>}{passwordFeedback.text && <p className={`account-feedback account-feedback--${passwordFeedback.type}`} role={passwordFeedback.type === 'error' ? 'alert' : 'status'}>{passwordFeedback.type === 'success' && <Check size={16} aria-hidden />}{passwordFeedback.text}</p>}<div className="account-security-footer"><span>{formatNextChange(account.next_password_change_at)}</span><button type="submit" className="primary-button" disabled={savingPassword}>{savingPassword ? '更新中…' : '更新密码'}</button></div></form>
      <section className="account-panel account-panel--logout"><div><h2>退出当前账号</h2><p>在这台设备上结束当前登录状态。</p></div><button type="button" className="ghost-button" onClick={onLogout}><LogOut size={16} />退出登录</button></section>
    </>}
  </div>
}
