import { api } from './client'

export type FavoriteItem = {
  favorite_id: number
  message_id: number
  session_id: number
  session_title: string
  content: string
  created_at: string | null
}

export async function listFavorites(): Promise<FavoriteItem[]> {
  const { data } = await api.get<FavoriteItem[]>('/favorites/mine')
  return data
}

export async function addFavorite(messageId: number): Promise<{ message_id: number; favorited: boolean }> {
  const { data } = await api.post<{ message_id: number; favorited: boolean }>(
    `/favorites/${messageId}`,
  )
  return data
}

export async function removeFavorite(
  messageId: number,
): Promise<{ message_id: number; favorited: boolean }> {
  const { data } = await api.delete<{ message_id: number; favorited: boolean }>(
    `/favorites/${messageId}`,
  )
  return data
}
