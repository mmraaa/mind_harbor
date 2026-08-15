import { api } from './client'

export type JournalItem = {
  id: number
  session_id: number
  summary: string
  mood_score?: number
  created_at: string
  content?: string
  emotion?: {
    category?: string
    intensity?: number
    stress_source?: string | null
    support_need?: string | null
  }
}

export async function listMyJournals(): Promise<JournalItem[]> {
  const { data } = await api.get<JournalItem[]>('/journals/mine')
  return data
}

export async function getMyJournal(journalId: number): Promise<JournalItem> {
  const { data } = await api.get<JournalItem>(`/journals/mine/${journalId}`)
  return data
}
