import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

function SessionGroup({
  title,
  items,
  activeId,
  currentSessionId,
  replaying,
  onSelect,
  onReplay,
}: {
  title: string
  items: ChatSession[]
  activeId: number | null
  currentSessionId: number | null
  replaying: boolean
  onSelect: (id: number) => void
  onReplay: (id: number) => void
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: '1rem', marginBottom: 10, color: 'var(--sage-dark)' }}>{title}</h2>
      <div className="list-panel">
        {items.map((s) => (
          <article
            key={s.id}
            className={`list-row${activeId === s.id ? ' archive-student--active' : ''}`}
          >
            <button
              type="button"
              style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
              onClick={() => onSelect(s.id)}
            >
              <h3>
                {s.title || `会话 #${s.id}`}
                {currentSessionId === s.id ? (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    当前
                  </span>
                ) : null}
              </h3>
              <p>
                {s.status === 'closed'
                  ? s.summary || '暂无摘要'
                  : '对话未结束，无摘要'}
              </p>
            </button>
            <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
              <span className="time">{formatTime(s.started_at)}</span>
              <button
                type="button"
                className="ghost-button"
                disabled={replaying}
                onClick={() => onReplay(s.id)}
              >
                {s.status === 'closed' ? '回放查看' : '回放到陪伴'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
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
  const [replaying, setReplaying] = useState(false)
  const [error, setError] = useState('')

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
    ;(async () => {
      try {
        const rows = await listMessages(activeId)
        if (alive) setMessages(rows)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载消息'))
      }
    })()
    return () => {
      alive = false
    }
  }, [activeId])

  async function replay(sessionId: number) {
    setReplaying(true)
    setError('')
    try {
      await openSession(sessionId)
      navigate('/student')
    } catch (err) {
      setError(getErrorMessage(err, '无法回放该会话'))
    } finally {
      setReplaying(false)
    }
  }

  const empty = grouped.active.length === 0 && grouped.closed.length === 0

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">SESSIONS</p>
          <h1>历史会话</h1>
          <p className="page-header__description">
            进行中可继续对话；已结束只能回放浏览，不可续聊。
          </p>
        </div>
      </header>

      {error && (
        <p style={{ color: 'var(--danger)', marginBottom: 12, fontFamily: 'var(--font-ui)' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>加载中…</p>
      ) : (
        <div className="counselor-grid">
          <div>
            {empty && (
              <p style={{ color: 'var(--muted)' }}>还没有会话，去「今日陪伴」说几句吧。</p>
            )}
            <SessionGroup
              title="进行中"
              items={grouped.active}
              activeId={activeId}
              currentSessionId={currentSessionId}
              replaying={replaying}
              onSelect={setActiveId}
              onReplay={(id) => void replay(id)}
            />
            <SessionGroup
              title="已结束"
              items={grouped.closed}
              activeId={activeId}
              currentSessionId={currentSessionId}
              replaying={replaying}
              onSelect={setActiveId}
              onReplay={(id) => void replay(id)}
            />
          </div>

          <aside className="card-item" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <h3>{activeId != null ? `会话 #${activeId}` : '选择会话'}</h3>
            {messages.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>暂无消息</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} style={{ marginTop: 12 }}>
                  <div className="msg__meta">
                    <span>{m.role === 'user' ? '我' : '助手'}</span>
                    {m.emotion_tags?.length ? (
                      <span className="chip">{m.emotion_tags.join(' · ')}</span>
                    ) : null}
                  </div>
                  <div
                    className="msg__bubble"
                    style={{
                      background: m.role === 'user' ? 'var(--sage-dark)' : 'var(--surface)',
                      color: m.role === 'user' ? '#fffaf0' : undefined,
                      border: m.role === 'user' ? undefined : '1px solid var(--line)',
                    }}
                  >
                    {m.role === 'assistant' ? <MarkdownMessage text={m.content} /> : m.content}
                  </div>
                </div>
              ))
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
