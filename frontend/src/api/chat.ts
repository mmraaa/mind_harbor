import { useAuth } from '../stores/auth'

export type ChatEventType = 'text' | 'tool_card' | 'journal' | 'error'

export interface ChatEvent {
  type: ChatEventType
  payload: Record<string, unknown>
}

export interface ChatStreamOptions {
  content: string
  sessionId?: number | null
  endSession?: boolean
  onEvent: (evt: ChatEvent) => void
  onDone?: () => void
  onError?: (message: string) => void
}

/**
 * POST /chat 的 SSE 流式读取(fetch 流,EventSource 不支持 POST)。
 * 后端事件格式:`data: {"type": ..., "payload": ...}\n\n`
 */
export async function streamChat({
  content,
  sessionId,
  endSession,
  onEvent,
  onDone,
  onError,
}: ChatStreamOptions): Promise<void> {
  const { token } = useAuth.getState()
  if (!token) {
    onError?.('未登录')
    return
  }

  let resp: Response
  try {
    resp = await fetch('/api/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content, session_id: sessionId ?? null, end_session: endSession ?? false }),
    })
  } catch {
    onError?.('网络连接失败,请稍后重试')
    return
  }

  if (!resp.ok || !resp.body) {
    onError?.(`请求失败(${resp.status})`)
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // 按空行切分事件,逐条解析 data: 行
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            onEvent(JSON.parse(line.slice(6)) as ChatEvent)
          } catch {
            // 忽略无法解析的帧
          }
        }
      }
    }
  } catch {
    onError?.('连接中断,回复可能不完整')
  } finally {
    onDone?.()
  }
}
