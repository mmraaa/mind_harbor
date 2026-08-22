import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../../api/client'
import { listMyReminders, markReminderDone, type ReminderItem } from '../../api/reminders'
import {
  clearLocalReminderByDbId,
  formatReminderWhen,
} from '../../lib/localReminders'

type Filter = 'pending' | 'done' | 'all'

type DayGroup = {
  key: string
  label: string
  items: ReminderItem[]
}

type CalCell = {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  pending: number
  done: number
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function clockOf(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function dayHeading(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)
  return `${month}月${day}日 · ${weekday}`
}

function agreedOn(iso: string | null) {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(iso))
  } catch {
    return null
  }
}

function relativeToNow(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  const minutes = Math.round(Math.abs(ms) / 60000)
  const overdue = ms < 0
  if (minutes < 1) return overdue ? '刚刚过点' : '不到 1 分钟'
  if (minutes < 60) return overdue ? `已过 ${minutes} 分钟` : `还有 ${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return overdue ? `已过 ${hours} 小时` : `还有 ${hours} 小时`
  const days = Math.round(hours / 24)
  return overdue ? `已过 ${days} 天` : `还有 ${days} 天`
}

function isOverdue(item: ReminderItem) {
  if (item.done || !item.remind_at) return false
  return new Date(item.remind_at).getTime() < Date.now()
}

function byRemindAtAsc(a: ReminderItem, b: ReminderItem) {
  const at = a.remind_at ? new Date(a.remind_at).getTime() : Number.POSITIVE_INFINITY
  const bt = b.remind_at ? new Date(b.remind_at).getTime() : Number.POSITIVE_INFINITY
  return at - bt
}

function lanternKicker(iso: string) {
  if (new Date(iso).getTime() < Date.now()) return '该到点了'
  const key = localDayKey(new Date(iso))
  const today = localDayKey(new Date())
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  if (key === today) return '下一次 · 今天'
  if (key === localDayKey(tomorrowDate)) return '下一次 · 明天'
  return `下一次 · ${dayHeading(key)}`
}

function groupByDay(items: ReminderItem[]): DayGroup[] {
  const overdue: ReminderItem[] = []
  const none: ReminderItem[] = []
  const buckets = new Map<string, ReminderItem[]>()

  for (const item of items) {
    if (!item.remind_at) {
      none.push(item)
      continue
    }
    if (isOverdue(item)) {
      overdue.push(item)
      continue
    }
    const key = localDayKey(new Date(item.remind_at))
    const list = buckets.get(key) ?? []
    list.push(item)
    buckets.set(key, list)
  }

  const groups: DayGroup[] = []
  if (overdue.length) {
    groups.push({ key: 'overdue', label: '已过期', items: overdue.sort(byRemindAtAsc) })
  }

  const today = localDayKey(new Date())
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = localDayKey(tomorrowDate)

  for (const key of [...buckets.keys()].sort()) {
    const label = key === today ? '今天' : key === tomorrow ? '明天' : dayHeading(key)
    groups.push({ key, label, items: (buckets.get(key) ?? []).sort(byRemindAtAsc) })
  }

  if (none.length) {
    groups.push({ key: 'none', label: '未设时间', items: none })
  }

  return groups
}

function shiftMonth(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1)
  return { year: next.getFullYear(), month: next.getMonth() }
}

function reminderCounts(items: ReminderItem[]) {
  const map = new Map<string, { pending: number; done: number }>()
  for (const item of items) {
    if (!item.remind_at) continue
    const key = localDayKey(new Date(item.remind_at))
    const cur = map.get(key) ?? { pending: 0, done: 0 }
    if (item.done) cur.done += 1
    else cur.pending += 1
    map.set(key, cur)
  }
  return map
}

function buildMonthCells(year: number, month: number, counts: Map<string, { pending: number; done: number }>): CalCell[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const todayKey = localDayKey(new Date())

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = localDayKey(date)
    const count = counts.get(key)
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: key === todayKey,
      pending: count?.pending ?? 0,
      done: count?.done ?? 0,
    }
  })
}

export default function RemindersPage() {
  const [items, setItems] = useState<ReminderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('pending')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [dockDay, setDockDay] = useState<string | null>(null)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())

  async function load() {
    setLoading(true)
    setError('')
    try {
      setItems(await listMyReminders())
    } catch (err) {
      setError(getErrorMessage(err, '无法加载提醒'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const dayItems = useMemo(() => {
    if (!dockDay) return items
    return items.filter((x) => x.remind_at && localDayKey(new Date(x.remind_at)) === dockDay)
  }, [items, dockDay])
  const pendingCount = useMemo(() => dayItems.filter((x) => !x.done).length, [dayItems])
  const doneCount = useMemo(() => dayItems.filter((x) => x.done).length, [dayItems])
  const allCount = dayItems.length
  const overdueCount = useMemo(() => items.filter((x) => isOverdue(x)).length, [items])
  const counts = useMemo(() => reminderCounts(items), [items])
  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth, counts), [viewYear, viewMonth, counts])
  const years = useMemo(() => {
    const nowY = new Date().getFullYear()
    const fromItems = items.flatMap((x) => (x.remind_at ? [new Date(x.remind_at).getFullYear()] : []))
    const min = Math.min(nowY - 8, viewYear, ...fromItems)
    const max = Math.max(nowY + 8, viewYear, ...fromItems)
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [items, viewYear])
  const isCurrentMonth = viewYear === new Date().getFullYear() && viewMonth === new Date().getMonth()
  const showJump = Boolean(dockDay) || !isCurrentMonth
  const jumpLabel = dockDay ? '看全部' : '回到本月'

  const next = useMemo(() => {
    return (
      items
        .filter((x) => !x.done && x.remind_at)
        .sort(byRemindAtAsc)[0] ?? null
    )
  }, [items])

  const visible = useMemo(() => {
    if (filter === 'pending') return items.filter((x) => !x.done)
    if (filter === 'done') return items.filter((x) => x.done)
    return items
  }, [items, filter])

  const dayScoped = useMemo(() => {
    if (!dockDay) return visible
    return visible.filter((x) => x.remind_at && localDayKey(new Date(x.remind_at)) === dockDay)
  }, [visible, dockDay])

  const showLantern = Boolean(next && filter !== 'done' && !dockDay)
  const listItems = useMemo(() => {
    if (showLantern && next) return dayScoped.filter((x) => x.id !== next.id)
    return dayScoped
  }, [dayScoped, showLantern, next])
  const groups = useMemo(() => groupByDay(listItems), [listItems])

  function goMonth(delta: number) {
    const next = shiftMonth(viewYear, viewMonth, delta)
    setViewYear(next.year)
    setViewMonth(next.month)
  }

  function showAllInThisMonth() {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setDockDay(null)
  }

  function onPickDay(cell: CalCell) {
    if (!cell.inMonth) {
      const [year, month] = cell.key.split('-').map(Number)
      setViewYear(year)
      setViewMonth(month - 1)
    }
    setDockDay((prev) => (prev === cell.key ? null : cell.key))
  }

  async function onMarkDone(item: ReminderItem) {
    if (item.done || busyId != null) return
    setBusyId(item.id)
    setError('')
    try {
      await markReminderDone(item.id)
      clearLocalReminderByDbId(item.id)
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, done: true } : x)))
    } catch (err) {
      setError(getErrorMessage(err, '标记完成失败'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="reminders-page">
      <header className="page-header reminders-page__header">
        <div>
          <p className="page-header__eyebrow">约定</p>
          <h1>我的提醒</h1>
          <p className="page-header__description">
            在今日陪伴里让小屿记下的事会出现在这里。到点后可以标记完成。
          </p>
        </div>
      </header>

      <div className="reminders-page__stage">
      {showLantern && next && next.remind_at && (
        <section
          className={`reminders-page__lantern${isOverdue(next) ? ' is-overdue' : ''}`}
          aria-labelledby="reminders-next-title"
        >
          <div className="reminders-page__lantern-glass">
            <span className="reminders-page__lantern-rope" aria-hidden />
            <span className="reminders-page__lantern-cap" aria-hidden />
            <strong>
              <time dateTime={next.remind_at}>{clockOf(next.remind_at)}</time>
            </strong>
          </div>
          <div className="reminders-page__lantern-body">
            <p className="reminders-page__lantern-kicker" id="reminders-next-title">
              {lanternKicker(next.remind_at)}
            </p>
            <p className="reminders-page__lantern-content">{next.content}</p>
            <div className="reminders-page__lantern-meta">
              <span>{relativeToNow(next.remind_at)}</span>
              {agreedOn(next.created_at) ? <span>记下于 {agreedOn(next.created_at)}</span> : null}
            </div>
            <button
              type="button"
              className="primary-button reminders-page__done-btn"
              disabled={busyId === next.id}
              onClick={() => void onMarkDone(next)}
            >
              <Check size={16} aria-hidden />
              {busyId === next.id ? '处理中…' : '标记完成'}
            </button>
          </div>
        </section>
      )}

      <div className="reminders-page__filters" role="tablist" aria-label="提醒筛选">
          {(
            [
              { key: 'pending', label: '待办', count: pendingCount },
              { key: 'done', label: '已完成', count: doneCount },
              { key: 'all', label: '全部', count: allCount },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              className={`reminders-page__filter${filter === tab.key ? ' is-active' : ''}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              {!loading ? <em>{tab.count}</em> : null}
            </button>
          ))}
      </div>

      {error && (
        <div className="reminders-page__alert" role="alert">
          <p>{error}</p>
          <button type="button" className="ghost-button" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      )}

      {loading ? (
        <div className="reminders-page__loading" aria-live="polite">
          <span className="reminders-page__loading-wave" aria-hidden />
          <p>正在加载提醒…</p>
        </div>
      ) : listItems.length === 0 && !showLantern ? (
        <div className="reminders-page__empty">
          <div className="reminders-page__empty-lantern" aria-hidden>
            <span />
          </div>
          <h2>
            {dockDay
              ? '这一天没有符合筛选的提醒'
              : filter === 'done'
                ? '还没有已完成的提醒'
                : filter === 'all'
                  ? '还没有提醒'
                  : '还没有待办'}
          </h2>
          <p>
            {dockDay
              ? '点月历上的「看全部」，可以看回所有日期。'
              : filter === 'done'
                ? '待办到点后，标记完成会出现在这里。'
                : '去今日陪伴，让小屿帮你记一件事。'}
          </p>
          {dockDay ? null : filter !== 'done' ? (
            <Link to="/student" className="ghost-button">
              去今日陪伴
            </Link>
          ) : null}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="reminders-page__group">
            <h2 className="reminders-page__group-title">{group.label}</h2>
            <ul className="reminders-page__list">
              {group.items.map((item, index) => {
                const overdue = isOverdue(item)
                return (
                  <li
                    key={item.id}
                    className={`reminders-page__item${item.done ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}`}
                    style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                  >
                    <div className="reminders-page__moor" aria-hidden>
                      <span className="reminders-page__buoy" />
                    </div>
                    <div className="reminders-page__item-time">
                      {item.remind_at ? (
                        <time dateTime={item.remind_at}>{clockOf(item.remind_at)}</time>
                      ) : (
                        <span>未设</span>
                      )}
                    </div>
                    <div className="reminders-page__item-body">
                      <p className="reminders-page__item-content">{item.content}</p>
                      <div className="reminders-page__item-meta">
                        {item.remind_at && (group.key === 'overdue' || group.key === 'none') ? (
                          <span>{formatReminderWhen(item.remind_at)}</span>
                        ) : null}
                        {agreedOn(item.created_at) ? <span>记下于 {agreedOn(item.created_at)}</span> : null}
                        {item.done ? (
                          <span className="reminders-page__badge">已完成</span>
                        ) : overdue ? (
                          <span className="reminders-page__badge reminders-page__badge--overdue">已过期</span>
                        ) : (
                          <span className="reminders-page__badge reminders-page__badge--pending">待办</span>
                        )}
                      </div>
                    </div>
                    {!item.done && (
                      <button
                        type="button"
                        className="primary-button reminders-page__done-btn"
                        disabled={busyId === item.id}
                        onClick={() => void onMarkDone(item)}
                      >
                        <Check size={16} aria-hidden />
                        {busyId === item.id ? '处理中…' : '标记完成'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
      </div>

      <aside className="reminders-page__dock" aria-label="提醒月历">
        {overdueCount > 0 && (
          <p className="reminders-page__overdue-note">
            {overdueCount} 件已过期，可在左侧列表标记完成。
          </p>
        )}

        <section className="reminders-page__cal" aria-labelledby="reminders-cal-title">
          <header className="reminders-page__cal-head">
            <p className="reminders-page__dock-kicker">月历</p>
            <h2 id="reminders-cal-title">{viewYear}年{viewMonth + 1}月</h2>
            <div className="reminders-page__cal-nav">
              <button
                type="button"
                className="reminders-page__cal-chevron"
                aria-label="上个月"
                onClick={() => goMonth(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <label className="reminders-page__cal-field">
                <select
                  value={viewYear}
                  aria-label="年份"
                  onChange={(e) => setViewYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}年
                    </option>
                  ))}
                </select>
              </label>
              <label className="reminders-page__cal-field">
                <select
                  value={viewMonth}
                  aria-label="月份"
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                >
                  {MONTHS.map((label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="reminders-page__cal-chevron"
                aria-label="下个月"
                onClick={() => goMonth(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {showJump && (
              <button
                type="button"
                className={`reminders-page__cal-today${dockDay ? ' is-current' : ''}`}
                onClick={showAllInThisMonth}
              >
                {jumpLabel}
              </button>
            )}
          </header>

          <div className="reminders-page__cal-week" aria-hidden>
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="reminders-page__cal-grid" role="grid" aria-label={`${viewYear}年${viewMonth + 1}月`}>
            {cells.map((cell) => {
              const selected = dockDay === cell.key
              const occupied = cell.pending > 0 || cell.done > 0
              return (
                <button
                  key={cell.key}
                  type="button"
                  role="gridcell"
                  aria-current={cell.isToday ? 'date' : undefined}
                  aria-pressed={selected}
                  className={[
                    'reminders-page__cal-day',
                    cell.inMonth ? '' : 'is-muted',
                    cell.isToday ? 'is-today' : '',
                    selected ? 'is-selected' : '',
                    occupied ? 'is-occupied' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => onPickDay(cell)}
                >
                  <span>{cell.day}</span>
                  {occupied ? (
                    <i className={cell.pending > 0 ? 'is-pending' : 'is-done'} aria-hidden />
                  ) : (
                    <i aria-hidden />
                  )}
                </button>
              )
            })}
          </div>
        </section>
      </aside>
    </div>
  )
}
