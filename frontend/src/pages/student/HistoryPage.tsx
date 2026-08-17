import { Anchor, MessageCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  listMessages,
  listSessions,
  type ChatMessage,
  type ChatSession,
  type SessionListGrouped,
} from '../../api/chat'
import { getErrorMessage } from '../../api/client'
import { MarkdownMessage } from '../../components/MarkdownMessage'
import { useChatStore } from '../../stores/chat'

function formatTime(iso: string) {
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

function SessionRow({
  session,
  active,
  isCurrent,
  onSelect,
}: {
  session: ChatSession
  active: boolean
  isCurrent: boolean
  onSelect: (id: number) => void
}) {
  const closed = session.status === 'closed'

  return (
    <li>
      <button
        type="button"
        className={`tide-session-row${active ? ' tide-session-row--active' : ''}${isCurrent ? ' tide-session-row--current' : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(session.id)}
      >
        <span
          className={`tide-session-row__node${closed ? ' tide-session-row__node--closed' : ''}${!closed ? ' tide-session-row__node--live' : ''}`}
          aria-hidden
        />
        <span className="tide-session-row__content">
          <span className="tide-session-row__title">{session.title || `会话 #${session.id}`}</span>
          <span className="tide-session-row__summary">
            {closed ? session.summary || '暂无摘要' : '对话继续中，尚无摘要'}
          </span>
          <span className="tide-session-row__meta">
            <time>{formatTime(session.started_at)}</time>
            {isCurrent ? <span className="chip chip--gold">当前</span> : null}
            {closed ? (
              <span className="chip">已结束</span>
            ) : (
              <span className="chip chip--live">进行中</span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

function SessionGroup({
  title,
  count,
  items,
  activeId,
  currentSessionId,
  onSelect,
}: {
  title: string
  count: number
  items: ChatSession[]
  activeId: number | null
  currentSessionId: number | null
  onSelect: (id: number) => void
}) {
  if (items.length === 0) return null

  return (
    <section className="tide-session-group">
      <h2 className="tide-session-group__title">
        {title}
        <span className="tide-session-group__count">{count}</span>
      </h2>
      <ul className="tide-session-list">
        {items.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={activeId === s.id}
            isCurrent={currentSessionId === s.id}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  )
}

function PortholePreview({
  session,
  messages,
  loadingMessages,
  replaying,
  onOpen,
}: {
  session: ChatSession | null
  messages: ChatMessage[]
  loadingMessages: boolean
  replaying: boolean
  onOpen: () => void
}) {
  if (!session) {
    return (
      <aside className="porthole-preview porthole-preview--idle">
        <MessageCircle size={28} strokeWidth={1.4} aria-hidden />
        <p>从左侧选一段对话，在这里预览消息。</p>
      </aside>
    )
  }

  const closed = session.status === 'closed'

  return (
    <aside className="porthole-preview">
      <header className="porthole-preview__head">
        <div>
          <p className="porthole-preview__eyebrow">舷窗预览</p>
          <h3>{session.title || `会话 #${session.id}`}</h3>
          <div className="porthole-preview__chips">
            {closed ? <span className="chip">已结束 · 只读</span> : <span className="chip chip--live">进行中</span>}
          </div>
        </div>
        <button type="button" className="primary-button" disabled={replaying} onClick={onOpen}>
          {replaying ? '打开中…' : closed ? '回放浏览' : '继续这段陪伴'}
        </button>
      </header>

      <div className="porthole-preview__stream companion-stream">
        {loadingMessages ? (
          <p className="archive-loading">正在载入消息…</p>
        ) : messages.length === 0 ? (
          <p className="archive-empty__text">这段对话还没有消息。</p>
        ) : (
          messages.map((m) => (
            <article key={m.id} className={`msg msg--${m.role === 'user' ? 'user' : 'assistant'}`}>
              <div className="msg__meta">
                <span>{m.role === 'user' ? '我' : '助手'}</span>
                {m.emotion_tags?.length ? (
                  <span className="chip">{m.emotion_tags.join(' · ')}</span>
                ) : null}
              </div>
              <div className="msg__bubble">
                {m.role === 'assistant' ? <MarkdownMessage text={m.content} /> : m.content}
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  )
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const openSession = useChatStore((s) => s.openSession)
  const currentSessionId = useChatStore((s) => s.sessionId)

  const [grouped, setGrouped] = useState<SessionListGrouped>({ active: [], closed: [] })
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [error, setError] = useState('')

  const allSessions = useMemo(
    () => [...grouped.active, ...grouped.closed],
    [grouped.active, grouped.closed],
  )

  const activeSession = useMemo(
    () => allSessions.find((s) => s.id === activeId) ?? null,
    [allSessions, activeId],
  )

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await listSessions()
        if (!alive) return
        setGrouped(data)
        const first = data.active[0] ?? data.closed[0]
        if (first) setActiveId(first.id)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载会话列表'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (activeId == null) return
    let alive = true
    setLoadingMessages(true)
    ;(async () => {
      try {
        const rows = await listMessages(activeId)
        if (alive) setMessages(rows)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载消息'))
      } finally {
        if (alive) setLoadingMessages(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [activeId])

  async function openInChat(sessionId: number) {
    setReplaying(true)
    setError('')
    try {
      await openSession(sessionId)
      navigate('/student')
    } catch (err) {
      setError(getErrorMessage(err, '无法打开该会话'))
    } finally {
      setReplaying(false)
    }
  }

  const empty = grouped.active.length === 0 && grouped.closed.length === 0

  return (
    <div className="archive-page archive-page--tide">
      <header className="page-header archive-page__header">
        <div>
          <p className="page-header__eyebrow">对话轨迹</p>
          <h1>历史会话</h1>
          <p className="page-header__description">
            进行中的对话可以继续；已结束的只能回放浏览，不能续聊。
          </p>
        </div>
      </header>

      {error && <p className="archive-alert">{error}</p>}

      {loading ? (
        <p className="archive-loading">正在打开档案…</p>
      ) : empty ? (
        <div className="archive-empty archive-empty--tide">
          <Anchor size={32} strokeWidth={1.4} aria-hidden />
          <h2>还没有对话记录</h2>
          <p>去「今日陪伴」说几句，第一次会话会出现在这里。</p>
          <Link to="/student" className="primary-button">
            去今日陪伴
          </Link>
        </div>
      ) : (
        <div className="archive-grid">
          <div className="tide-index">
            <SessionGroup
              title="进行中"
              count={grouped.active.length}
              items={grouped.active}
              activeId={activeId}
              currentSessionId={currentSessionId}
              onSelect={setActiveId}
            />
            <SessionGroup
              title="已结束"
              count={grouped.closed.length}
              items={grouped.closed}
              activeId={activeId}
              currentSessionId={currentSessionId}
              onSelect={setActiveId}
            />
          </div>

          <PortholePreview
            session={activeSession}
            messages={messages}
            loadingMessages={loadingMessages}
            replaying={replaying}
            onOpen={() => activeId != null && void openInChat(activeId)}
          />
        </div>
      )}
    </div>
  )
}
