import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { streamChat, type ChatEvent } from '../../api/chat'
import ToolCard, { type ToolCardPayload } from '../../components/ToolCard'
import './chat.css'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  tool_cards?: ToolCardPayload[]
  streaming?: boolean
}

/** 会话结束日记卡片(独立于消息,置底)。 */
interface JournalView {
  summary: string
  content: string
  mood_score: number
  emotion?: { category: string; intensity: number; stress_source?: string; support_need?: string }
}

export default function Chat() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [journal, setJournal] = useState<JournalView | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 进入已有会话:拉取历史消息
  useEffect(() => {
    if (!sessionId) {
      setMessages([])
      setJournal(null)
      return
    }
    let cancelled = false
    api
      .get(`/chat/sessions/${sessionId}/messages`)
      .then(({ data }) => {
        if (!cancelled) {
          setMessages(
            data.map((m: ChatMessage) => ({ ...m, streaming: false })),
          )
          setJournal(null)
        }
      })
      .catch(() => {
        if (!cancelled) setError('无法加载该会话')
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, journal, busy])

  const send = async (endSession = false) => {
    const content = input.trim()
    if (!content || busy) return
    setInput('')
    setError('')
    setBusy(true)

    const userMsg: ChatMessage = { id: Date.now(), role: 'user', content }
    const assistantId = Date.now() + 1
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', streaming: true }])

    const append = (id: number, updater: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)))

    await streamChat({
      content,
      sessionId: sessionId ? Number(sessionId) : null,
      endSession,
      onEvent: (evt: ChatEvent) => {
        switch (evt.type) {
          case 'text':
            append(assistantId, (m) => ({ ...m, content: m.content + (evt.payload.content as string) }))
            break
          case 'tool_card':
            append(assistantId, (m) => ({
              ...m,
              tool_cards: [...(m.tool_cards || []), evt.payload as ToolCardPayload],
            }))
            break
          case 'journal':
            setJournal(evt.payload as unknown as JournalView)
            break
          case 'error':
            setError((evt.payload.message as string) || '生成过程出现异常')
            break
        }
      },
      onDone: () => {
        append(assistantId, (m) => ({ ...m, streaming: false }))
        setBusy(false)
        // 新会话首轮回复后,把当前路由切到真实 session(由后端建会话,前端无 id 时列表刷新)
        if (!sessionId) {
          api.get('/chat/sessions').then(({ data }) => {
            if (data.length > 0) {
              navigate(`/student/chat/${data[0].id}`, { replace: true })
            }
          })
        }
      },
      onError: (msg) => {
        setError(msg)
        append(assistantId, (m) => ({ ...m, streaming: false }))
        setBusy(false)
      },
    })
  }

  return (
    <div className="chat-page">
      <header className="chat-head">
        <h2 className="chat-title">和 MindHarbor 聊聊</h2>
        <button
          className="chat-end-btn"
          disabled={busy || messages.length === 0}
          onClick={() => send(true)}
          title="结束会话并生成情绪日记"
        >
          结束并生成日记
        </button>
      </header>

      <div className="chat-flow">
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <p className="empty-main">今晚的海面,风浪大吗?</p>
            <p className="empty-sub">说说你的感受,我一直在这里。</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg-row ${m.role === 'user' ? 'is-user' : 'is-assistant'}`}>
            <div className="msg-bubble">
              <p className="msg-content">
                {m.content}
                {m.streaming && <span className="cursor-blink" aria-hidden>▍</span>}
              </p>
              {(m.tool_cards || []).map((card, i) => (
                <ToolCard key={i} payload={card} />
              ))}
            </div>
          </div>
        ))}

        {journal && (
          <div className="chat-journal">
            <div className="journal-head">
              📖 情绪日记
              {journal.mood_score != null && (
                <span className="journal-score">心情分 {journal.mood_score}/10</span>
              )}
            </div>
            <p className="journal-body">{journal.content}</p>
            {journal.emotion && (
              <span className="journal-tag">
                {journal.emotion.category} · 强度 {journal.emotion.intensity}
              </span>
            )}
          </div>
        )}

        {error && <p className="chat-error">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <footer className="chat-input-zone">
        <div className="chat-input-shell">
          <span className="breath-ring input-ring" aria-hidden />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={busy ? '正在聆听…' : '说点什么吧,Enter 发送,Shift+Enter 换行'}
            rows={1}
            disabled={busy}
          />
          <button className="chat-send" disabled={busy || !input.trim()} onClick={() => void send()}>
            发送
          </button>
        </div>
      </footer>
    </div>
  )
}
