import { api, getStoredToken } from './client'

export type ChatSession = {
  id: number
  title: string
  summary: string
  started_at: string
  risk_level: string
  status: string
}

/** GET /chat/sessions 分页（按 status 筛选） */
export type SessionListPage = {
  status: 'active' | 'closed'
  items: ChatSession[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export const SESSION_PAGE_SIZE = 8

export type SessionStatusFilter = SessionListPage['status']

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

export type JournalEmotionPayload = {
  category?: string
  intensity?: number
  stress_source?: string | null
  support_need?: string | null
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
  text?: string
  url?: string
  format?: string
  note?: string
  /** crisis (dialogue 风险筛查,非 Agent 工具) */
  hotline?: string
  /** generate_breathing */
  exercise?: string
  name?: string
  steps?: string[]
  /** create_reminder */
  reminder_id?: number
  content?: string
  remind_at?: string
  journal_id?: number
  summary?: string
  mood_score?: number
  emotion?: JournalEmotionPayload
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

export type AudioChunkPayload = {
  seq: number
  text: string
  data: string
  format?: string
}

export type ChatStreamEvent =
  | { type: 'text'; payload: { content: string } }
  | { type: 'tool_card'; payload: ToolCardPayload }
  | { type: 'journal'; payload: JournalPayload }
  | { type: 'audio_chunk'; payload: AudioChunkPayload }
  | { type: 'error'; payload: { message?: string; detail?: string } }
  | { type: string; payload: Record<string, unknown> }

export async function listSessionsPage(
  status: SessionStatusFilter,
  page = 1,
  pageSize = SESSION_PAGE_SIZE,
): Promise<SessionListPage> {
  const { data } = await api.get<SessionListPage>('/chat/sessions', {
    params: { status, page, page_size: pageSize },
  })
  return {
    status: data?.status ?? status,
    items: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    page_size: data?.page_size ?? pageSize,
    has_more: data?.has_more ?? false,
  }
}

export async function getSession(sessionId: number): Promise<ChatSession> {
  const { data } = await api.get<ChatSession>(`/chat/sessions/${sessionId}`)
  return data
}

export function sessionLifecycleStatus(session: ChatSession): 'active' | 'closed' {
  return session.status === 'closed' ? 'closed' : 'active'
}

export async function listMessages(sessionId: number): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
  return data
}

/** DELETE /chat/sessions/{id} — 对学生隐藏会话(软删);咨询师侧仍可见 */
export async function hideSession(sessionId: number): Promise<{ id: number; hidden: boolean }> {
  const { data } = await api.delete<{ id: number; hidden: boolean }>(`/chat/sessions/${sessionId}`)
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
  /** 句子级流式语音：与后端 ChatRequest.voice_reply 对齐 */
  voiceReply?: boolean
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

/** POST /chat → SSE: text / tool_card / journal / audio_chunk / error */
export async function streamChat({
  content,
  sessionId = null,
  endSession = false,
  voiceReply = false,
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
      voice_reply: voiceReply,
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
