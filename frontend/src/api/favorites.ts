import { api } from './client'

export type FavoriteItem = {
  id?: number
  message_id?: number
  content?: string
  role?: string
  created_at?: string
  [key: string]: unknown
}

export async function listFavorites(): Promise<FavoriteItem[]> {
  const { data } = await api.get<FavoriteItem[]>('/favorites/mine')
  return data
}

export async function addFavorite(messageId: number): Promise<unknown> {
  const { data } = await api.post(`/favorites/${messageId}`)
  return data
}

export async function removeFavorite(messageId: number): Promise<unknown> {
  const { data } = await api.delete(`/favorites/${messageId}`)
  return data
}
