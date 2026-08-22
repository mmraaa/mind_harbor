import { api } from './client'

export type ReminderItem = {
  id: number
  content: string
  remind_at: string | null
  done: boolean
  created_at: string | null
}

export async function listMyReminders(): Promise<ReminderItem[]> {
  const { data } = await api.get<ReminderItem[]>('/reminders/mine')
  return data
}

export async function markReminderDone(reminderId: number): Promise<{ id: number; done: boolean }> {
  const { data } = await api.patch<{ id: number; done: boolean }>(`/reminders/${reminderId}/done`)
  return data
}
