import { api } from './client'

export type MemoryItem = {
  id: number
  memory_type: string
  category_label: string
  content: string
  importance: number
  confidence: number
  status: 'candidate' | 'active' | 'confirmed' | string
  source: string | null
  source_session_id: number | null
  user_confirmed: boolean
  evidence_count: number
  is_sensitive: boolean
  created_at: string | null
  updated_at: string | null
  expires_at: string | null
}

export type MemoryResponse = {
  enabled: boolean
  summary: string
  summary_updated_at: string | null
  items: MemoryItem[]
}

export type MemoryDraft = {
  content: string
}

export async function listMemories(): Promise<MemoryResponse> {
  const { data } = await api.get<MemoryResponse>('/profile/memory')
  return data
}

export async function createMemory(draft: MemoryDraft): Promise<{ item: MemoryItem }> {
  const { data } = await api.post<{ item: MemoryItem }>('/profile/memory', draft)
  return data
}

export async function updateMemory(id: number, draft: Partial<MemoryDraft>): Promise<{ item: MemoryItem }> {
  const { data } = await api.patch<{ item: MemoryItem }>(`/profile/memory/${id}`, draft)
  return data
}

export async function deleteMemory(id: number): Promise<void> {
  await api.delete(`/profile/memory/${id}`)
}

export async function clearMemories(): Promise<void> {
  await api.delete('/profile/memory')
}

export async function setMemoryEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
  const { data } = await api.post<{ enabled: boolean }>('/profile/memory/settings', { enabled })
  return data
}

export async function refreshMemorySummary(): Promise<MemoryResponse> {
  const { data } = await api.post<MemoryResponse>('/profile/memory/refresh-summary')
  return data
}
