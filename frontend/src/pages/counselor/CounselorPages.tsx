import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenText,
  CircleAlert,
  MessageSquareQuote,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { streamCounselorChat } from '../../api/counselorChat'
import { getErrorMessage } from '../../api/client'
import {
  fetchOverview,
  fetchSession,
  fetchSessionMessages,
  fetchSessions,
  fetchStudentDetail,
  fetchStudents,
  type SessionMessage,
  type SessionQA,
  type StatsOverview,
  type StudentDetail,
  type StudentSummary,
} from '../../api/counselorStats'
import { emotionDisplay } from '../../data/emotions'
import { CounselorToolCards, CounselorToolsHint } from '../../components/CounselorToolCards'
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

function riskTone(level: string | null | undefined) {
  return level === 'high' ? 'high' : 'calm'
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

function StatBand({
  label,
  value,
  note,
}: {
  label: string
  value: string | number
  note: string
}) {
  return (
    <article className="counselor-stat">
      <p className="counselor-stat__label">{label}</p>
      <strong className="counselor-stat__value">{value}</strong>
      <p className="counselor-stat__note">{note}</p>
    </article>
  )
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

export function SessionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const targetId = Number(searchParams.get('session') || '') || null
  const [overview, setOverview] = useState<StatsOverview | null>(null)
  const [sessions, setSessions] = useState<SessionQA[]>([])
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(targetId)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const cardRefs = useRef<Record<number, HTMLButtonElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ov, sess] = await Promise.all([
        fetchOverview(30),
        fetchSessions({ risk: riskFilter, days: 30 }),
      ])
      let items = sess.sessions
      const focusId = Number(searchParams.get('session') || '') || null
      if (focusId && !items.some((s) => s.id === focusId)) {
        try {
          const extra = await fetchSession(focusId)
          items = [extra, ...items]
        } catch {
          /* 目标会话不存在时仍展示列表 */
        }
      }
      setOverview(ov)
      setSessions(items)
      setSelectedId((prev) => {
        if (focusId) return focusId
        if (prev != null && items.some((s) => s.id === prev)) return prev
        return items[0]?.id ?? null
      })
    } catch (err) {
      setError(getErrorMessage(err, '无法加载会话数据'))
    } finally {
      setLoading(false)
    }
  }, [riskFilter, searchParams])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (selectedId == null) {
      setMessages([])
      return
    }
    let alive = true
    setMsgLoading(true)
    ;(async () => {
      try {
        const data = await fetchSessionMessages(selectedId)
        if (alive) setMessages(data.messages)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载会话消息'))
      } finally {
        if (alive) setMsgLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [selectedId])

  useEffect(() => {
    if (selectedId == null) return
    const el = cardRefs.current[selectedId]
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedId, sessions])

  function selectSession(id: number) {
    setSelectedId(id)
    setSearchParams({ session: String(id) }, { replace: true })
  }

  const selected = sessions.find((s) => s.id === selectedId) ?? null

  return (
    <div className="counselor-page">
      <CounselorHeader
        eyebrow="QA"
        title="会话记录质检"
        description="跨学生查看近期会话。点开一条即可回放学生与助手的全部对话，并核对危机话术。"
        meta={
          <>
            <StatusPill tone={riskFilter === 'high' ? 'high' : 'neutral'}>
              {riskFilter === 'high' ? '仅高风险' : '全部会话'}
            </StatusPill>
            <StatusPill tone="live">{loading ? '载入中' : '已同步'}</StatusPill>
          </>
        }
      />

      <div className="counselor-stats">
        <StatBand label="总会话" value={overview?.sessions ?? '—'} note="最近 30 天纳入质检的全部会话" />
        <StatBand label="进行中" value={overview?.active_sessions ?? '—'} note="仍在陪伴中的对话，适合连续观察" />
        <StatBand label="高风险" value={overview?.high_risk_sessions ?? '—'} note="需优先复核危机话术与转介提示" />
      </div>

      <section className="counselor-shell counselor-shell--qa">
        <aside className="counselor-rail">
          <div className="counselor-panel counselor-panel--soft">
            <PanelTitle icon={ShieldAlert} eyebrow="Triage filter" title="风险分诊" note="先按风险收窄，再点开会话回放。" />
            <div className="counselor-filter-row">
              <button
                type="button"
                className={`ghost-button${riskFilter === 'all' ? ' ghost-button--active' : ''}`}
                onClick={() => setRiskFilter('all')}
              >
                全部会话
              </button>
              <button
                type="button"
                className={`ghost-button${riskFilter === 'high' ? ' ghost-button--active' : ''}`}
                onClick={() => setRiskFilter('high')}
              >
                高风险优先
              </button>
            </div>
          </div>
        </aside>

        <section className="counselor-workbench">
          {error && <p className="archive-alert">{error}</p>}
          {loading ? (
            <p className="archive-loading">正在载入会话…</p>
          ) : sessions.length === 0 ? (
            <div className="counselor-empty">
              <CircleAlert size={20} />
              <div>
                <h3>当前筛选下没有会话</h3>
                <p>可以切回全部会话，或稍后再同步新的会话数据。</p>
              </div>
            </div>
          ) : (
            <div className="counselor-session-list">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  ref={(el) => {
                    cardRefs.current[s.id] = el
                  }}
                  className={`counselor-session-card counselor-session-card--${riskTone(s.risk_level)}${
                    s.id === selectedId ? ' counselor-session-card--active' : ''
                  }`}
                  onClick={() => selectSession(s.id)}
                >
                  <div className="counselor-session-card__bar" />
                  <div className="counselor-session-card__body">
                    <div className="counselor-session-card__head">
                      <div>
                        <p className="counselor-session-card__eyebrow">{s.student_name}</p>
                        <h3>{s.title}</h3>
                      </div>
                      <time>{formatShort(s.started_at)}</time>
                    </div>
                    <div className="counselor-session-card__meta">
                      <StatusPill tone={s.risk_level === 'high' ? 'high' : 'neutral'}>
                        {s.risk_level === 'high' ? '高风险' : '常规'}
                      </StatusPill>
                      <StatusPill tone={s.status === 'active' ? 'live' : 'neutral'}>
                        {s.status === 'active' ? '进行中' : '已结束'}
                      </StatusPill>
                      <span className="counselor-session-card__count">{s.message_count} 条消息</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="counselor-insight">
          <div className="counselor-panel counselor-panel--sticky counselor-panel--replay">
            <PanelTitle
              icon={MessageSquareQuote}
              eyebrow="Session replay"
              title={selected ? `${selected.student_name} · 会话回放` : '会话回放'}
              note={selected ? selected.title : '从左侧点开一条会话后，这里展示全部对话。'}
            />
            {!selected ? (
              <p className="archive-empty__text">选择一条会话后，这里会回放学生与助手的全部消息。</p>
            ) : msgLoading ? (
              <p className="archive-loading">正在载入对话…</p>
            ) : messages.length === 0 ? (
              <p className="archive-empty__text">该会话还没有消息。</p>
            ) : (
              <div className="counselor-replay">
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
        </aside>
      </section>
    </div>
  )
}

export function StudentArchivePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all')
  const [days, setDays] = useState(14)
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')

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
        const d = await fetchStudentDetail(activeId, days)
        if (alive) setDetail(d)
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
  const lastPoint = [...trendPoints].reverse().find((p) => p.avg_intensity != null)
  const trendSummary =
    recordedDays > 0
      ? `近 ${days} 天中 ${recordedDays} 天有记录，最近均强 ${lastPoint?.avg_intensity ?? '—'}`
      : `近 ${days} 天暂无情绪强度数据`

  return (
    <div className="counselor-page">
      <CounselorHeader
        eyebrow="ARCHIVE"
        title="学生心理档案"
        description="查看学生基本资料、近多日情绪变化，并从会话索引跳转到质检回放。"
        meta={
          <>
            <StatusPill>{students.length} 名学生</StatusPill>
            <StatusPill tone={riskFilter === 'high' ? 'high' : 'neutral'}>
              {riskFilter === 'high' ? '需关注' : '全部学生'}
            </StatusPill>
          </>
        }
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
                      onClick={() => setActiveId(s.id)}
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
              <div className="counselor-panel">
                <PanelTitle icon={BookOpenText} eyebrow="Student profile" title="基本信息" />
                <dl className="counselor-profile-grid">
                  <div>
                    <dt>姓名</dt>
                    <dd>{student.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>用户名</dt>
                    <dd>{student.username}</dd>
                  </div>
                  <div>
                    <dt>用户 ID</dt>
                    <dd>{student.id}</dd>
                  </div>
                  <div>
                    <dt>角色</dt>
                    <dd>学生</dd>
                  </div>
                  <div>
                    <dt>注册时间</dt>
                    <dd>{formatShort(student.created_at) || '—'}</dd>
                  </div>
                  <div>
                    <dt>会话数</dt>
                    <dd>{profile.session_count}</dd>
                  </div>
                  <div>
                    <dt>日记数</dt>
                    <dd>{profile.journal_count}</dd>
                  </div>
                  <div>
                    <dt>高风险会话</dt>
                    <dd>{profile.high_risk_sessions}</dd>
                  </div>
                </dl>
              </div>

              <div className="counselor-panel counselor-panel--trend">
                <div className="counselor-trend-head">
                  <PanelTitle
                    icon={Sparkles}
                    eyebrow="Emotion trend"
                    title={`${student.name} · 情绪变化`}
                    note={trendSummary}
                  />
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
                {trendPoints.some((p) => p.count > 0) ? (
                  <EmotionTrendChart points={trendPoints} />
                ) : (
                  <p className="archive-empty__text">暂无情绪数据。</p>
                )}
              </div>

              <div className="counselor-record-grid">
                <div className="counselor-panel">
                  <PanelTitle icon={BookOpenText} eyebrow="Journal excerpts" title="情绪日记" />
                  {detail.journals.length > 0 ? (
                    <div className="list-panel">
                      {detail.journals.map((j) => (
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
                </div>

                <div className="counselor-panel">
                  <PanelTitle
                    icon={MessageSquareQuote}
                    eyebrow="Session index"
                    title="近期会话"
                    note="点击条目会跳到会话质检并高亮回放。"
                  />
                  {detail.sessions.length > 0 ? (
                    <div className="list-panel">
                      {detail.sessions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="list-row list-row--counselor list-row--link"
                          onClick={() => navigate(`/counselor/sessions?session=${s.id}`)}
                        >
                          <div>
                            <h3>{s.title}</h3>
                            <p>
                              {s.status === 'active' ? '进行中' : '已结束'}
                              {s.message_count ? ` · ${s.message_count} 条消息` : ''}
                            </p>
                          </div>
                          <div className="counselor-inline-meta">
                            <StatusPill tone={s.risk_level === 'high' ? 'high' : 'neutral'}>
                              {s.risk_level === 'high' ? '高风险' : '常规'}
                            </StatusPill>
                            <span className="time">{formatShort(s.started_at)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="archive-empty__text">暂无近期会话。</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </section>

        {student && profile ? (
          <aside className="counselor-insight">
            <div className="counselor-panel counselor-panel--sticky counselor-panel--folio">
              <PanelTitle icon={BookOpenText} eyebrow="Student folio" title={`${student.name} · 学生封套`} />
              <div className="counselor-facts counselor-facts--stack">
                <div>
                  <span>最近情绪</span>
                  <strong>
                    {emotionDisplay(profile.latest_emotion).emoji} {emotionDisplay(profile.latest_emotion).label}
                  </strong>
                </div>
                <div>
                  <span>近 {days} 天记录</span>
                  <strong>{profile.emotion_count} 条</strong>
                </div>
                <div>
                  <span>平均强度</span>
                  <strong>{profile.avg_intensity ?? '—'}</strong>
                </div>
              </div>
              <div className="counselor-note">
                {profile.high_risk_sessions > 0
                  ? `存在 ${profile.high_risk_sessions} 个高风险会话，可从近期会话索引跳转质检。`
                  : '近期未出现高风险会话，可继续关注情绪变化与日记频率。'}
              </div>
            </div>
          </aside>
        ) : null}
      </section>
    </div>
  )
}
