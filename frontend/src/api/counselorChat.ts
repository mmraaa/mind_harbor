import { getStoredToken } from './client'
import type { ToolCardPayload } from './chat'

export type StatsTablePayload = {
  type: 'stats_table'
  sql: string
  headers: string[]
  rows: Record<string, unknown>[]
  row_count: number
  explanation?: string
}

export type StudentJournalEntry = {
  student_id: number
  category: string
  intensity: number
  stress_source?: string | null
  created_at?: string | null
}

export type StudentJournalsPayload = {
  type: 'student_journals'
  student: string
  count: number
  entries: StudentJournalEntry[]
}

export type AtRiskStudent = {
  student_id: number
  name: string
  hot_emotion_count: number
  latest_emotion?: string | null
  high_risk_sessions: number
}

export type AtRiskStudentsPayload = {
  type: 'at_risk_students'
  days: number
  count: number
  students: AtRiskStudent[]
}

export type CounselorToolCardPayload =
  | StatsTablePayload
  | StudentJournalsPayload
  | AtRiskStudentsPayload
  | ToolCardPayload

export type CounselorStreamEvent =
  | { type: 'text'; payload: { content: string } }
  | { type: 'tool_card'; payload: CounselorToolCardPayload }
  | { type: 'error'; payload: { message?: string; detail?: string } }

export type StreamCounselorChatArgs = {
  content: string
  signal?: AbortSignal
  onEvent: (event: CounselorStreamEvent) => void
}

/** POST /counselor/chat → SSE: text / tool_card / error */
export async function streamCounselorChat({
  content,
  signal,
  onEvent,
}: StreamCounselorChatArgs): Promise<void> {
  const token = getStoredToken()
  const res = await fetch('/api/v1/counselor/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = text || `查询失败 (${res.status})`
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
          onEvent(JSON.parse(raw) as CounselorStreamEvent)
        } catch {
          // ignore malformed event
        }
      }
      sep = buffer.indexOf('\n\n')
    }
  }
}
