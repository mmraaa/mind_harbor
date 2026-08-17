import { create } from 'zustand'
import {
  getSession,
  listMessages,
  sessionLifecycleStatus,
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
  sessionStatus: 'active' | 'closed' | null
  messages: UiMessage[]
  sending: boolean
  error: string
  hydrated: boolean
  setDraftError: (error: string) => void
  setSending: (v: boolean) => void
  setMessages: (updater: UiMessage[] | ((prev: UiMessage[]) => UiMessage[])) => void
  setSessionId: (id: number | null, status?: 'active' | 'closed' | null) => void
  setSessionStatus: (status: 'active' | 'closed' | null) => void
  hydrate: () => Promise<void>
  openSession: (sessionId: number) => Promise<void>
  startNewSession: () => void
  markClosedWithJournal: (journal: JournalPayload) => void
  clearError: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: readStoredSessionId(),
  sessionStatus: null,
  messages: [],
  sending: false,
  error: '',
  hydrated: false,

  setDraftError: (error) => set({ error }),
  setSending: (sending) => set({ sending }),
  clearError: () => set({ error: '' }),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),

  setMessages: (updater) => {
    set((state) => ({
      messages: typeof updater === 'function' ? updater(state.messages) : updater,
    }))
  },

  setSessionId: (id, status = 'active') => {
    if (id == null) sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, String(id))
    set({ sessionId: id, sessionStatus: id == null ? null : status })
  },

  hydrate: async () => {
    if (get().hydrated) return
    const id = get().sessionId
    if (id == null) {
      set({ hydrated: true, messages: [] })
      return
    }
    try {
      const [rows, session] = await Promise.all([listMessages(id), getSession(id)])
      set({
        sessionStatus: sessionLifecycleStatus(session),
        messages: toUiMessages(rows),
        hydrated: true,
      })
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
      set({ sessionId: null, sessionStatus: null, messages: [], hydrated: true })
    }
  },

  openSession: async (sessionId) => {
    const [rows, session] = await Promise.all([listMessages(sessionId), getSession(sessionId)])
    sessionStorage.setItem(SESSION_KEY, String(sessionId))
    set({
      sessionId,
      sessionStatus: sessionLifecycleStatus(session),
      messages: toUiMessages(rows),
      error: '',
      sending: false,
      hydrated: true,
    })
  },

  startNewSession: () => {
    sessionStorage.removeItem(SESSION_KEY)
    set({
      sessionId: null,
      sessionStatus: null,
      messages: [],
      error: '',
    })
  },

  markClosedWithJournal: (journal) => {
    set((state) => ({
      sessionStatus: 'closed',
      messages: [
        ...state.messages,
        {
          key: `journal-${journal.journal_id}`,
          role: 'assistant',
          text: '本次会话已结束，并为你生成了情绪日记。',
          cards: [{ kind: 'journal', payload: journal }],
        },
      ],
    }))
  },
}))
