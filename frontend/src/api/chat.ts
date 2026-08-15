import { api, getStoredToken } from './client'

export type ChatSession = {
  id: number
  title: string
  summary: string
  started_at: string
  risk_level: string
  status: string
}

export type ChatMessage = {
  id: number
  role: 'user' | 'assistant' | string
  content: string
  emotion_tags: string[] | null
  tool_cards: ToolCardPayload[] | null
  is_favorite: boolean
  created_at: string
}

export type ToolCardPayload = {
  type: string
  sources?: { title: string; text: string }[]
  steps?: string[]
  title?: string
  desc?: string
  [key: string]: unknown
}

export type JournalPayload = {
  journal_id: number
  summary: string
  content?: string
  mood_score?: number
  emotion?: {
    category?: string
    intensity?: number
    stress_source?: string | null
    support_need?: string | null
  }
}

export type ChatStreamEvent =
  | { type: 'text'; payload: { content: string } }
  | { type: 'tool_card'; payload: ToolCardPayload }
  | { type: 'journal'; payload: JournalPayload }
  | { type: 'error'; payload: { message?: string; detail?: string } }
  | { type: string; payload: Record<string, unknown> }

export async function listSessions(): Promise<ChatSession[]> {
  const { data } = await api.get<ChatSession[]>('/chat/sessions')
  return data
}

export async function listMessages(sessionId: number): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
  return data
}

export type StreamChatArgs = {
  content: string
  sessionId?: number | null
  endSession?: boolean
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

/** POST /chat → SSE: text / tool_card / journal / error */
export async function streamChat({
  content,
  sessionId = null,
  endSession = false,
  signal,
  onEvent,
}: StreamChatArgs): Promise<void> {
  const token = getStoredToken()
  const res = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      content,
      session_id: sessionId ?? null,
      end_session: endSession,
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `聊天失败 (${res.status})`)
  }

  if (!res.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sep = buffer.indexOf('\n\n')
    while (sep !== -1) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const raw = trimmed.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          onEvent(JSON.parse(raw) as ChatStreamEvent)
        } catch {
          // ignore malformed event
        }
      }
      sep = buffer.indexOf('\n\n')
    }
  }
}
