import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { streamCounselorChat } from '../../api/counselorChat'
import { getErrorMessage } from '../../api/client'
import {
  fetchOverview,
  fetchSessions,
  fetchStudentDetail,
  fetchStudents,
  type SessionQA,
  type StatsOverview,
  type StudentDetail,
  type StudentSummary,
} from '../../api/counselorStats'
import { emotionDisplay } from '../../data/emotions'
import { CounselorToolCards, CounselorToolsHint } from '../../components/CounselorToolCards'
import { MarkdownMessage } from '../../components/MarkdownMessage'
import { useCounselorAgentStore } from '../../stores/counselorAgent'

const SUGGESTIONS = [
  '本周焦虑强度最高的 3 位学生是谁？',
  '查看 student 最近的情绪日记记录',
  '最近两周有哪些需要重点关注的学生？',
  '列出所有被标记为 high 风险等级的会话',
]

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

  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function ask(text: string) {
    const content = text.trim()
    if (!content || sending) return

    clearError()
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

        <div className="companion-stream" aria-live="polite">
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
          <div ref={bottomRef} />
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

export function SessionsPage() {
  const [overview, setOverview] = useState<StatsOverview | null>(null)
  const [sessions, setSessions] = useState<SessionQA[]>([])
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ov, sess] = await Promise.all([
        fetchOverview(30),
        fetchSessions({ risk: riskFilter, days: 30 }),
      ])
      setOverview(ov)
      setSessions(sess.sessions)
    } catch (err) {
      setError(getErrorMessage(err, '无法加载会话数据'))
    } finally {
      setLoading(false)
    }
  }, [riskFilter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">QA</p>
          <h1>会话记录质检</h1>
          <p className="page-header__description">风险会话置顶。可回放消息并核对危机话术是否准确给出。</p>
        </div>
      </header>

      <div className="stats-strip">
        <div className="stat-card">
          <div className="label">总会话</div>
          <div className="value">{overview?.sessions ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">进行中</div>
          <div className="value">{overview?.active_sessions ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">高风险</div>
          <div className="value">{overview?.high_risk_sessions ?? '—'}</div>
        </div>
      </div>

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
          className={`ghost-button${riskFilter === 'high' ? ' ghost-button--active' : ''}`}
          onClick={() => setRiskFilter('high')}
        >
          仅高风险
        </button>
      </div>

      {error && <p className="archive-alert">{error}</p>}

      {loading ? (
        <p className="archive-loading">正在载入会话…</p>
      ) : sessions.length === 0 ? (
        <p className="archive-empty__text">暂无会话记录。</p>
      ) : (
        <div className="list-panel">
          {sessions.map((s) => (
            <article key={s.id} className="list-row">
              <div>
                <h3>
                  {s.student_name} · {s.title}
                </h3>
                <p>
                  {s.status === 'active' ? '进行中' : '已结束'} · {s.message_count} 条消息
                </p>
                <span
                  className={`chip${s.risk_level === 'high' ? ' chip--risk' : ''}`}
                  style={{ marginTop: 8 }}
                >
                  risk · {s.risk_level}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                <span className="time">{formatShort(s.started_at)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function riskLabel(sessions: number): 'high' | 'low' {
  return sessions > 0 ? 'high' : 'low'
}

export function StudentArchivePage() {
  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all')
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
        days: 30,
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
  }, [query, riskFilter])

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
        const d = await fetchStudentDetail(activeId, 30)
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
  }, [activeId])

  const activeSummary = useMemo(
    () => students.find((s) => s.id === activeId) ?? null,
    [students, activeId],
  )

  const trendBars = useMemo(() => {
    if (!detail) return []
    const byDay: Record<string, number[]> = {}
    for (const e of detail.emotion_series) {
      const day = e.created_at?.slice(0, 10) ?? '?'
      ;(byDay[day] ??= []).push(e.intensity)
    }
    const sorted = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-7)
    const maxAvg = Math.max(...sorted.map(([, vals]) => vals.reduce((a, b) => a + b, 0) / vals.length), 1)
    return sorted.map(([day, vals]) => ({
      day,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
      pct: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length / maxAvg) * 100),
    }))
  }, [detail])

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">ARCHIVE</p>
          <h1>学生心理档案</h1>
          <p className="page-header__description">
            搜索学生，查看其情绪日记（LLM 生成）与情绪趋势。学生端不可查看这些内容。
          </p>
        </div>
      </header>

      <div className="archive-search">
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
            全部
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
                  className={`archive-student${s.id === activeId ? ' archive-student--active' : ''}`}
                  onClick={() => setActiveId(s.id)}
                >
                  <span className="archive-student__name">
                    {s.name}
                    <small>{s.username}</small>
                  </span>
                  <span className={`chip${riskLabel(s.high_risk_sessions) === 'high' ? ' chip--risk' : ''}`}>
                    {emo.emoji} {emo.label}
                    {s.avg_intensity != null ? ` · ${s.avg_intensity}` : ''}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {activeSummary && (
        <div className="counselor-grid">
          <section>
            {detailLoading ? (
              <p className="archive-loading">正在载入详情…</p>
            ) : detail ? (
              <>
                <div className="trend-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{activeSummary.name} · 近期情绪强度</strong>
                    <span className="chip chip--clay">
                      {emotionDisplay(activeSummary.latest_emotion).emoji}{' '}
                      {emotionDisplay(activeSummary.latest_emotion).label}
                      {activeSummary.avg_intensity != null ? ` · 均强 ${activeSummary.avg_intensity}` : ''}
                    </span>
                  </div>
                  {trendBars.length > 0 ? (
                    <div className="trend-bars" aria-hidden>
                      {trendBars.map((b) => (
                        <div key={b.day} className="trend-bar" style={{ height: `${b.pct}%` }} title={`${b.day}: ${b.avg}`} />
                      ))}
                    </div>
                  ) : (
                    <p className="archive-empty__text">暂无情绪数据。</p>
                  )}
                </div>

                {detail.journals.length > 0 && (
                  <div className="list-panel">
                    <h3 style={{ marginBottom: 8 }}>情绪日记</h3>
                    {detail.journals.map((j) => (
                      <article key={j.id} className="list-row">
                        <div>
                          <h3>{j.summary}</h3>
                          <p>mood {j.mood_score ?? '—'}/10</p>
                        </div>
                        <span className="time">{formatShort(j.created_at)}</span>
                      </article>
                    ))}
                  </div>
                )}

                {detail.sessions.length > 0 && (
                  <div className="list-panel">
                    <h3 style={{ marginBottom: 8 }}>近期会话</h3>
                    {detail.sessions.map((s) => (
                      <article key={s.id} className="list-row">
                        <div>
                          <h3>{s.title}</h3>
                          <span className={`chip${s.risk_level === 'high' ? ' chip--risk' : ''}`}>
                            risk · {s.risk_level}
                          </span>
                        </div>
                        <span className="time">{formatShort(s.started_at)}</span>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </section>

          <aside className="card-item">
            <h3>{activeSummary.name} · 情绪快照</h3>
            <p>
              {emotionDisplay(activeSummary.latest_emotion).emoji}{' '}
              最近情绪 {emotionDisplay(activeSummary.latest_emotion).label}
              {activeSummary.latest_intensity != null ? ` · 强度 ${activeSummary.latest_intensity}` : ''}
            </p>
            <p>
              近 30 天情绪记录 {activeSummary.emotion_count} 条
              {activeSummary.avg_intensity != null ? ` · 均强 ${activeSummary.avg_intensity}` : ''}
            </p>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' }} />
            <h3>近期风险</h3>
            <p>
              {activeSummary.high_risk_sessions > 0
                ? `存在 ${activeSummary.high_risk_sessions} 个高风险会话，建议优先质检。`
                : '近期无高风险会话。'}
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}
