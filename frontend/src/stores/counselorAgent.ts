import { create } from 'zustand'
import type { CounselorToolCardPayload } from '../api/counselorChat'

export type CounselorAgentMsg = {
  key: string
  role: 'user' | 'assistant'
  text: string
  cards: CounselorToolCardPayload[]
  streaming?: boolean
}

export const COUNSELOR_AGENT_WELCOME: CounselorAgentMsg = {
  key: 'welcome',
  role: 'assistant',
  text:
    '你好，我是咨询师端数据助手。你可以用自然语言查询学生情绪统计、检索某学生的情绪记录，或排查近期需关注的学生。所有查询经只读 SQL + 表白名单校验，不会修改数据。',
  cards: [],
}

type CounselorAgentState = {
  messages: CounselorAgentMsg[]
  draft: string
  sending: boolean
  error: string
  setMessages: (
    updater: CounselorAgentMsg[] | ((prev: CounselorAgentMsg[]) => CounselorAgentMsg[]),
  ) => void
  setDraft: (draft: string) => void
  setSending: (sending: boolean) => void
  setError: (error: string) => void
  clearError: () => void
  clearChat: () => void
}

export const useCounselorAgentStore = create<CounselorAgentState>((set) => ({
  messages: [COUNSELOR_AGENT_WELCOME],
  draft: '',
  sending: false,
  error: '',

  setMessages: (updater) => {
    set((state) => ({
      messages: typeof updater === 'function' ? updater(state.messages) : updater,
    }))
  },

  setDraft: (draft) => set({ draft }),
  setSending: (sending) => set({ sending }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: '' }),

  clearChat: () =>
    set({
      messages: [COUNSELOR_AGENT_WELCOME],
      draft: '',
      error: '',
      sending: false,
    }),
}))
