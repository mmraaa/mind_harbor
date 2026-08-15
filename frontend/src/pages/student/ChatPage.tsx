import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addFavorite, removeFavorite } from '../../api/favorites'
import {
  listMessages,
  listSessions,
  streamChat,
  type JournalPayload,
  type ToolCardPayload,
} from '../../api/chat'
import { getErrorMessage } from '../../api/client'
import { toUiMessages, useChatStore, type UiCard, type UiMessage } from '../../stores/chat'

const SUGGESTIONS = ['最近考试压力很大，睡不好', '想学一个两分钟的呼吸练习', '校园心理咨询怎么预约？']

function ToolCards({ cards }: { cards: UiCard[] }) {
  return (
    <div className="tool-stack">
      {cards.map((card, idx) => {
        if (card.kind === 'journal') {
          const e = card.payload.emotion
          return (
            <div className="tool-card tool-card--journal" key={idx}>
              <h4>本轮情绪日记</h4>
              <p>
                {card.payload.summary}
                {e?.category != null && (
                  <>
                    <br />
                    心情：{e.category}
                    {e.intensity != null ? ` · ${e.intensity}/10` : ''}
                  </>
                )}
              </p>
            </div>
          )
        }

        const p = card.payload
        if (p.type === 'sources' && p.sources?.length) {
          return (
            <div className="tool-card" key={idx}>
              <h4>参考来源</h4>
              {p.sources.slice(0, 3).map((s) => (
                <p key={s.title} style={{ marginBottom: 8 }}>
                  <strong>{s.title}</strong>
                  <br />
                  {s.text.slice(0, 120)}
                  {s.text.length > 120 ? '…' : ''}
                </p>
              ))}
            </div>
          )
        }

        return (
          <div className="tool-card" key={idx}>
            <h4>{p.type || '工具卡片'}</h4>
            <p>{p.title || p.desc || JSON.stringify(p).slice(0, 160)}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function ChatPage() {
  const sessionId = useChatStore((s) => s.sessionId)
  const messages = useChatStore((s) => s.messages)
  const sending = useChatStore((s) => s.sending)
  const error = useChatStore((s) => s.error)
  const endSession = useChatStore((s) => s.endSession)
  const hydrated = useChatStore((s) => s.hydrated)
  const hydrate = useChatStore((s) => s.hydrate)
  const setMessages = useChatStore((s) => s.setMessages)
  const setSessionId = useChatStore((s) => s.setSessionId)
  const setSending = useChatStore((s) => s.setSending)
  const setEndSession = useChatStore((s) => s.setEndSession)
  const setDraftError = useChatStore((s) => s.setDraftError)
  const clearError = useChatStore((s) => s.clearError)
  const startNewSession = useChatStore((s) => s.startNewSession)

  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending) return

    clearError()
    setSending(true)
    setDraft('')

    const userKey = `u-${Date.now()}`
    const assistantKey = `a-${Date.now()}`
    const previousSessionId = useChatStore.getState().sessionId
    const shouldEnd = useChatStore.getState().endSession

    setMessages((prev) => [
      ...prev.filter((m) => m.key !== 'welcome'),
      { key: userKey, role: 'user', text: content },
      { key: assistantKey, role: 'assistant', text: '', cards: [], streaming: true },
    ])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat({
        content,
        sessionId: previousSessionId,
        endSession: shouldEnd,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'text') {
            const piece = String(event.payload?.content ?? '')
            setMessages((prev) =>
              prev.map((m) => (m.key === assistantKey ? { ...m, text: m.text + piece } : m)),
            )
          } else if (event.type === 'tool_card') {
            const payload = event.payload as ToolCardPayload
            setMessages((prev) =>
              prev.map((m) =>
                m.key === assistantKey
                  ? { ...m, cards: [...(m.cards || []), { kind: 'tool', payload }] }
                  : m,
              ),
            )
          } else if (event.type === 'journal') {
            const payload = event.payload as JournalPayload
            setMessages((prev) =>
              prev.map((m) =>
                m.key === assistantKey
                  ? { ...m, cards: [...(m.cards || []), { kind: 'journal', payload }] }
                  : m,
              ),
            )
          } else if (event.type === 'error') {
            const msg =
              (event.payload as { message?: string; detail?: string }).message ||
              (event.payload as { detail?: string }).detail ||
              '对话出错'
            setDraftError(msg)
          }
        },
      })

      const sessions = await listSessions()
      const sid = previousSessionId ?? sessions[0]?.id ?? null
      if (sid != null) {
        setSessionId(sid)
        const rows = await listMessages(sid)
        setMessages(toUiMessages(rows))
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.key === assistantKey ? { ...m, streaming: false } : m)),
        )
      }
      if (shouldEnd) setEndSession(false)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setDraftError(getErrorMessage(err, '发送失败'))
        setMessages((prev) => prev.filter((m) => m.key !== assistantKey))
      }
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  async function toggleFavorite(message: UiMessage) {
    if (!message.id) return
    try {
      if (message.isFavorite) await removeFavorite(message.id)
      else await addFavorite(message.id)
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, isFavorite: !message.isFavorite } : m)),
      )
    } catch (err) {
      setDraftError(getErrorMessage(err, '收藏操作失败'))
    }
  }

  if (!hydrated) {
    return <p style={{ color: 'var(--muted)', padding: 24 }}>正在恢复会话…</p>
  }

  return (
    <div className="companion-page">
      <section className="companion-chat">
        <header className="companion-chat__header">
          <div>
            <h2>小屿 · 陪伴助手</h2>
            <p>
              {sessionId != null ? `会话 #${sessionId}` : '新会话'} · 切换页面会保留当前对话
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="chip" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={endSession}
                onChange={(e) => setEndSession(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              结束并生成日记
            </label>
            <button type="button" className="ghost-button" onClick={() => startNewSession()}>
              新会话
            </button>
          </div>
        </header>

        <div className="companion-stream" aria-live="polite">
          {messages.map((m) => (
            <article key={m.key} className={`msg msg--${m.role}`}>
              {m.role === 'assistant' && (
                <div className="msg__meta">
                  <span>MindHarbor</span>
                  {m.emotion && <span className="chip">{m.emotion}</span>}
                  {m.id != null && (
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ minHeight: 28, padding: '0 8px' }}
                      onClick={() => void toggleFavorite(m)}
                      aria-label={m.isFavorite ? '取消收藏' : '收藏'}
                    >
                      {m.isFavorite ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                    </button>
                  )}
                </div>
              )}
              <div className="msg__bubble">{m.text || (m.streaming ? '…' : '')}</div>
              {m.cards && m.cards.length > 0 && <ToolCards cards={m.cards} />}
            </article>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="companion-dock">
          {error && (
            <p style={{ color: 'var(--danger)', marginBottom: 8, fontFamily: 'var(--font-ui)', fontSize: 13 }}>
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
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
          >
            <textarea
              className="text-area"
              rows={2}
              placeholder="慢慢说，不用一次说完…"
              value={draft}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
            />
            <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
              {sending ? '…' : '发送'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
