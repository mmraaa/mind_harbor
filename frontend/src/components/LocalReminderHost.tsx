import { useEffect } from 'react'
import { listMyReminders } from '../api/reminders'
import {
  hydrateRemindersFromServer,
  initLocalReminders,
  teardownLocalReminders,
} from '../lib/localReminders'

/**
 * 学生端登录后拉取待办并调度本机定时。
 * 到点仅走浏览器 Notification，不再弹页面内 toast。
 */
export function LocalReminderHost() {
  useEffect(() => {
    initLocalReminders(() => {})
    void hydrateRemindersFromServer(() => listMyReminders())
    return () => teardownLocalReminders()
  }, [])

  return null
}
