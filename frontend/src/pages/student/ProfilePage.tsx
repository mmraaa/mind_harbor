import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, HeartHandshake, LockKeyhole, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import { getErrorMessage } from '../../api/client'
import {
  BIG_FIVE_QUESTIONNAIRE_VERSION, deleteMyProfile, editMyProfile, getMyProfile, PROFILE_QUESTIONS, profileErrorMessage,
  setProfileConsent, submitProfileQuestionnaire, type ProfileAnswers, type ProfileQuestion, type ProfileResponse,
} from '../../api/profile'
import {
  clearMemories, createMemory, deleteMemory, listMemories, refreshMemorySummary, setMemoryEnabled, updateMemory,
  type MemoryDraft, type MemoryItem, type MemoryResponse,
} from '../../api/memory'

const EMPTY_ANSWERS: ProfileAnswers = Object.fromEntries(PROFILE_QUESTIONS.map((question) => [question.id, '']))
export const MEMORY_CATEGORY_ORDER = ['基本信息', '交流偏好', '项目与任务', '持续背景', '交流边界', '其他信息']

export function buildMemoryGroups<T extends Pick<MemoryItem, 'category_label'>>(items: T[]) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const label = MEMORY_CATEGORY_ORDER.includes(item.category_label) ? item.category_label : '其他信息'
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return MEMORY_CATEGORY_ORDER.map((category) => [category, groups.get(category) ?? []] as const)
}

function nextEditText(value: string | null) {
  if (!value) return '现在可以修改'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '稍后可再次修改' : `${date.toLocaleDateString('zh-CN')} 后可再次修改`
}

function Section({ title, value }: { title: string; value?: string }) {
  if (!value) return null
  return <section className="profile-insight"><h3>{title}</h3><p>{value}</p></section>
}

function QuestionStep({ question, value, onChange }: { question: ProfileQuestion; value: string; onChange: (value: string) => void }) {
  return <div className="profile-step" aria-live="polite">
    <div className="profile-step__meta"><span>{question.label}</span>{question.reverse ? <small>这是一道反向题</small> : null}</div>
    <h3>{question.prompt}</h3>
    <div className="profile-scale" role="radiogroup" aria-label={question.prompt}>
      {question.options.map(([option, label]) => <button type="button" key={option} className={`profile-scale__option${value === option ? ' is-selected' : ''}`} aria-pressed={value === option} onClick={() => onChange(option)}><strong>{option}</strong><span>{label}</span></button>)}
    </div>
  </div>
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [answers, setAnswers] = useState<ProfileAnswers>(EMPTY_ANSWERS)
  const [step, setStep] = useState(0)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [memory, setMemory] = useState<MemoryResponse | null>(null)
  const [memoryLoading, setMemoryLoading] = useState(true)
  const [memorySaving, setMemorySaving] = useState(false)
  const [memoryError, setMemoryError] = useState('')
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft>({ content: '' })
  const [memoryEditingId, setMemoryEditingId] = useState<number | null>(null)

  async function load() { setError(''); try { setProfile(await getMyProfile()) } catch (caught) { setError(profileErrorMessage(getErrorMessage(caught, '画像暂时无法加载'))) } }
  async function loadMemory() { setMemoryLoading(true); setMemoryError(''); try { setMemory(await listMemories()) } catch (caught) { setMemoryError(getErrorMessage(caught, '个性化配置暂时无法加载')) } finally { setMemoryLoading(false) } }
  useEffect(() => { void load() }, [])
  useEffect(() => { void loadMemory() }, [])

  const snapshot = profile?.snapshot
  const hasBaseline = Boolean(
    profile?.questionnaire_completed
    && snapshot?.questionnaire_version === BIG_FIVE_QUESTIONNAIRE_VERSION,
  )
  const hasLegacyBaseline = Boolean(profile?.questionnaire_completed && snapshot && !hasBaseline)
  const currentQuestion = PROFILE_QUESTIONS[step]
  const answered = Object.values(answers).filter(Boolean).length
  const editAllowed = useMemo(() => !profile?.next_self_edit_at || new Date(profile.next_self_edit_at).getTime() <= Date.now(), [profile?.next_self_edit_at])
  const memoryGroups = useMemo(() => buildMemoryGroups(memory?.items ?? []), [memory?.items])

  async function enable() { setSaving(true); setMessage(''); setError(''); try { setProfile(await setProfileConsent(true)); setMessage('已开启自我觉察记录') } catch (caught) { setError(getErrorMessage(caught, '授权设置失败')) } finally { setSaving(false) } }
  async function submitQuestionnaire(event: FormEvent) { event.preventDefault(); if (answered !== PROFILE_QUESTIONS.length) return; setSaving(true); setMessage(''); setError(''); try { setProfile(await submitProfileQuestionnaire(answers)); setMessage('基础画像已建立，之后会根据多次对话慢慢微调。') } catch (caught) { setError(getErrorMessage(caught, '问卷保存失败')) } finally { setSaving(false) } }
  async function saveEdit(event: FormEvent) { event.preventDefault(); setSaving(true); setMessage(''); setError(''); try { setProfile(await editMyProfile(answers)); setEditing(false); setMessage('本次画像修订已保存，7 天后可再次自助修改。') } catch (caught) { setError(getErrorMessage(caught, '画像修订失败')) } finally { setSaving(false) } }
  async function revoke() { setSaving(true); setMessage(''); setError(''); try { setProfile(await setProfileConsent(false)); setMessage('已暂停画像分析，历史画像仍保留在你的页面中。') } catch (caught) { setError(getErrorMessage(caught, '暂停失败')) } finally { setSaving(false) } }
  async function remove() { if (!window.confirm('确定删除这份画像、问卷结果和观察记录吗？此操作不可恢复。')) return; setSaving(true); setMessage(''); setError(''); try { await deleteMyProfile(); setProfile(null); setAnswers(EMPTY_ANSWERS); setMessage('画像已删除') } catch (caught) { setError(getErrorMessage(caught, '删除失败')) } finally { setSaving(false) } }
  function resetMemoryDraft() { setMemoryEditingId(null); setMemoryDraft({ content: '' }) }
  async function saveMemory(event: FormEvent) { event.preventDefault(); if (!memoryDraft.content.trim()) return; setMemorySaving(true); setMemoryError(''); try { if (memoryEditingId) await updateMemory(memoryEditingId, memoryDraft); else await createMemory(memoryDraft); await loadMemory(); resetMemoryDraft() } catch (caught) { setMemoryError(getErrorMessage(caught, '记忆保存失败')) } finally { setMemorySaving(false) } }
  async function removeMemory(id: number) { setMemorySaving(true); setMemoryError(''); try { await deleteMemory(id); await loadMemory(); if (memoryEditingId === id) resetMemoryDraft() } catch (caught) { setMemoryError(getErrorMessage(caught, '记忆删除失败')) } finally { setMemorySaving(false) } }
  async function removeAllMemories() { if (!window.confirm('确定清空全部个性化记忆吗？历史记录会保留为不可用状态。')) return; setMemorySaving(true); setMemoryError(''); try { await clearMemories(); await loadMemory(); resetMemoryDraft() } catch (caught) { setMemoryError(getErrorMessage(caught, '记忆清空失败')) } finally { setMemorySaving(false) } }
  async function toggleMemory() { if (!memory) return; setMemorySaving(true); setMemoryError(''); try { const result = await setMemoryEnabled(!memory.enabled); setMemory((current) => current ? { ...current, enabled: result.enabled } : current) } catch (caught) { setMemoryError(getErrorMessage(caught, '自动记忆设置失败')) } finally { setMemorySaving(false) } }
  async function regenerateMemorySummary() { setMemorySaving(true); setMemoryError(''); try { setMemory(await refreshMemorySummary()) } catch (caught) { setMemoryError(getErrorMessage(caught, '摘要生成失败')) } finally { setMemorySaving(false) } }
  function editMemory(item: MemoryItem) { setMemoryEditingId(item.id); setMemoryDraft({ content: item.content }) }

  if (!profile && !error) return <p className="inline-state">正在打开你的自我觉察记录…</p>

  return <div className="profile-page">
    <header className="page-header"><div><p className="page-header__eyebrow">自我觉察</p><h1>我的成长画像</h1><p className="page-header__description">先用 30 道题认识自己的倾向，再让真实对话慢慢补充一幅更完整、可修正的自我地图。</p></div><HeartHandshake size={38} strokeWidth={1.3} aria-hidden /></header>
    {error && <><p className="archive-alert" role="alert">{error}</p><button type="button" className="ghost-button" onClick={() => void load()}>重新加载画像</button></>}{message && <p className="inline-state" role="status">{message}</p>}
    {!profile?.enabled ? <section className="profile-panel profile-panel--intro"><div className="profile-panel__icon"><LockKeyhole size={22} /></div><div><h2>由你决定是否开启</h2><p>开启后，只会使用你授权的对话来整理倾向。它不会做心理诊断，也不会向管理员展示。</p></div><button type="button" className="primary-button" onClick={() => void enable()} disabled={saving}>开启自我觉察</button></section> : null}

    {profile?.enabled && !hasBaseline ? <form className="profile-panel profile-panel--questionnaire" onSubmit={(event) => void submitQuestionnaire(event)}><div className="profile-panel__heading"><div><p className="section-kicker">基础人格倾向 · 第 {step + 1} / {PROFILE_QUESTIONS.length} 题</p><h2>{hasLegacyBaseline ? '完成新版基础画像' : '选最接近你的描述'}</h2></div><ShieldCheck size={24} /></div><p className="profile-panel__hint">{hasLegacyBaseline ? '你已有一份早期画像。完成这 30 道题后会建立新版基础画像，旧记录保留为历史版本。' : '这是 Big Five 启发式自我觉察，不是诊断。每个维度有 6 道题，部分题目会反向计分。'}</p><div className="profile-progress" aria-label={`已完成 ${answered} 题`}><span style={{ width: `${(answered / PROFILE_QUESTIONS.length) * 100}%` }} /></div><QuestionStep question={currentQuestion} value={answers[currentQuestion.id]} onChange={(value) => setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))} /><div className="profile-wizard-actions"><button type="button" className="ghost-button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft size={16} />上一题</button>{step < PROFILE_QUESTIONS.length - 1 ? <button type="button" className="primary-button" onClick={() => setStep((current) => Math.min(PROFILE_QUESTIONS.length - 1, current + 1))} disabled={!answers[currentQuestion.id]}>下一题<ArrowRight size={16} /></button> : <button type="submit" className="primary-button" disabled={saving || answered !== PROFILE_QUESTIONS.length}>{saving ? '生成中…' : '生成基础画像'}</button>}</div></form> : null}

    {hasBaseline && snapshot ? <>
      <section className="profile-panel profile-panel--summary"><div className="profile-panel__heading"><div><p className="section-kicker">画像版本 {snapshot.version} · 已观察 {snapshot.evidence_count ?? 0} 段会话</p><h2>这份记录描述的是倾向，不是定义</h2></div><RefreshCw size={22} /></div><p className="profile-summary">{snapshot.summary}</p><div className="profile-traits">{Object.entries(snapshot.big_five || snapshot.traits).map(([key, trait]) => <div className="profile-trait" key={key}><span>{trait.label}</span><strong>{'score' in trait ? `${trait.level} · ${trait.score} 分` : trait.value}</strong><small>{'description' in trait ? trait.description : '来自基础问卷'}</small></div>)}</div><div className="profile-insights"><Section title="整体分析" value={snapshot.overall_analysis} /><Section title="思考与决策方式" value={snapshot.thinking_decision} /><Section title="学习方式" value={snapshot.learning_style} /><Section title="优势与可能盲点" value={snapshot.strengths_blind_spots} /><Section title="兴趣分析" value={snapshot.interests} /><Section title="职业方向探索" value={snapshot.career_directions} /><Section title="适合的工作环境" value={snapshot.work_environment} /><Section title="当前成长重点" value={snapshot.growth_focus} /></div>{snapshot.observations.length > 0 && <div className="profile-observations"><h3>近期对话补充</h3>{snapshot.observations.filter((item) => item.status === 'stable').map((item) => <p key={`${item.trait_key}-${item.value}`}>在 {item.evidence_count} 段独立会话中，出现了“{item.value}”的表达。</p>)}</div>}</section>
      <section className="profile-panel profile-panel--controls"><div className="profile-panel__heading"><div><p className="section-kicker">由你掌握</p><h2>修订与隐私</h2></div></div>{editing ? <form className="profile-panel--questionnaire" onSubmit={(event) => void saveEdit(event)}><p className="profile-panel__hint">每 7 天最多保存一次修改，暂停分析和删除画像不受这个限制。你可以从上一次答案继续修改。</p><div className="profile-progress" aria-label={`已完成 ${answered} 题`}><span style={{ width: `${(answered / PROFILE_QUESTIONS.length) * 100}%` }} /></div><QuestionStep question={currentQuestion} value={answers[currentQuestion.id]} onChange={(value) => setAnswers((current) => ({ ...current, [currentQuestion.id]: value }))} /><div className="profile-wizard-actions"><button type="button" className="ghost-button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft size={16} />上一题</button>{step < PROFILE_QUESTIONS.length - 1 ? <button type="button" className="primary-button" onClick={() => setStep((current) => Math.min(PROFILE_QUESTIONS.length - 1, current + 1))} disabled={!answers[currentQuestion.id]}>下一题<ArrowRight size={16} /></button> : <button type="submit" className="primary-button" disabled={saving || answered !== PROFILE_QUESTIONS.length}>保存本次修订</button>}<button type="button" className="ghost-button" onClick={() => setEditing(false)}>取消</button></div></form> : <div className="profile-actions"><button type="button" className="ghost-button" onClick={() => { setAnswers({ ...EMPTY_ANSWERS, ...(snapshot.questionnaire_answers || {}) }); setStep(0); setEditing(true) }} disabled={!editAllowed || saving}>{editAllowed ? '自助修改画像' : nextEditText(profile.next_self_edit_at)}</button><button type="button" className="ghost-button" onClick={() => void revoke()} disabled={saving}>暂停分析</button><button type="button" className="ghost-button profile-danger" onClick={() => void remove()} disabled={saving}><Trash2 size={15} />删除画像</button></div>}</section>
    </> : null}
    <section className="profile-panel profile-memory-panel">
      <div className="profile-panel__heading"><div><h2>个性化配置</h2></div><HeartHandshake size={22} /></div>
      <p className="profile-panel__hint">在这里写下希望助手长期参考的信息。保存后会自动分类，并在相关对话中自然地影响回应。请不要保存密码、API 密钥或身份证号。</p>
      {memoryError && <p className="archive-alert" role="alert">{memoryError}</p>}
      {memoryLoading ? <p className="inline-state">正在加载个性化配置…</p> : memory ? <>
        <div className="profile-memory-toolbar">
          <button type="button" className="ghost-button" onClick={() => void toggleMemory()} disabled={memorySaving}>{memory.enabled ? <Check size={15} /> : <X size={15} />}{memory.enabled ? '自动记忆已开启' : '自动记忆已暂停'}</button>
          <button type="button" className="ghost-button" onClick={() => void regenerateMemorySummary()} disabled={memorySaving}><RefreshCw size={15} />刷新摘要</button>
          <button type="button" className="ghost-button profile-danger" onClick={() => void removeAllMemories()} disabled={memorySaving}><Trash2 size={15} />清空记忆</button>
        </div>
        {memory.summary ? <div className="profile-memory-summary"><span>记忆摘要</span><p>{memory.summary}</p>{memory.summary_updated_at && <small>更新于 {new Date(memory.summary_updated_at).toLocaleString('zh-CN')}</small>}</div> : <div className="profile-memory-empty">还没有摘要。添加几条希望助手长期参考的信息，或完成几次对话后再刷新。</div>}
        <div className="profile-memory-list">
          {memoryGroups.map(([category, items]) => <section className={`profile-memory-group${items.length ? '' : ' profile-memory-group--empty'}`} key={category}><h3>{category}</h3>{items.map((item) => <article className="profile-memory-item" key={item.id}><div><p>{item.content}</p><small>{item.status === 'candidate' ? '待多次会话确认' : item.source === 'user_manual' ? '你手动添加' : '来自对话候选'}</small></div><div className="profile-memory-item__actions"><button type="button" className="icon-button" aria-label="编辑记忆" onClick={() => editMemory(item)} disabled={memorySaving}><Pencil size={15} /></button><button type="button" className="icon-button profile-danger" aria-label="删除记忆" onClick={() => void removeMemory(item.id)} disabled={memorySaving}><Trash2 size={15} /></button></div></article>)}</section>)}
        </div>
        <form className="profile-memory-form" onSubmit={(event) => void saveMemory(event)}>
          <textarea value={memoryDraft.content} onChange={(event) => setMemoryDraft((draft) => ({ ...draft, content: event.target.value }))} placeholder="例如：我希望先听我说，再一起想办法。" maxLength={1000} aria-label="个性化配置内容" />
          <div className="profile-memory-form__actions"><button type="submit" className="primary-button" disabled={memorySaving || !memoryDraft.content.trim()}>{memoryEditingId ? <><Check size={15} />保存修改</> : <><Plus size={15} />添加</>}</button>{memoryEditingId && <button type="button" className="ghost-button" onClick={resetMemoryDraft}><X size={15} />取消</button>}</div>
        </form>
      </> : null}
    </section>
  </div>
}
