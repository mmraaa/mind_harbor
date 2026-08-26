import { api } from './client'

export type AccountInfo = {
  id: number
  account: string
  username: string
  display_username: string
  name: string
  gender: string
  role: string
  next_username_change_at: string | null
  next_password_change_at: string | null
}

export type AccountUpdate = { name?: string; gender?: string; display_username?: string }

export async function getAccount(): Promise<AccountInfo> {
  const { data } = await api.get<AccountInfo>('/auth/account')
  return data
}

export async function updateAccount(payload: AccountUpdate): Promise<AccountInfo> {
  const { data } = await api.patch<AccountInfo>('/auth/account', payload)
  return data
}

export async function updatePassword(oldPassword: string, newPassword: string): Promise<{ detail: string; next_password_change_at: string }> {
  const { data } = await api.put<{ detail: string; next_password_change_at: string }>('/auth/password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
  return data
}
