import { api, getStoredToken } from './client'

export type ChatSession = {
  id: number
  title: string
  summary: string
  started_at: string
  risk_level: string
  status: string
}

/** GET /chat/sessions 按状态分组 */
export type SessionListGrouped = {
  active: ChatSession[]
  closed: ChatSession[]
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

export type KnowledgeHit = { title: string; text: string }

export type ResourceItem = {
  id: number
  title: string
  type?: string
  content?: string
  url?: string | null
}

export type ToolCardPayload = {
  type: string
  /** search_knowledge */
  hits?: KnowledgeHit[]
  count?: number
  /** legacy */
  sources?: KnowledgeHit[]
  /** recommend_resources */
  resources?: ResourceItem[]
  /** speak_voice */
  text?: string
  url?: string
  audio_b64?: string | null
  format?: string
  degraded?: boolean
  note?: string
  /** crisis */
  hotline?: string
  /** breathing / misc */
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

export async function listSessions(): Promise<SessionListGrouped> {
  const { data } = await api.get<SessionListGrouped>('/chat/sessions')
  return {
    active: data?.active ?? [],
    closed: data?.closed ?? [],
  }
}

export function findSessionStatus(
  grouped: SessionListGrouped,
  sessionId: number,
): 'active' | 'closed' | null {
  if (grouped.active.some((s) => s.id === sessionId)) return 'active'
  if (grouped.closed.some((s) => s.id === sessionId)) return 'closed'
  return null
}

export async function listMessages(sessionId: number): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
  return data
}

/** POST /chat/sessions/{id}/end — 手动结束并生成日记 */
export async function endSession(sessionId: number): Promise<JournalPayload> {
  const { data } = await api.post<JournalPayload>(`/chat/sessions/${sessionId}/end`)
  return data
}

export type StreamChatArgs = {
  content: string
  sessionId?: number | null
  /** 仍支持 ChatRequest.end_session；优先推荐独立 endSession API */
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
    let message = text || `聊天失败 (${res.status})`
    try {
      const parsed = JSON.parse(text) as { detail?: string }
      if (typeof parsed.detail === 'string') message = parsed.detail
    } catch {
      // keep raw
    }
    throw new Error(message)
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
