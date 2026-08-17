import { Bell, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  initLocalReminders,
  teardownLocalReminders,
  type LocalReminder,
} from '../lib/localReminders'

/** 学生端：恢复 localStorage 里的本机提醒，到点弹 toast */
export function LocalReminderHost() {
  const [active, setActive] = useState<LocalReminder | null>(null)

  useEffect(() => {
    initLocalReminders((item) => setActive(item))
    return () => teardownLocalReminders()
  }, [])

  if (!active) return null

  return (
    <div className="reminder-toast" role="status" aria-live="assertive">
      <div className="reminder-toast__icon" aria-hidden>
        <Bell size={18} />
      </div>
      <div className="reminder-toast__body">
        <strong>到点提醒</strong>
        <p>{active.content}</p>
        <time>{new Date(active.remindAt).toLocaleString('zh-CN')}</time>
      </div>
      <button
        type="button"
        className="reminder-toast__close"
        aria-label="知道了"
        onClick={() => setActive(null)}
      >
        <X size={16} />
      </button>
    </div>
  )
}
