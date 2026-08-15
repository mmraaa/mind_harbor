import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMessages, listSessions, type ChatMessage, type ChatSession } from '../../api/chat'
import { getErrorMessage } from '../../api/client'
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

export default function HistoryPage() {
  const navigate = useNavigate()
  const openSession = useChatStore((s) => s.openSession)
  const currentSessionId = useChatStore((s) => s.sessionId)

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [replaying, setReplaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await listSessions()
        if (!alive) return
        setSessions(rows)
        if (rows[0]) setActiveId(rows[0].id)
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

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">SESSIONS</p>
          <h1>历史会话</h1>
          <p className="page-header__description">
            预览消息，或点「回放到陪伴」在今日陪伴中继续查看同一会话。
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
          <div className="list-panel">
            {sessions.length === 0 && (
              <p style={{ color: 'var(--muted)' }}>还没有会话，去「今日陪伴」说几句吧。</p>
            )}
            {sessions.map((s) => (
              <article
                key={s.id}
                className={`list-row${activeId === s.id ? ' archive-student--active' : ''}`}
              >
                <button
                  type="button"
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'block',
                    width: '100%',
                  }}
                  onClick={() => setActiveId(s.id)}
                >
                  <h3>
                    {s.title || `会话 #${s.id}`}
                    {currentSessionId === s.id ? (
                      <span className="chip" style={{ marginLeft: 8 }}>
                        当前
                      </span>
                    ) : null}
                  </h3>
                  <p>{s.summary || `状态 ${s.status} · 风险 ${s.risk_level}`}</p>
                  {s.risk_level === 'high' && (
                    <span className="chip chip--risk" style={{ marginTop: 8 }}>
                      风险会话
                    </span>
                  )}
                </button>
                <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                  <span className="time">{formatTime(s.started_at)}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={replaying}
                    onClick={() => void replay(s.id)}
                  >
                    回放到陪伴
                  </button>
                </div>
              </article>
            ))}
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
                    {m.content}
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
