import { create } from 'zustand'
import {
  listMessages,
  type ChatMessage,
  type JournalPayload,
  type ToolCardPayload,
} from '../api/chat'

const SESSION_KEY = 'mh_active_session_id'

export type UiCard =
  | { kind: 'tool'; payload: ToolCardPayload }
  | { kind: 'journal'; payload: JournalPayload }

export type UiMessage = {
  key: string
  id?: number
  role: 'user' | 'assistant'
  text: string
  emotion?: string
  cards?: UiCard[]
  isFavorite?: boolean
  streaming?: boolean
}

const WELCOME: UiMessage = {
  key: 'welcome',
  role: 'assistant',
  text: '晚上好。我会认真听你说，也会尊重你不想说的部分。今天有什么一直放不下吗？',
}

function readStoredSessionId(): number | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function toUiMessages(rows: ChatMessage[]): UiMessage[] {
  return rows.map((m) => ({
    key: `m-${m.id}`,
    id: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    text: m.content,
    emotion: m.emotion_tags?.join(' · '),
    isFavorite: m.is_favorite,
    cards: (m.tool_cards || []).map((payload) => ({ kind: 'tool' as const, payload })),
  }))
}

type ChatState = {
  sessionId: number | null
  messages: UiMessage[]
  sending: boolean
  error: string
  endSession: boolean
  hydrated: boolean
  setDraftError: (error: string) => void
  setEndSession: (v: boolean) => void
  setSending: (v: boolean) => void
  setMessages: (updater: UiMessage[] | ((prev: UiMessage[]) => UiMessage[])) => void
  setSessionId: (id: number | null) => void
  /** 首次进入陪伴页：恢复上次会话 */
  hydrate: () => Promise<void>
  /** 从历史回放指定会话 */
  openSession: (sessionId: number) => Promise<void>
  startNewSession: () => void
  clearError: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: readStoredSessionId(),
  messages: [WELCOME],
  sending: false,
  error: '',
  endSession: false,
  hydrated: false,

  setDraftError: (error) => set({ error }),
  setEndSession: (endSession) => set({ endSession }),
  setSending: (sending) => set({ sending }),
  clearError: () => set({ error: '' }),

  setMessages: (updater) => {
    set((state) => ({
      messages: typeof updater === 'function' ? updater(state.messages) : updater,
    }))
  },

  setSessionId: (id) => {
    if (id == null) sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, String(id))
    set({ sessionId: id })
  },

  hydrate: async () => {
    if (get().hydrated) return
    const id = get().sessionId
    if (id == null) {
      set({ hydrated: true, messages: get().messages.length ? get().messages : [WELCOME] })
      return
    }
    try {
      const rows = await listMessages(id)
      set({
        messages: rows.length ? toUiMessages(rows) : [WELCOME],
        hydrated: true,
      })
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
      set({ sessionId: null, messages: [WELCOME], hydrated: true })
    }
  },

  openSession: async (sessionId) => {
    const rows = await listMessages(sessionId)
    sessionStorage.setItem(SESSION_KEY, String(sessionId))
    set({
      sessionId,
      messages: rows.length ? toUiMessages(rows) : [],
      error: '',
      endSession: false,
      sending: false,
      hydrated: true,
    })
  },

  startNewSession: () => {
    sessionStorage.removeItem(SESSION_KEY)
    set({
      sessionId: null,
      messages: [
        {
          key: 'welcome',
          role: 'assistant',
          text: '新的一页。你想从哪里开始？',
        },
      ],
      error: '',
      endSession: false,
    })
  },
}))
