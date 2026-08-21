import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenText,
  MessageSquareQuote,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { streamCounselorChat } from '../../api/counselorChat'
import { getErrorMessage } from '../../api/client'
import {
  fetchEmotionDistribution,
  fetchSessionMessages,
  fetchStudentDetail,
  fetchStudents,
  type EmotionDistItem,
  type SessionMessage,
  type StudentDetail,
  type StudentSessionIndex,
  type StudentSummary,
} from '../../api/counselorStats'
import { emotionDisplay } from '../../data/emotions'
import { CounselorToolCards, CounselorToolsHint } from '../../components/CounselorToolCards'
import { EmotionPieChart } from '../../components/EmotionPieChart'
import { EmotionTrendChart } from '../../components/EmotionTrendChart'
import { MarkdownMessage } from '../../components/MarkdownMessage'
import { useCounselorAgentStore } from '../../stores/counselorAgent'

const SUGGESTIONS = [
  '本周焦虑强度最高的 3 位学生是谁？',
  '查看 student 最近的情绪日记记录',
  '最近两周有哪些需要重点关注的学生？',
  '列出所有被标记为 high 风险等级的会话',
]

function formatShort(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function riskLabel(sessions: number): 'high' | 'low' {
  return sessions > 0 ? 'high' : 'low'
}

function sessionRiskText(level: string | null | undefined) {
  if (level === 'high') return '高风险'
  if (level === 'medium') return '中风险'
  return '低风险'
}

function CounselorHeader({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow: string
  title: string
  description: string
  meta?: ReactNode
}) {
  return (
    <header className="counselor-header">
      <div>
        <p className="counselor-header__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="counselor-header__description">{description}</p>
      </div>
      {meta ? <div className="counselor-header__meta">{meta}</div> : null}
    </header>
  )
}

function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'high' | 'live'
  children: ReactNode
}) {
  return <span className={`counselor-pill counselor-pill--${tone}`}>{children}</span>
}

function PanelTitle({
  icon: Icon,
  eyebrow,
  title,
  note,
}: {
  icon: typeof Search
  eyebrow: string
  title: string
  note?: string
}) {
  return (
    <div className="counselor-panel-title">
      <span className="counselor-panel-title__mark">
        <Icon size={16} />
      </span>
      <div>
        <p className="counselor-panel-title__eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        {note ? <p className="counselor-panel-title__note">{note}</p> : null}
      </div>
    </div>
  )
}

export function SqlAgentPage() {
  const messages = useCounselorAgentStore((s) => s.messages)
  const draft = useCounselorAgentStore((s) => s.draft)
  const sending = useCounselorAgentStore((s) => s.sending)
  const error = useCounselorAgentStore((s) => s.error)
  const setMessages = useCounselorAgentStore((s) => s.setMessages)
  const setDraft = useCounselorAgentStore((s) => s.setDraft)
  const setSending = useCounselorAgentStore((s) => s.setSending)
  const setError = useCounselorAgentStore((s) => s.setError)
  const clearError = useCounselorAgentStore((s) => s.clearError)
  const clearChat = useCounselorAgentStore((s) => s.clearChat)

  const streamRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stickToBottom = useRef(true)

  const scrollStreamToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = streamRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    const el = streamRef.current
    if (!el) return
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (stickToBottom.current) {
      scrollStreamToBottom('smooth')
    }
  }, [messages, sending, scrollStreamToBottom])

  async function ask(text: string) {
    const content = text.trim()
    if (!content || sending) return

    clearError()
    stickToBottom.current = true
    setSending(true)
    setDraft('')

    const userKey = `u-${Date.now()}`
    const assistantKey = `a-${Date.now()}`

    setMessages((prev) => [
      ...prev,
      { key: userKey, role: 'user', text: content, cards: [] },
      { key: assistantKey, role: 'assistant', text: '', cards: [], streaming: true },
    ])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamCounselorChat({
        content,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'text') {
            const piece = String(event.payload?.content ?? '')
            setMessages((prev) =>
              prev.map((m) =>
                m.key === assistantKey ? { ...m, text: m.text + piece } : m,
              ),
            )
          } else if (event.type === 'tool_card') {
            const payload = event.payload
            setMessages((prev) =>
              prev.map((m) =>
                m.key === assistantKey ? { ...m, cards: [...m.cards, payload] } : m,
              ),
            )
          } else if (event.type === 'error') {
            const msg =
              event.payload.message || event.payload.detail || '查询过程出现异常'
            setError(msg)
          }
        },
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(getErrorMessage(err, '查询失败'))
        setMessages((prev) => prev.filter((m) => m.key !== assistantKey))
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.key === assistantKey ? { ...m, streaming: false } : m)),
      )
      setSending(false)
      abortRef.current = null
    }
  }

  function handleClearChat() {
    abortRef.current?.abort()
    clearChat()
    abortRef.current = null
  }

  return (
    <div className="companion-page">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">SQL AGENT</p>
          <h1>学生资料整理助手</h1>
          <p className="page-header__description">
            用自然语言查询学生情绪、日记与会话统计，底层经只读 SQL 与表白名单校验。
          </p>
        </div>
      </header>

      <section className="companion-chat">
        <header className="companion-chat__header">
          <div>
            <h2>咨询师 Agent</h2>
            <p>自然语言 → 工具调用 → 只读查询 → 专业解读 · 切换页面会保留当前对话</p>
            <CounselorToolsHint />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="chip">READ ONLY</span>
            <button type="button" className="ghost-button" disabled={sending} onClick={handleClearChat}>
              清空对话
            </button>
          </div>
        </header>

        <div ref={streamRef} className="companion-stream" aria-live="polite">
          {messages.map((m) => (
            <article key={m.key} className={`msg msg--${m.role}`}>
              {m.role === 'assistant' && (
                <div className="msg__meta">
                  <span>咨询师助手</span>
                </div>
              )}
              <div className="msg__bubble">
                {m.role === 'assistant' ? (
                  m.text ? (
                    <MarkdownMessage text={m.text} />
                  ) : m.streaming ? (
                    '正在查询…'
                  ) : null
                ) : (
                  m.text
                )}
              </div>
              {m.cards.length > 0 && <CounselorToolCards cards={m.cards} />}
            </article>
          ))}
        </div>

        <div className="companion-dock">
          {error && (
            <p
              style={{
                color: 'var(--danger)',
                marginBottom: 8,
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
              }}
            >
              {error}
            </p>
          )}
          <div className="suggest-row">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="suggest"
                disabled={sending}
                onClick={() => void ask(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              void ask(draft)
            }}
          >
            <textarea
              className="text-area"
              rows={2}
              placeholder="例如：统计近 7 日各情绪类别分布、查看某学生日记…"
              value={draft}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void ask(draft)
                }
              }}
            />
            <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
              {sending ? '查询中…' : '询问'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

function matchesQuery(haystack: string, query: string) {
  if (!query.trim()) return true
  return haystack.toLowerCase().includes(query.trim().toLowerCase())
}

type StudentJournal = StudentDetail['journals'][number]
type ArchiveBrowseKind = 'journals' | 'sessions'

type SessionRiskFilter = 'all' | 'low' | 'medium' | 'high'

function ArchiveBrowseModal({
  kind,
  studentName,
  journals,
  sessions,
  onClose,
  forcedSessionId,
  onJumpToSession,
}: {
  kind: ArchiveBrowseKind
  studentName: string
  journals: StudentJournal[]
  sessions: StudentSessionIndex[]
  onClose: () => void
  forcedSessionId?: number | null
  onJumpToSession?: (sessionId: number) => void
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all')
  const [riskFilter, setRiskFilter] = useState<SessionRiskFilter>('all')
  const [pickedJournalId, setPickedJournalId] = useState<number | null>(journals[0]?.id ?? null)
  const [pickedSessionId, setPickedSessionId] = useState<number | null>(sessions[0]?.id ?? null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(false)

  const filteredJournals = useMemo(
    () =>
      journals.filter((j) =>
        matchesQuery(`${j.summary} ${j.content} ${j.mood_score ?? ''}`, search),
      ),
    [journals, search],
  )
  const filteredSessions = useMemo(
    () =>
      sessions.filter((s) => {
        if (!matchesQuery(`${s.title} ${s.summary}`, search)) return false
        if (statusFilter === 'active' && s.status !== 'active') return false
        if (statusFilter === 'closed' && s.status !== 'closed') return false
        if (riskFilter !== 'all' && s.risk_level !== riskFilter) return false
        return true
      }),
    [sessions, search, statusFilter, riskFilter],
  )

  useEffect(() => {
    // kind 在父组件间切换（例如从日记跳转到会话）时，重置过滤条件，确保目标可见。
    setSearch('')
    setStatusFilter('all')
    setRiskFilter('all')
  }, [kind])

  useEffect(() => {
    if (kind !== 'journals') return
    if (pickedJournalId != null && filteredJournals.some((j) => j.id === pickedJournalId)) return
    setPickedJournalId(filteredJournals[0]?.id ?? null)
  }, [kind, filteredJournals, pickedJournalId])

  useEffect(() => {
    if (kind !== 'sessions') return
    if (forcedSessionId != null && filteredSessions.some((s) => s.id === forcedSessionId)) {
      setPickedSessionId(forcedSessionId)
      return
    }
    if (pickedSessionId != null && filteredSessions.some((s) => s.id === pickedSessionId)) return
    setPickedSessionId(filteredSessions[0]?.id ?? null)
  }, [kind, filteredSessions, pickedSessionId, forcedSessionId])

  useEffect(() => {
    if (kind !== 'sessions' || pickedSessionId == null) {
      setMessages([])
      return
    }
    let alive = true
    setMsgLoading(true)
    ;(async () => {
      try {
        const data = await fetchSessionMessages(pickedSessionId)
        if (alive) setMessages(data.messages)
      } catch {
        if (alive) setMessages([])
      } finally {
        if (alive) setMsgLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [kind, pickedSessionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const pickedJournal = journals.find((j) => j.id === pickedJournalId) ?? null
  const pickedSession = sessions.find((s) => s.id === pickedSessionId) ?? null
  const isJournals = kind === 'journals'
  const relatedSession =
    pickedJournal?.session_id != null ? sessions.find((s) => s.id === pickedJournal.session_id) ?? null : null

  return (
    <div className="archive-browse" role="dialog" aria-modal="true">
      <button type="button" className="archive-browse__backdrop" aria-label="关闭" onClick={onClose} />
      <section className="archive-browse__panel">
        <header className="archive-browse__head">
          <div>
            <p className="archive-browse__eyebrow">{isJournals ? 'Journal archive' : 'Session archive'}</p>
            <h2>
              {studentName} · {isJournals ? '情绪日记' : '近期会话'}
            </h2>
          </div>
          <button type="button" className="archive-browse__close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="archive-browse__body">
          <aside className="archive-browse__list">
            <label className="field-label" htmlFor="archive-browse-search">
              {isJournals ? '搜索日记' : '搜索会话'}
            </label>
            <div className="archive-search__row">
              <Search size={18} aria-hidden />
              <input
                id="archive-browse-search"
                className="text-input"
                placeholder={isJournals ? '按摘要、正文或得分搜索…' : '按标题、摘要关键词搜索…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isJournals ? (
              <div className="archive-browse__filters">
                <div className="archive-browse__filter-group">
                  <span className="archive-browse__filter-label">进行状态</span>
                  <div className="counselor-filter-row">
                    <button
                      type="button"
                      className={`ghost-button${statusFilter === 'all' ? ' ghost-button--active' : ''}`}
                      onClick={() => setStatusFilter('all')}
                    >
                      全部
                    </button>
                    <button
                      type="button"
                      className={`ghost-button${statusFilter === 'active' ? ' ghost-button--active' : ''}`}
                      onClick={() => setStatusFilter('active')}
                    >
                      进行中
                    </button>
                    <button
                      type="button"
                      className={`ghost-button${statusFilter === 'closed' ? ' ghost-button--active' : ''}`}
                      onClick={() => setStatusFilter('closed')}
                    >
                      已结束
                    </button>
                  </div>
                </div>
                <div className="archive-browse__filter-group">
                  <span className="archive-browse__filter-label">风险等级</span>
                  <div className="counselor-filter-row">
                    <button
                      type="button"
                      className={`ghost-button${riskFilter === 'all' ? ' ghost-button--active' : ''}`}
                      onClick={() => setRiskFilter('all')}
                    >
                      全部
                    </button>
                    <button
                      type="button"
                      className={`ghost-button${riskFilter === 'low' ? ' ghost-button--active' : ''}`}
                      onClick={() => setRiskFilter('low')}
                    >
                      低风险
                    </button>
                    <button
                      type="button"
                      className={`ghost-button${riskFilter === 'medium' ? ' ghost-button--active' : ''}`}
                      onClick={() => setRiskFilter('medium')}
                    >
                      中风险
                    </button>
                    <button
                      type="button"
                      className={`ghost-button${riskFilter === 'high' ? ' ghost-button--active' : ''}`}
                      onClick={() => setRiskFilter('high')}
                    >
                      高风险
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="archive-browse__items">
              {isJournals ? (
                filteredJournals.length === 0 ? (
                  <p className="archive-empty__text">没有匹配的日记。</p>
                ) : (
                  filteredJournals.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      className={`archive-browse__item${j.id === pickedJournalId ? ' archive-browse__item--active' : ''}`}
                      onClick={() => setPickedJournalId(j.id)}
                    >
                      <strong>{j.summary || '未命名日记'}</strong>
                      <span>
                        情绪得分 {j.mood_score ?? '—'} / 10 · {formatShort(j.created_at)}
                      </span>
                    </button>
                  ))
                )
              ) : filteredSessions.length === 0 ? (
                <p className="archive-empty__text">没有匹配的会话。</p>
              ) : (
                filteredSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`archive-browse__item${s.id === pickedSessionId ? ' archive-browse__item--active' : ''}`}
                    onClick={() => setPickedSessionId(s.id)}
                  >
                    <strong>{s.title}</strong>
                    <span>
                      {s.status === 'active' ? '进行中' : '已结束'}
                      {` · ${sessionRiskText(s.risk_level)}`}
                      {s.message_count ? ` · ${s.message_count} 条` : ''}
                          {s.started_at ? ` · ${formatShort(s.started_at)}` : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <div className="archive-browse__detail">
            {isJournals ? (
              !pickedJournal ? (
                <p className="archive-empty__text">选择一篇日记后，这里会展示完整正文。</p>
              ) : (
                <article className="archive-browse__journal">
                  <header>
                    <h3>{pickedJournal.summary || '未命名日记'}</h3>
                    <p>
                      情绪得分 {pickedJournal.mood_score ?? '—'} / 10
                      {pickedJournal.created_at ? ` · ${formatShort(pickedJournal.created_at)}` : ''}
                    </p>
                  </header>
                  <div className="archive-browse__journal-body">
                    {pickedJournal.content?.trim() ? pickedJournal.content : '这篇日记还没有正文。'}
                  </div>
                  {(pickedJournal.stress_source || pickedJournal.support_need) && (
                    <div className="archive-browse__journal-meta">
                      {pickedJournal.stress_source ? (
                        <p className="archive-browse__journal-meta__item archive-browse__journal-meta__item--stress">
                          <strong>压力来源</strong>
                          <span>{pickedJournal.stress_source}</span>
                        </p>
                      ) : null}
                      {pickedJournal.support_need ? (
                        <p className="archive-browse__journal-meta__item archive-browse__journal-meta__item--support">
                          <strong>支持需求</strong>
                          <span>{pickedJournal.support_need}</span>
                        </p>
                      ) : null}
                    </div>
                  )}
                  {pickedJournal.session_id != null && (
                    <div className="archive-journal-jump">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => onJumpToSession?.(pickedJournal.session_id as number)}
                      >
                        查看对应会话{relatedSession ? `：${relatedSession.title}` : ''} →
                      </button>
                    </div>
                  )}
                </article>
              )
            ) : !pickedSession ? (
              <p className="archive-empty__text">选择一条会话后，这里会展示对话内容。</p>
            ) : (
              <div className="archive-browse__session">
                <header>
                  <div>
                    <h3>{pickedSession.title}</h3>
                    <p>
                      {pickedSession.status === 'active' ? '进行中' : '已结束'}
                      {pickedSession.summary ? ` · ${pickedSession.summary}` : ''}
                      {pickedSession.started_at ? ` · ${formatShort(pickedSession.started_at)}` : ''}
                    </p>
                  </div>
                </header>
                {msgLoading ? (
                  <p className="archive-loading">正在载入对话…</p>
                ) : messages.length === 0 ? (
                  <p className="archive-empty__text">该会话还没有消息。</p>
                ) : (
                  <div className="counselor-replay archive-browse__replay">
                    {messages.map((m) => (
                      <article key={m.id} className={`counselor-replay__msg counselor-replay__msg--${m.role}`}>
                        <div className="counselor-replay__meta">
                          <span>{m.role === 'assistant' ? '助手' : m.role === 'user' ? '学生' : m.role}</span>
                          <time>{formatShort(m.created_at)}</time>
                        </div>
                        <div className="counselor-replay__bubble">
                          {m.role === 'assistant' ? <MarkdownMessage text={m.content} /> : m.content}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export function StudentArchivePage() {
  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all')
  const [days, setDays] = useState(14)
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [distribution, setDistribution] = useState<EmotionDistItem[]>([])
  const [distTotal, setDistTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [browseKind, setBrowseKind] = useState<ArchiveBrowseKind | null>(null)
  const [forcedSessionId, setForcedSessionId] = useState<number | null>(null)

  const loadStudents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchStudents({
        keyword: query.trim() || undefined,
        risk: riskFilter,
        days,
      })
      setStudents(data.students)
      if (data.students.length > 0) {
        setActiveId((prev) => {
          if (prev != null && data.students.some((s) => s.id === prev)) return prev
          return data.students[0].id
        })
      } else {
        setActiveId(null)
        setDetail(null)
        setDistribution([])
        setDistTotal(0)
        setBrowseKind(null)
        setForcedSessionId(null)
      }
    } catch (err) {
      setError(getErrorMessage(err, '无法加载学生列表'))
    } finally {
      setLoading(false)
    }
  }, [query, riskFilter, days])

  useEffect(() => {
    const timer = setTimeout(() => void loadStudents(), query ? 300 : 0)
    return () => clearTimeout(timer)
  }, [loadStudents, query])

  useEffect(() => {
    if (activeId == null) return
    let alive = true
    setDetailLoading(true)
    ;(async () => {
      try {
        const [d, dist] = await Promise.all([
          fetchStudentDetail(activeId, days),
          fetchEmotionDistribution(days, activeId),
        ])
        if (!alive) return
        setDetail(d)
        setDistribution(dist.distribution)
        setDistTotal(dist.total)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载学生详情'))
      } finally {
        if (alive) setDetailLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [activeId, days])

  const activeSummary = useMemo(
    () => students.find((s) => s.id === activeId) ?? null,
    [students, activeId],
  )

  const profile = detail?.profile
  const student = detail?.student
  const trendPoints = detail?.emotion_trend ?? []
  const recordedDays = trendPoints.filter((p) => p.count > 0).length
  const periodAvg = useMemo(() => {
    const recorded = trendPoints.filter((p) => p.avg_intensity != null && p.count > 0)
    if (recorded.length === 0) return null
    const totalCount = recorded.reduce((sum, p) => sum + p.count, 0)
    const weighted = recorded.reduce((sum, p) => sum + (p.avg_intensity as number) * p.count, 0)
    return Math.round((weighted / totalCount) * 10) / 10
  }, [trendPoints])
  const trendSummary =
    recordedDays > 0
      ? `近 ${days} 天中 ${recordedDays} 天有日记，平均情绪分 ${periodAvg ?? '—'}`
      : `近 ${days} 天暂无日记情绪分`

  return (
    <div className="counselor-page">
      <CounselorHeader
        eyebrow="ARCHIVE"
        title="学生心理档案"
        description="查看学生基本资料、近多日情绪变化，并从会话索引跳转到质检回放。"
      />

      <section className="counselor-shell counselor-shell--archive">
        <aside className="counselor-rail">
          <div className="counselor-panel counselor-panel--soft">
            <PanelTitle icon={Search} eyebrow="Student index" title="学生索引" note="先按姓名检索，再从左侧切换对象。" />
            <label className="field-label" htmlFor="student-search">
              搜索学生
            </label>
            <div className="archive-search__row">
              <Search size={18} aria-hidden />
              <input
                id="student-search"
                className="text-input"
                placeholder="输入姓名或用户名…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="counselor-filter-row">
              <button
                type="button"
                className={`ghost-button${riskFilter === 'all' ? ' ghost-button--active' : ''}`}
                onClick={() => setRiskFilter('all')}
              >
                全部学生
              </button>
              <button
                type="button"
                className={`ghost-button${riskFilter === 'high' ? ' ghost-button--active' : ''}`}
                onClick={() => setRiskFilter('high')}
              >
                需关注
              </button>
            </div>
            {error && <p className="archive-alert">{error}</p>}
            <div className="archive-search__results" role="listbox" aria-label="学生列表">
              {loading ? (
                <p className="archive-loading">正在载入学生…</p>
              ) : students.length === 0 ? (
                <p className="archive-search__empty">没有匹配的学生。</p>
              ) : (
                students.map((s) => {
                  const emo = emotionDisplay(s.latest_emotion)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={s.id === activeId}
                      className={`archive-student archive-student--dossier${
                        s.id === activeId ? ' archive-student--active' : ''
                      }`}
                      onClick={() => {
                        setActiveId(s.id)
                        setBrowseKind(null)
                        setForcedSessionId(null)
                      }}
                    >
                      <span className="archive-student__name">
                        {s.name}
                        <small>{s.username}</small>
                      </span>
                      <span className={`chip${riskLabel(s.high_risk_sessions) === 'high' ? ' chip--risk' : ''}`}>
                        {emo.emoji} {emo.label}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </aside>

        <section className="counselor-workbench">
          {!activeSummary ? (
            <div className="counselor-empty">
              <BookOpenText size={20} />
              <div>
                <h3>先选择一位学生</h3>
                <p>左侧索引会保持固定，便于你在多个学生之间快速切换。</p>
              </div>
            </div>
          ) : detailLoading ? (
            <p className="archive-loading">正在载入详情…</p>
          ) : detail && student && profile ? (
            <>
              <div className="counselor-panel counselor-panel--profile">
                <div className="counselor-profile-dossier">
                  <div className="counselor-profile-dossier__identity">
                    <p className="counselor-profile-dossier__eyebrow">Student profile</p>
                    <h2 className="counselor-profile-dossier__name">{student.name || '未命名学生'}</h2>
                    <p className="counselor-profile-dossier__username">@{student.username}</p>
                    <div className="counselor-profile-dossier__mood">
                      <span className="counselor-profile-dossier__mood-emoji" aria-hidden>
                        {emotionDisplay(profile.latest_emotion).emoji}
                      </span>
                      <div>
                        <span className="counselor-profile-dossier__mood-label">最近情绪</span>
                        <strong>{emotionDisplay(profile.latest_emotion).label}</strong>
                      </div>
                    </div>
                  </div>

                  <dl className="counselor-profile-metrics">
                    <div className="counselor-profile-metric">
                      <dt>会话</dt>
                      <dd>{profile.session_count}</dd>
                    </div>
                    <div className="counselor-profile-metric">
                      <dt>日记</dt>
                      <dd>{profile.journal_count}</dd>
                    </div>
                    <div
                      className={`counselor-profile-metric${
                        profile.high_risk_sessions > 0 ? ' counselor-profile-metric--risk' : ''
                      }`}
                    >
                      <dt>高风险会话</dt>
                      <dd>{profile.high_risk_sessions}</dd>
                    </div>
                    <div className="counselor-profile-metric">
                      <dt>近 {days} 天记录</dt>
                      <dd>
                        {profile.emotion_count}
                        <small>条</small>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="counselor-emotion-grid">
                <div className="counselor-panel counselor-panel--trend">
                  <div className="counselor-trend-head">
                    <PanelTitle
                      icon={Sparkles}
                      eyebrow="Emotion trend"
                      title={`${student.name} · 情绪变化`}
                      note={trendSummary}
                    />
                    <div className="counselor-trend-head__aside">
                      <div className="counselor-trend-avg">
                        <span>平均情绪分</span>
                        <strong>{periodAvg ?? '—'}</strong>
                      </div>
                      <div className="counselor-filter-row">
                        {[7, 14, 30].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`ghost-button${days === n ? ' ghost-button--active' : ''}`}
                            onClick={() => setDays(n)}
                          >
                            {n} 天
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {trendPoints.some((p) => p.count > 0) ? (
                    <EmotionTrendChart points={trendPoints} />
                  ) : (
                    <p className="archive-empty__text">暂无情绪数据。</p>
                  )}
                </div>

                <div className="counselor-panel counselor-panel--pie">
                  <PanelTitle
                    icon={Sparkles}
                    eyebrow="Emotion mix"
                    title="情绪类别分布"
                    note={
                      distTotal > 0
                        ? `近 ${days} 天共 ${distTotal} 条情绪记录`
                        : `近 ${days} 天暂无情绪类别数据`
                    }
                  />
                  <EmotionPieChart items={distribution} />
                </div>
              </div>

              <div className="counselor-record-grid">
                <button
                  type="button"
                  className="counselor-panel counselor-panel--journal counselor-peek"
                  onClick={() => {
                    setForcedSessionId(null)
                    setBrowseKind('journals')
                  }}
                >
                  <PanelTitle
                    icon={BookOpenText}
                    eyebrow="Journal excerpts"
                    title="情绪日记"
                    note="点击打开完整日记与搜索"
                  />
                  {detail.journals.length > 0 ? (
                    <div className="list-panel list-panel--top counselor-peek__list">
                      {detail.journals.slice(0, 3).map((j) => (
                        <article key={j.id} className="list-row list-row--counselor">
                          <div>
                            <h3>{j.summary}</h3>
                            <p>情绪得分 {j.mood_score ?? '—'} / 10</p>
                          </div>
                          <span className="time">{formatShort(j.created_at)}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="archive-empty__text">暂无日记记录。</p>
                  )}
                </button>

                <button
                  type="button"
                  className="counselor-panel counselor-peek"
                  onClick={() => {
                    setForcedSessionId(null)
                    setBrowseKind('sessions')
                  }}
                >
                  <PanelTitle
                    icon={MessageSquareQuote}
                    eyebrow="Session index"
                    title="近期会话"
                    note="点击打开会话内容与搜索"
                  />
                  {detail.sessions.length > 0 ? (
                    <div className="list-panel counselor-peek__list">
                      {detail.sessions.slice(0, 3).map((s) => (
                        <article key={s.id} className="list-row list-row--counselor">
                          <div>
                            <h3>{s.title}</h3>
                            <p>
                              {s.status === 'active' ? '进行中' : '已结束'}
                              {s.message_count ? ` · ${s.message_count} 条消息` : ''}
                            </p>
                          </div>
                          <div className="counselor-inline-meta">
                            <StatusPill tone={s.risk_level === 'high' ? 'high' : 'neutral'}>
                              {sessionRiskText(s.risk_level)}
                            </StatusPill>
                            <span className="time">{formatShort(s.started_at)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="archive-empty__text">暂无近期会话。</p>
                  )}
                </button>
              </div>
            </>
          ) : null}
        </section>
      </section>
      {browseKind && student && detail ? (
        <ArchiveBrowseModal
          kind={browseKind}
          studentName={student.name}
          journals={detail.journals}
          sessions={detail.sessions}
          forcedSessionId={forcedSessionId}
          onJumpToSession={(sid) => {
            setForcedSessionId(sid)
            setBrowseKind('sessions')
          }}
          onClose={() => {
            setBrowseKind(null)
            setForcedSessionId(null)
          }}
        />
      ) : null}
    </div>
  )
}
