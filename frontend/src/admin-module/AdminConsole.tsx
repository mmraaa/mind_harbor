import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Archive,
  Check,
  CircleOff,
  Edit3,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { getErrorMessage } from '../api/client'
import { adminApi } from './adminApi'
import type {
  Counselor,
  CounselorCreatePayload,
  CounselorUpdatePayload,
  Resource,
  ResourcePayload,
  Student,
  AdminOverview,
  AdminApiConfig,
  AdminApiConfigUpdate,
} from './adminTypes'
import './admin.css'

function StatusPill({ enabled, activeLabel = '启用', disabledLabel = '停用' }: { enabled: boolean; activeLabel?: string; disabledLabel?: string }) {
  return <span className={`admin-status ${enabled ? 'admin-status--on' : 'admin-status--off'}`}>{enabled ? <Check size={13} aria-hidden /> : <CircleOff size={13} aria-hidden />}{enabled ? activeLabel : disabledLabel}</span>
}

function LoadingState() {
  return <div className="admin-state admin-state--loading" role="status"><LoaderCircle size={20} className="admin-spin" aria-hidden />正在同步数据…</div>
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="admin-state admin-state--error" role="alert"><AlertTriangle size={20} aria-hidden /><span>{message}</span><button type="button" className="ghost-button" onClick={onRetry}>重试</button></div>
}

function AdminDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = <div className="admin-dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="admin-dialog__head"><div><p className="admin-kicker">运营维护</p><h2 id="admin-dialog-title">{title}</h2></div><button type="button" className="icon-button" aria-label="关闭弹层" onClick={onClose}><X size={18} /></button></div>{children}</section></div>
  return createPortal(dialog, document.body)
}

function AdminPageHeader({ eyebrow, title, description, count, onAdd, addLabel }: { eyebrow: string; title: string; description: string; count: number; onAdd?: () => void; addLabel?: string }) {
  return <header className="admin-hero"><div><p className="admin-kicker">{eyebrow}</p><h1>{title}</h1><p className="admin-hero__description">{description}</p></div><div className="admin-hero__aside"><span className="admin-count"><strong>{count}</strong> 条记录</span>{onAdd && addLabel && <button type="button" className="primary-button" onClick={onAdd}><Plus size={17} aria-hidden />{addLabel}</button>}</div></header>
}

function AdminBoundary({ children }: { children: ReactNode }) {
  return <div className="admin-boundary admin-boundary--new"><ShieldCheck size={19} aria-hidden /><div><strong>权限边界</strong><p>{children}</p></div></div>
}

function SearchBar({ value, onChange, onSubmit, placeholder }: { value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder: string }) {
  return <form className="admin-search" onSubmit={(event) => { event.preventDefault(); onSubmit() }}><Search size={18} aria-hidden /><input aria-label="检索" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><button type="submit" className="ghost-button">查询</button></form>
}

function ApiConfigForm({ initial, onCancel, onSaved }: { initial: AdminApiConfig; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ enabled: initial.enabled, base_url: initial.base_url ?? '', model: initial.model ?? '', api_key: '', context_window: String(initial.context_window ?? ''), max_tokens: String(initial.max_tokens ?? ''), timeout_seconds: String(initial.timeout_seconds), token_budget: String(initial.token_budget ?? ''), fallback_enabled: initial.fallback.enabled, fallback_base_url: initial.fallback.base_url ?? '', fallback_model: initial.fallback.model ?? '', fallback_api_key: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [usage, setUsage] = useState(initial.usage)
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((current) => ({ ...current, [key]: value })) }
  const numberValue = (value: string) => value ? Number(value) : undefined
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true)
    const payload: AdminApiConfigUpdate = { enabled: form.enabled, base_url: form.base_url, model: form.model, context_window: numberValue(form.context_window), max_tokens: numberValue(form.max_tokens), timeout_seconds: numberValue(form.timeout_seconds), token_budget: numberValue(form.token_budget), fallback: { enabled: form.fallback_enabled, base_url: form.fallback_base_url, model: form.fallback_model } }
    if (form.api_key.trim()) payload.api_key = form.api_key.trim()
    if (form.fallback_api_key.trim()) payload.fallback!.api_key = form.fallback_api_key.trim()
    try { await adminApi.updateApiConfig(initial.service_id, payload); setForm((current) => ({ ...current, api_key: '', fallback_api_key: '' })); await onSaved() } catch (caught) { setTestResult(getErrorMessage(caught)) } finally { setSaving(false) }
  }
  async function testConnection() { setTesting(true); setTestResult('正在测试…'); try { const result = await adminApi.testApiConfig(initial.service_id); setTestResult(result.status === 'reachable' ? '连接可达，鉴权通过' : result.status === 'contract' ? '服务接口路径可达，但未发送内容，尚未执行模型推理验证。' : result.status === 'rate_limited' ? '服务接口可达，但当前触发了限流，请稍后再试。' : result.status === 'upstream_error' ? '服务接口可达，但上游暂时异常。' : result.status === 'invalid' ? '地址可达，但鉴权或接口路径无效。' : '无法连接，请检查地址与网络') } catch (caught) { setTestResult(getErrorMessage(caught)) } finally { setTesting(false) } }
  async function validateModel() { setTesting(true); setTestResult('正在验证模型，可能消耗少量 Token…'); try { const result = await adminApi.validateDoodleApi(); if (result.status === 'verified' && result.usage) { setUsage((current) => ({ ...current, prompt_tokens: current.prompt_tokens + result.usage!.prompt_tokens, completion_tokens: current.completion_tokens + result.usage!.completion_tokens, total_tokens: current.total_tokens + result.usage!.total_tokens, request_count: current.request_count + 1, remaining_tokens: current.remaining_tokens === null ? null : Math.max(0, current.remaining_tokens - result.usage!.total_tokens) })) } else if (result.status !== 'reachable') { setUsage((current) => ({ ...current, request_count: current.request_count + 1, failure_count: current.failure_count + 1 })) } setTestResult(result.status === 'verified' ? `模型验证通过，已记录 ${result.usage?.total_tokens ?? 0} Token` : result.status === 'rate_limited' ? '模型接口可达，但当前触发了限流，请稍后再试。' : result.status === 'upstream_error' ? '模型接口可达，但上游暂时异常。' : result.status === 'invalid' ? '模型接口可达，但鉴权、模型或请求格式无效。' : '模型验证未完成，请检查地址与网络') } catch (caught) { setTestResult(getErrorMessage(caught)) } finally { setTesting(false) } }
  return <form className="admin-form" onSubmit={(event) => void submit(event)}><div className="admin-form__grid"><label className="admin-toggle"><input type="checkbox" checked={form.enabled} onChange={(event) => set('enabled', event.target.checked)} /><span>启用此服务</span></label><label><span>模型</span><input className="text-input" value={form.model} onChange={(event) => set('model', event.target.value)} required /></label><label className="admin-form__wide"><span>基础 URL</span><input className="text-input" type="url" value={form.base_url} onChange={(event) => set('base_url', event.target.value)} required /></label><label><span>API Key（留空保持原值）</span><input className="text-input" type="password" autoComplete="new-password" value={form.api_key} onChange={(event) => set('api_key', event.target.value)} placeholder={initial.api_key_masked ?? '未配置'} /></label><label><span>上下文窗口</span><input className="text-input" type="number" min={256} value={form.context_window} onChange={(event) => set('context_window', event.target.value)} /></label><label><span>最大输出 Token</span><input className="text-input" type="number" min={1} value={form.max_tokens} onChange={(event) => set('max_tokens', event.target.value)} /></label><label><span>超时（秒）</span><input className="text-input" type="number" min={1} max={600} value={form.timeout_seconds} onChange={(event) => set('timeout_seconds', event.target.value)} /></label><label><span>Token 预算</span><input className="text-input" type="number" min={0} value={form.token_budget} onChange={(event) => set('token_budget', event.target.value)} /></label></div><div className="admin-usage-summary"><span>已用 {usage.total_tokens.toLocaleString()} Token</span><span>请求 {usage.request_count} 次</span><span>失败 {usage.failure_count} 次</span><span>{usage.remaining_tokens === null ? '未设预算' : `剩余 ${usage.remaining_tokens.toLocaleString()}`}</span></div><div className="admin-fallback-box"><label className="admin-toggle"><input type="checkbox" checked={form.fallback_enabled} onChange={(event) => set('fallback_enabled', event.target.checked)} /><span>启用备用 API</span></label>{form.fallback_enabled && <div className="admin-form__grid"><label className="admin-form__wide"><span>备用基础 URL</span><input className="text-input" type="url" value={form.fallback_base_url} onChange={(event) => set('fallback_base_url', event.target.value)} required /></label><label><span>备用模型</span><input className="text-input" value={form.fallback_model} onChange={(event) => set('fallback_model', event.target.value)} required /></label><label><span>备用 API Key（留空保持原值）</span><input className="text-input" type="password" autoComplete="new-password" value={form.fallback_api_key} onChange={(event) => set('fallback_api_key', event.target.value)} placeholder={initial.fallback.api_key_masked ?? '未配置'} /></label></div>}</div>{testResult && <div className="admin-test-result" role="status">{testResult}</div>}<div className="admin-dialog__actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button type="button" className="ghost-button" onClick={() => void testConnection()} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>{initial.service_id === 'doodle_review' && <button type="button" className="ghost-button" onClick={() => void validateModel()} disabled={testing}>{testing ? '验证中…' : '验证模型（消耗少量 Token）'}</button>}<button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存配置'}</button></div></form>
}

export function AdminOverviewPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [apiConfigs, setApiConfigs] = useState<AdminApiConfig[]>([])
  const [editingApi, setEditingApi] = useState<AdminApiConfig | undefined>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [summary, configs] = await Promise.all([adminApi.getOverview(), adminApi.listApiConfigs()])
      setOverview(summary)
      setApiConfigs(configs)
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return <div className="admin-console">
    <AdminPageHeader eyebrow="ADMIN / OVERVIEW" title="运营总览" description="查看平台运营状态，个人心理内容仍由咨询师端负责。" count={overview?.resources ?? 0} />
    <AdminBoundary>这里只显示聚合运营数据，不包含学生日记、消息、情绪趋势或心理档案。</AdminBoundary>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : overview && <>
      <section className="admin-overview-grid">
        {[{ label: '学生账号', value: overview.students, hint: '已注册学生' }, { label: '咨询师', value: overview.counselors, hint: '服务团队成员' }, { label: '心理资源', value: overview.resources, hint: `${overview.active_resources} 条已上架` }, { label: '停用账号', value: overview.disabled_accounts, hint: `${overview.enabled_accounts} 条账号可用` }].map((card) => <article className="admin-overview-card" key={card.label}><span className="admin-overview-card__label">{card.label}</span><strong>{card.value}</strong><small>{card.hint}</small></article>)}
      </section>
      <section className="admin-api-panel">
        <div className="admin-table-panel__head"><div><p className="admin-kicker">API CONTROL</p><h2>API 服务管理</h2><span className="admin-muted">密钥仅显示掩码；保存后由服务端加密保管</span></div><button type="button" className="ghost-button" onClick={() => void load()}>刷新状态</button></div>
        <div className="admin-api-list">{apiConfigs.map((service) => <article className="admin-api-row" key={service.service_id}><div><strong>{service.label}</strong><small>{service.model || '未设置模型'} · {service.api_key_configured ? service.api_key_masked : '未配置密钥'}</small></div><div className="admin-api-meta"><span className={`admin-status ${service.enabled ? 'admin-status--on' : 'admin-status--off'}`}>{service.enabled ? '已启用' : '已停用'}</span><small>{service.usage.total_tokens.toLocaleString()} Token · 失败 {service.usage.failure_count} 次</small><button type="button" className="ghost-button admin-action" onClick={() => setEditingApi(service)}><Edit3 size={15} aria-hidden />配置</button></div></article>)}</div>
      </section>
      {editingApi && <AdminDialog title={`配置${editingApi.label}`} onClose={() => setEditingApi(undefined)}><ApiConfigForm initial={editingApi} onCancel={() => setEditingApi(undefined)} onSaved={async () => { setEditingApi(undefined); await load() }} /></AdminDialog>}
    </>}
  </div>
}

function CounselorForm({ initial, onSubmit, onCancel, saving }: { initial?: Counselor; onSubmit: (payload: CounselorCreatePayload | CounselorUpdatePayload) => Promise<void>; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState({ username: initial?.username ?? '', password: '', name: initial?.name ?? '', title: initial?.title ?? '', specialty: initial?.specialty ?? '', bio: initial?.bio ?? '', availability: initial?.availability ?? '', is_enabled: initial?.is_enabled ?? true })
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((current) => ({ ...current, [key]: value })) }
  async function submit(event: FormEvent) { event.preventDefault(); await onSubmit(initial ? { name: form.name, password: form.password || undefined, title: form.title, specialty: form.specialty, bio: form.bio, availability: form.availability, is_enabled: form.is_enabled } : { username: form.username, password: form.password, name: form.name, title: form.title, specialty: form.specialty, bio: form.bio, availability: form.availability }) }
  return <form className="admin-form" onSubmit={submit}><div className="admin-form__grid">{!initial && <label><span>登录账号</span><input className="text-input" value={form.username} onChange={(event) => set('username', event.target.value)} minLength={3} required /></label>}<label><span>姓名</span><input className="text-input" value={form.name} onChange={(event) => set('name', event.target.value)} required /></label><label><span>{initial ? '重置密码（可选）' : '初始密码'}</span><input className="text-input" type="password" value={form.password} onChange={(event) => set('password', event.target.value)} minLength={6} required={!initial} /></label><label><span>职称</span><input className="text-input" value={form.title} onChange={(event) => set('title', event.target.value)} /></label><label className="admin-form__wide"><span>专长领域</span><input className="text-input" value={form.specialty} onChange={(event) => set('specialty', event.target.value)} placeholder="例如：学业压力、睡眠、人际关系" /></label><label className="admin-form__wide"><span>可预约信息</span><input className="text-input" value={form.availability} onChange={(event) => set('availability', event.target.value)} placeholder="例如：工作日 09:00-17:00" /></label><label className="admin-form__wide"><span>简介</span><textarea className="text-area" value={form.bio} onChange={(event) => set('bio', event.target.value)} rows={3} /></label></div>{initial && <label className="admin-toggle"><input type="checkbox" checked={form.is_enabled} onChange={(event) => set('is_enabled', event.target.checked)} /><span>允许该咨询师登录与接待预约</span></label>}<div className="admin-dialog__actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存资料'}</button></div></form>
}

export function CounselorsAdminPage() {
  const [items, setItems] = useState<Counselor[]>([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editing, setEditing] = useState<Counselor | undefined>(); const [creating, setCreating] = useState(false); const [saving, setSaving] = useState(false)
  async function load() { setLoading(true); setError(''); try { setItems((await adminApi.listCounselors(query)).items) } catch (caught) { setError(getErrorMessage(caught)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  async function save(payload: CounselorCreatePayload | CounselorUpdatePayload) { setSaving(true); try { if (editing) await adminApi.updateCounselor(editing.user_id, payload); else await adminApi.createCounselor(payload as CounselorCreatePayload); setEditing(undefined); setCreating(false); await load() } catch (caught) { setError(getErrorMessage(caught)) } finally { setSaving(false) } }
  return <div className="admin-console"><AdminPageHeader eyebrow="ADMIN / PEOPLE" title="咨询师管理" description="维护咨询师资料、专长领域与可预约信息。" count={items.length} onAdd={() => setCreating(true)} addLabel="新增咨询师" /><AdminBoundary>这里只管理账号与服务资料，不读取学生日记、消息和详细心理数据。</AdminBoundary><SearchBar value={query} onChange={setQuery} onSubmit={() => void load()} placeholder="按姓名或登录账号检索" />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : <section className="admin-table-panel"><div className="admin-table-panel__head"><div><p className="admin-kicker">COUNSELOR DIRECTORY</p><h2>服务团队</h2></div><span className="admin-muted">资料变更即时保存</span></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>咨询师</th><th>专长领域</th><th>可预约</th><th>账号状态</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.user_id}><td><div className="admin-person"><span className="admin-avatar"><UserRound size={17} aria-hidden /></span><span><strong>{item.name}</strong><small>{item.username} · {item.title || '未填写职称'}</small></span></div></td><td>{item.specialty || <span className="admin-muted">未填写</span>}</td><td>{item.availability || <span className="admin-muted">待排班</span>}</td><td><StatusPill enabled={item.is_enabled} /></td><td><button type="button" className="ghost-button admin-action" onClick={() => setEditing(item)}><Edit3 size={15} aria-hidden />编辑</button></td></tr>)}</tbody></table>{items.length === 0 && <div className="admin-empty">暂无咨询师资料，先新增一位服务成员。</div>}</div></section>}{(creating || editing) && <AdminDialog title={creating ? '新增咨询师' : '编辑咨询师资料'} onClose={() => { setCreating(false); setEditing(undefined) }}><CounselorForm initial={editing} onSubmit={save} onCancel={() => { setCreating(false); setEditing(undefined) }} saving={saving} /></AdminDialog>}</div>
}

function StudentForm({ initial, onSubmit, onCancel, saving }: { initial: Student; onSubmit: (payload: { name: string; risk_tags: string[]; is_enabled: boolean }) => Promise<void>; onCancel: () => void; saving: boolean }) {
  const [name, setName] = useState(initial.name); const [tags, setTags] = useState(initial.risk_tags.join('、')); const [enabled, setEnabled] = useState(initial.is_enabled)
  return <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void onSubmit({ name, risk_tags: tags.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean), is_enabled: enabled }) }}><div className="admin-student-summary"><span className="admin-avatar"><UserRound size={17} aria-hidden /></span><div><strong>{initial.name}</strong><small>{initial.username}</small></div></div><label><span>显示名称</span><input className="text-input" value={name} onChange={(event) => setName(event.target.value)} required /></label><label><span>风险标签</span><input className="text-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔，例如：关注、睡眠" /></label><label className="admin-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>允许该学生登录</span></label><div className="admin-dialog__actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存账号'}</button></div></form>
}

export function StudentsAdminPage() {
  const [items, setItems] = useState<Student[]>([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editing, setEditing] = useState<Student | undefined>(); const [saving, setSaving] = useState(false)
  async function load() { setLoading(true); setError(''); try { setItems((await adminApi.listStudents(query)).items) } catch (caught) { setError(getErrorMessage(caught)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  async function save(payload: { name: string; risk_tags: string[]; is_enabled: boolean }) { if (!editing) return; setSaving(true); try { await adminApi.updateStudent(editing.id, payload); setEditing(undefined); await load() } catch (caught) { setError(getErrorMessage(caught)) } finally { setSaving(false) } }
  return <div className="admin-console"><AdminPageHeader eyebrow="ADMIN / ACCOUNTS" title="学生用户管理" description="检索学生账号、维护风险标签，并控制账号启停。" count={items.length} /><AdminBoundary>管理员只维护账号状态与运营标签；学生日记、消息和详细心理数据归咨询师工作台处理。</AdminBoundary><SearchBar value={query} onChange={setQuery} onSubmit={() => void load()} placeholder="按姓名或账号检索学生" />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : <section className="admin-table-panel"><div className="admin-table-panel__head"><div><p className="admin-kicker">STUDENT ACCOUNTS</p><h2>账号目录</h2></div><span className="admin-muted">仅显示运营字段</span></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>学生</th><th>风险标签</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="admin-person"><span className="admin-avatar admin-avatar--sky"><UserRound size={17} aria-hidden /></span><span><strong>{item.name}</strong><small>{item.username}</small></span></div></td><td><div className="admin-tags">{item.risk_tags.length ? item.risk_tags.map((tag) => <span className="chip chip--risk" key={tag}>{tag}</span>) : <span className="admin-muted">暂无标签</span>}</div></td><td><StatusPill enabled={item.is_enabled} activeLabel="正常" disabledLabel="已停用" /></td><td><button type="button" className="ghost-button admin-action" onClick={() => setEditing(item)}><Edit3 size={15} aria-hidden />编辑</button></td></tr>)}</tbody></table>{items.length === 0 && <div className="admin-empty">没有找到匹配账号。</div>}</div></section>}{editing && <AdminDialog title="编辑学生账号" onClose={() => setEditing(undefined)}><StudentForm initial={editing} onSubmit={save} onCancel={() => setEditing(undefined)} saving={saving} /></AdminDialog>}</div>
}

function ResourceForm({ initial, onSubmit, onCancel, saving }: { initial?: Resource; onSubmit: (payload: ResourcePayload) => Promise<void>; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState<ResourcePayload>({ title: initial?.title ?? '', type: initial?.type ?? 'article', content: initial?.content ?? '', url: initial?.url ?? '', is_active: initial?.is_active ?? true }); function set<K extends keyof ResourcePayload>(key: K, value: ResourcePayload[K]) { setForm((current) => ({ ...current, [key]: value })) }
  return <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void onSubmit(form) }}><label><span>资源标题</span><input className="text-input" value={form.title} onChange={(event) => set('title', event.target.value)} required /></label><div className="admin-form__grid"><label><span>资源类型</span><select className="text-input" value={form.type} onChange={(event) => set('type', event.target.value)}><option value="article">科普文章</option><option value="practice">练习引导</option><option value="campus">校园服务</option><option value="video">视频</option></select></label><label><span>外部链接（可选）</span><input className="text-input" value={form.url} onChange={(event) => set('url', event.target.value)} /></label></div><label><span>资源内容</span><textarea className="text-area" value={form.content} onChange={(event) => set('content', event.target.value)} rows={6} required /></label><label className="admin-toggle"><input type="checkbox" checked={form.is_active} onChange={(event) => set('is_active', event.target.checked)} /><span>立即上架，允许 Agent 推荐</span></label><div className="admin-dialog__actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存资源'}</button></div></form>
}

export function ResourcesAdminPage() {
  const [items, setItems] = useState<Resource[]>([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editing, setEditing] = useState<Resource | undefined>(); const [creating, setCreating] = useState(false); const [saving, setSaving] = useState(false)
  async function load() { setLoading(true); setError(''); try { setItems((await adminApi.listResources(query)).items) } catch (caught) { setError(getErrorMessage(caught)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  async function save(payload: ResourcePayload) { setSaving(true); try { if (editing) await adminApi.updateResource(editing.id, payload); else await adminApi.createResource(payload); setEditing(undefined); setCreating(false); await load() } catch (caught) { setError(getErrorMessage(caught)) } finally { setSaving(false) } }
  async function toggle(item: Resource) { try { await adminApi.updateResource(item.id, { is_active: !item.is_active }); await load() } catch (caught) { setError(getErrorMessage(caught)) } }
  async function remove(item: Resource) { if (!window.confirm(`确定删除“${item.title}”吗？`)) return; try { await adminApi.deleteResource(item.id); await load() } catch (caught) { setError(getErrorMessage(caught)) } }
  return <div className="admin-console"><AdminPageHeader eyebrow="ADMIN / LIBRARY" title="心理资源管理" description="录入心理科普、练习与校园服务资源，并控制上架状态。" count={items.length} onAdd={() => setCreating(true)} addLabel="新增资源" /><AdminBoundary>资源内容会被学生端推荐和知识引用；管理员只维护内容，不接触学生心理记录。</AdminBoundary><SearchBar value={query} onChange={setQuery} onSubmit={() => void load()} placeholder="按标题或内容关键词检索" />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : <section className="admin-table-panel"><div className="admin-table-panel__head"><div><p className="admin-kicker">RESOURCE LIBRARY</p><h2>内容目录</h2></div><span className="admin-muted">上架状态即时生效</span></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>资源标题</th><th>类型</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="admin-resource"><span className="admin-resource__icon"><Archive size={17} aria-hidden /></span><span><strong>{item.title}</strong><small>{item.content.slice(0, 72) || '暂无内容摘要'}</small></span></div></td><td><span className="chip chip--gold">{item.type}</span></td><td><StatusPill enabled={item.is_active} activeLabel="已上架" disabledLabel="已下架" /></td><td><div className="admin-actions"><button type="button" className="ghost-button admin-action" onClick={() => setEditing(item)}><Edit3 size={15} aria-hidden />编辑</button><button type="button" className="ghost-button admin-action" onClick={() => void toggle(item)}>{item.is_active ? '下架' : '上架'}</button><button type="button" className="ghost-button admin-action admin-action--danger" onClick={() => void remove(item)}>删除</button></div></td></tr>)}</tbody></table>{items.length === 0 && <div className="admin-empty">暂无心理资源，先添加一条可复用的内容。</div>}</div></section>}{(creating || editing) && <AdminDialog title={creating ? '新增心理资源' : '编辑心理资源'} onClose={() => { setCreating(false); setEditing(undefined) }}><ResourceForm initial={editing} onSubmit={save} onCancel={() => { setCreating(false); setEditing(undefined) }} saving={saving} /></AdminDialog>}</div>
}
