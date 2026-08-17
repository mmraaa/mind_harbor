import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addFavorite, removeFavorite } from '../../api/favorites'
import {
  endSession as endSessionApi,
  listMessages,
  listSessions,
  streamChat,
  type JournalPayload,
  type ToolCardPayload,
} from '../../api/chat'
import { getErrorMessage } from '../../api/client'
import { MarkdownMessage } from '../../components/MarkdownMessage'
import { BreathingModal } from '../../components/BreathingModal'
import { ToolCards } from '../../components/ToolCards'
import { toUiMessages, useChatStore, type UiMessage } from '../../stores/chat'

const SUGGESTIONS = ['最近考试压力很大，睡不好', '想学一个两分钟的呼吸练习', '校园心理咨询怎么预约？']

export default function ChatPage() {
  const sessionId = useChatStore((s) => s.sessionId)
  const sessionStatus = useChatStore((s) => s.sessionStatus)
  const messages = useChatStore((s) => s.messages)
  const sending = useChatStore((s) => s.sending)
  const error = useChatStore((s) => s.error)
  const hydrated = useChatStore((s) => s.hydrated)
  const hydrate = useChatStore((s) => s.hydrate)
  const setMessages = useChatStore((s) => s.setMessages)
  const setSessionId = useChatStore((s) => s.setSessionId)
  const setSending = useChatStore((s) => s.setSending)
  const setDraftError = useChatStore((s) => s.setDraftError)
  const clearError = useChatStore((s) => s.clearError)
  const startNewSession = useChatStore((s) => s.startNewSession)
  const markClosedWithJournal = useChatStore((s) => s.markClosedWithJournal)

  const [draft, setDraft] = useState('')
  const [ending, setEnding] = useState(false)
  const [breathingModalOpen, setBreathingModalOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const readOnly = sessionStatus === 'closed'

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending || readOnly) return

    clearError()
    setSending(true)
    setDraft('')

    const userKey = `u-${Date.now()}`
    const assistantKey = `a-${Date.now()}`
    const previousSessionId = useChatStore.getState().sessionId

    setMessages((prev) => [
      ...prev,
      { key: userKey, role: 'user', text: content },
      { key: assistantKey, role: 'assistant', text: '', cards: [], streaming: true },
    ])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat({
        content,
        sessionId: previousSessionId,
        endSession: false,
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

      const grouped = await listSessions()
      const sid = previousSessionId ?? grouped.active[0]?.id ?? null
      if (sid != null) {
        setSessionId(sid, 'active')
        const rows = await listMessages(sid)
        setMessages(toUiMessages(rows))
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.key === assistantKey ? { ...m, streaming: false } : m)),
        )
      }
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

  async function handleEndSession() {
    const sid = useChatStore.getState().sessionId
    if (sid == null || readOnly || ending) return
    setEnding(true)
    clearError()
    try {
      const journal = await endSessionApi(sid)
      markClosedWithJournal(journal)
    } catch (err) {
      setDraftError(getErrorMessage(err, '结束会话失败'))
    } finally {
      setEnding(false)
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
              {sessionId != null ? `会话 #${sessionId}` : '新会话'}
              {readOnly ? ' · 已结束（只读回放）' : ' · 切换页面会保留当前对话'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {sessionId != null && !readOnly && (
              <button
                type="button"
                className="ghost-button"
                disabled={sending || ending}
                onClick={() => void handleEndSession()}
              >
                {ending ? '结束中…' : '结束本会话'}
              </button>
            )}
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
              <div className="msg__bubble">
                {m.role === 'assistant' ? (
                  m.text ? <MarkdownMessage text={m.text} /> : m.streaming ? '…' : null
                ) : (
                  m.text
                )}
              </div>
              {m.cards && m.cards.length > 0 && (
                <ToolCards
                  cards={m.cards}
                  onOpenBreathing={() => setBreathingModalOpen(true)}
                />
              )}
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
          {readOnly ? (
            <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-ui)', fontSize: '0.88rem' }}>
              此会话已结束，只能浏览。可点「新会话」开始下一段陪伴。
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>
      </section>

      {breathingModalOpen && <BreathingModal onClose={() => setBreathingModalOpen(false)} />}
    </div>
  )
}
