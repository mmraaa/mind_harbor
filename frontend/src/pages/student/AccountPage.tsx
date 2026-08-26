import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, Check, ContactRound, KeyRound, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../../api/client'
import { getAccount, updateAccount, updatePassword, type AccountInfo } from '../../api/account'
import { useAuthStore } from '../../stores/auth'

function formatNextChange(value: string | null) {
  if (!value) return '现在可以修改'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '稍后可再次修改' : `${date.toLocaleString('zh-CN')} 后可再次修改`
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
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const data = await getAccount()
      setAccount(data)
      setForm({ name: data.name, gender: data.gender, display_username: data.display_username })
      useAuthStore.setState((current) => current.user ? {
        user: { ...current.user, id: data.id, username: data.account, name: data.name, role: data.role, display_username: data.display_username, gender: data.gender },
      } : current)
    } catch (caught) { setError(getErrorMessage(caught, '用户信息暂时无法加载')) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim() || !form.display_username.trim()) return
    setSavingProfile(true); setError(''); setMessage('')
    try {
      const data = await updateAccount({
        name: form.name.trim(),
        gender: form.gender,
        ...(form.display_username.trim() !== account?.display_username ? { display_username: form.display_username.trim() } : {}),
      })
      setAccount(data); setForm({ name: data.name, gender: data.gender, display_username: data.display_username }); setMessage('用户信息已保存')
      useAuthStore.setState((current) => current.user ? {
        user: { ...current.user, name: data.name, display_username: data.display_username, gender: data.gender },
      } : current)
    } catch (caught) { setError(getErrorMessage(caught, '用户信息保存失败')) } finally { setSavingProfile(false) }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (password.next.length < 6) { setError('新密码至少 6 位'); return }
    if (password.next !== password.confirm) { setError('两次输入的新密码不一致'); return }
    setSavingPassword(true); setError(''); setMessage('')
    try {
      const result = await updatePassword(password.old, password.next)
      setAccount((current) => current ? { ...current, next_password_change_at: result.next_password_change_at } : current)
      setPassword({ old: '', next: '', confirm: '' }); setMessage('密码已更新。为保护账号，7 天内不能再次修改。')
    } catch (caught) { setError(getErrorMessage(caught, '密码修改失败')) } finally { setSavingPassword(false) }
  }

  function onLogout() { logout(); navigate('/login') }
  if (loading) return <p className="inline-state">正在加载用户信息…</p>

  return <div className="account-page">
    <header className="page-header"><div><Link className="account-back" to="/student"><ArrowLeft size={16} />返回陪伴</Link><p className="page-header__eyebrow">ACCOUNT</p><h1>用户信息</h1><p className="page-header__description">管理你的基础资料和账号安全。这里的内容不会进入人物画像或对话记忆。</p></div><ContactRound size={38} strokeWidth={1.3} aria-hidden /></header>
    {error && <p className="archive-alert" role="alert">{error}</p>}
    {message && <p className="inline-state" role="status"><Check size={16} />{message}</p>}
    {account && <>
      <form className="account-panel" onSubmit={(event) => void saveProfile(event)}><div className="account-panel__heading"><div><p className="section-kicker">PROFILE</p><h2>基础资料</h2></div><ContactRound size={22} /></div><div className="account-form-grid"><label><span>姓名</span><input className="text-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={64} required /></label><label><span>性别</span><select className="text-input" value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}><option value="">保密</option><option value="男">男</option><option value="女">女</option><option value="其他">其他</option></select></label><label><span>账号 <small>不可修改</small></span><input className="text-input" value={account.account} readOnly disabled /></label><label><span>用户名 <small>每 7 天可修改一次</small></span><input className="text-input" value={form.display_username} onChange={(event) => setForm((current) => ({ ...current, display_username: event.target.value }))} maxLength={64} required /><em>{formatNextChange(account.next_username_change_at)}</em></label></div><div className="account-actions"><button type="submit" className="primary-button" disabled={savingProfile}>{savingProfile ? '保存中…' : '保存资料'}</button></div></form>
      <form className="account-panel" onSubmit={(event) => void savePassword(event)}><div className="account-panel__heading"><div><p className="section-kicker">SECURITY</p><h2>修改密码</h2></div><KeyRound size={22} /></div><div className="account-form-grid account-form-grid--password"><label><span>当前密码</span><input className="text-input" type="password" autoComplete="current-password" value={password.old} onChange={(event) => setPassword((current) => ({ ...current, old: event.target.value }))} required /></label><label><span>新密码</span><input className="text-input" type="password" autoComplete="new-password" minLength={6} maxLength={64} value={password.next} onChange={(event) => setPassword((current) => ({ ...current, next: event.target.value }))} required /></label><label><span>确认新密码</span><input className="text-input" type="password" autoComplete="new-password" minLength={6} maxLength={64} value={password.confirm} onChange={(event) => setPassword((current) => ({ ...current, confirm: event.target.value }))} required /></label></div><div className="account-security-footer"><span>{formatNextChange(account.next_password_change_at)}</span><button type="submit" className="primary-button" disabled={savingPassword}>{savingPassword ? '更新中…' : '更新密码'}</button></div></form>
      <section className="account-panel account-panel--logout"><div><h2>退出当前账号</h2><p>在这台设备上结束当前登录状态。</p></div><button type="button" className="ghost-button" onClick={onLogout}><LogOut size={16} />退出登录</button></section>
    </>}
  </div>
}
