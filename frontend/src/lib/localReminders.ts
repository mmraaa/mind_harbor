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

/** 服务端提醒行（与 GET /reminders/mine 对齐的最小字段） */
export type ServerReminderRow = {
  id: number
  content: string
  remind_at: string | null
  done: boolean
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

function fireItem(item: LocalReminder, missed = false) {
  const items = loadAll()
  const idx = items.findIndex((x) => x.id === item.id)
  if (idx === -1) return
  if (items[idx].fired) return
  items[idx] = { ...items[idx], fired: true }
  saveAll(items)
  clearTimer(item.id)

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      // tag 必须每次唯一：同 tag 在同一次浏览器会话里重登时会被浏览器吞掉，表现为「不弹通知」
      new Notification('MindHarbor 提醒', {
        body: item.content,
        tag: `${item.id}-${Date.now()}`,
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

function scheduleAllPending() {
  for (const item of loadAll()) {
    scheduleItem(item)
  }
}

/** 挂载宿主：只注册回调；真正调度由 sync / register 触发 */
export function initLocalReminders(onFire: (item: LocalReminder) => void) {
  fireHandler = onFire
}

export function teardownLocalReminders() {
  fireHandler = null
  for (const id of timers.keys()) clearTimer(id)
}

/**
 * 登录后用服务端待办同步本机定时：
 * - 未完成：写入/更新本地，并按 remind_at 调度（已过期则立即弹）
 * - 已完成：清除对应本机条目，避免再弹
 * 拉取失败时可 fallback 到仅恢复 localStorage。
 */
export function syncServerReminders(rows: ServerReminderRow[]) {
  const pending = rows.filter((r) => !r.done && r.content && r.remind_at)
  const pendingIds = new Set(pending.map((r) => `db-${r.id}`))

  // 非 pending 的 db 条目（已完成或不在列表）清掉
  let items = loadAll().filter((x) => {
    if (!x.id.startsWith('db-')) return true
    if (pendingIds.has(x.id)) return true
    clearTimer(x.id)
    return false
  })

  for (const r of pending) {
    const id = `db-${r.id}`
    const remindAt = r.remind_at as string
    const existing = items.find((x) => x.id === id)
    if (existing) {
      items = items.map((x) =>
        x.id === id
          ? { ...x, content: r.content, remindAt, fired: false }
          : x,
      )
    } else {
      items.push({
        id,
        content: r.content,
        remindAt,
        fired: false,
        createdAt: new Date().toISOString(),
      })
    }
  }

  saveAll(items)
  scheduleAllPending()
}

/** 网络失败时：仅按本机缓存恢复定时 */
export function resumeLocalReminders() {
  scheduleAllPending()
}

/**
 * 登录后拉取并同步（合并并发调用，避免 React StrictMode 双挂载打两次 GET）。
 * teardown 清掉定时器后，await 结束会再 scheduleAllPending 补上。
 */
let hydrateInflight: Promise<void> | null = null

export function hydrateRemindersFromServer(
  fetchRows: () => Promise<ServerReminderRow[]>,
): Promise<void> {
  if (!hydrateInflight) {
    hydrateInflight = fetchRows()
      .then((rows) => {
        syncServerReminders(rows)
      })
      .catch(() => {
        resumeLocalReminders()
      })
      .finally(() => {
        // 短延迟后再清空，让 StrictMode 紧挨着的第二次 effect 复用同一次请求
        window.setTimeout(() => {
          hydrateInflight = null
        }, 300)
      })
  }

  return hydrateInflight.then(() => {
    scheduleAllPending()
  })
}

/** 退出登录时调用：下次登录重新拉取并允许对超时待办再次通知 */
export function resetReminderHydration() {
  hydrateInflight = null
  fireHandler = null
  for (const id of timers.keys()) clearTimer(id)
}

/** Agent 提醒卡片挂载时注册（幂等）；已触发过的不会再次调度 */
export function registerLocalReminder(payload: ReminderPayload): LocalReminder | null {
  const id = reminderId(payload)
  if (!id || !payload.content || !payload.remind_at) return null

  const items = loadAll()
  const existing = items.find((x) => x.id === id)
  if (existing) {
    if (existing.fired) return existing
    scheduleItem(existing)
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

/** 用户手动标记完成后，取消本机定时，避免再弹 */
export function clearLocalReminderByDbId(reminderId: number) {
  const id = `db-${reminderId}`
  clearTimer(id)
  saveAll(loadAll().filter((x) => x.id !== id))
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
