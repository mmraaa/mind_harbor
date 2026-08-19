import { api } from '../api/client'

const STORAGE_KEY = 'mh_local_reminders'

export type LocalReminder = {
  id: string
  content: string
  remindAt: string
  fired: boolean
  createdAt: string
}

export type ReminderPayload = {
  reminder_id?: number
  content?: string
  remind_at?: string
}

const timers = new Map<string, number>()
let fireHandler: ((item: LocalReminder) => void) | null = null

function loadAll(): LocalReminder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LocalReminder[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAll(items: LocalReminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function reminderId(payload: ReminderPayload): string | null {
  if (!payload.content || !payload.remind_at) return null
  if (payload.reminder_id != null) return `db-${payload.reminder_id}`
  return `local-${payload.content}-${payload.remind_at}`
}

function clearTimer(id: string) {
  const tid = timers.get(id)
  if (tid != null) {
    window.clearTimeout(tid)
    timers.delete(id)
  }
}

function notifyBackendDone(localId: string) {
  const match = localId.match(/^db-(\d+)$/)
  if (!match) return
  api.patch(`/reminders/${match[1]}/done`).catch(() => {})
}

function fireItem(item: LocalReminder, missed = false) {
  const items = loadAll()
  const idx = items.findIndex((x) => x.id === item.id)
  if (idx === -1) return
  if (items[idx].fired) return
  items[idx] = { ...items[idx], fired: true }
  saveAll(items)
  clearTimer(item.id)
  notifyBackendDone(item.id)

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('MindHarbor 提醒', {
        body: item.content,
        tag: item.id,
      })
    } catch {
      // ignore
    }
  }

  fireHandler?.({ ...items[idx], content: missed ? `（补发）${item.content}` : item.content })
}

function scheduleItem(item: LocalReminder) {
  if (item.fired) return
  clearTimer(item.id)
  const ms = new Date(item.remindAt).getTime() - Date.now()
  if (ms <= 0) {
    fireItem(item, true)
    return
  }
  const tid = window.setTimeout(() => fireItem(item, false), ms)
  timers.set(item.id, tid)
}

/** App 启动时恢复未触发的本机定时 */
export function initLocalReminders(onFire: (item: LocalReminder) => void) {
  fireHandler = onFire
  for (const item of loadAll()) {
    scheduleItem(item)
  }
}

export function teardownLocalReminders() {
  fireHandler = null
  for (const id of timers.keys()) clearTimer(id)
}

/** Agent 提醒卡片挂载时注册（幂等） */
export function registerLocalReminder(payload: ReminderPayload): LocalReminder | null {
  const id = reminderId(payload)
  if (!id || !payload.content || !payload.remind_at) return null

  const items = loadAll()
  const existing = items.find((x) => x.id === id)
  if (existing) {
    if (!existing.fired) scheduleItem(existing)
    return existing
  }

  const item: LocalReminder = {
    id,
    content: payload.content,
    remindAt: payload.remind_at,
    fired: false,
    createdAt: new Date().toISOString(),
  }
  items.push(item)
  saveAll(items)
  scheduleItem(item)
  return item
}

export function isReminderScheduled(payload: ReminderPayload): boolean {
  const id = reminderId(payload)
  if (!id) return false
  const item = loadAll().find((x) => x.id === id)
  return Boolean(item && !item.fired)
}

export async function requestReminderNotification(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function formatReminderWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
