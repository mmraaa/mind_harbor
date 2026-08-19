import { CalendarDays, ChevronLeft, ChevronRight, LockKeyhole, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMyJournal, listMyJournals, type JournalItem } from '../../api/journals'
import { getErrorMessage } from '../../api/client'
import { emotionDisplay } from '../../data/emotions'

const PAGE_SIZE = 8

function entryWhen(iso?: string) {
  if (!iso) return { day: '--', month: '', time: '', year: '' }
  try {
    const date = new Date(iso)
    return {
      day: String(date.getDate()).padStart(2, '0'),
      month: new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date),
      time: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date),
      year: String(date.getFullYear()),
    }
  } catch {
    return { day: '--', month: iso, time: '', year: '' }
  }
}

function whenFromDate(date: Date) {
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date),
    year: String(date.getFullYear()),
  }
}

function DateRail({ mode = 'iso', iso }: { mode?: 'now' | 'iso'; iso?: string }) {
  const when = mode === 'now' ? whenFromDate(new Date()) : entryWhen(iso)

  return (
    <aside className="diary-date-rail" aria-hidden="true">
      <span>NOW</span>
      <strong>{when.day}</strong>
      <i />
      <small>{when.year}</small>
    </aside>
  )
}

function JournalEntryRow({ item }: { item: JournalItem }) {
  const when = entryWhen(item.created_at)
  const emo = emotionDisplay(item.emotion?.category)

  return (
    <Link to={`/student/journals/${item.id}`} className="diary-entry diary-entry--link">
      <div className="diary-entry__date">
        <span aria-hidden>{emo.emoji}</span>
        <div>
          <strong>{when.month}</strong>
          <small>{when.time}</small>
        </div>
      </div>
      <div className="diary-entry__body">
        <div className="diary-entry__meta">
          <span>{emo.label}</span>
          <span>
            <LockKeyhole size={13} aria-hidden />
            只读 · 会话生成
          </span>
        </div>
        <h3 className="diary-entry__title">{item.summary || `日记 #${item.id}`}</h3>
        {item.content ? <p>{item.content.length > 160 ? `${item.content.slice(0, 160)}…` : item.content}</p> : null}
        <div className="diary-entry__footer">
          <div className="diary-entry__tags">
            {item.emotion?.intensity != null && <span>强度 {item.emotion.intensity}/10</span>}
            {item.mood_score != null && <span>mood {item.mood_score}</span>}
            {item.emotion?.stress_source && <span>#{item.emotion.stress_source}</span>}
          </div>
          <span className="diary-entry__cta">阅读全文 →</span>
        </div>
      </div>
    </Link>
  )
}

function DiaryBookPages({
  items,
  totalCount,
  page,
  totalPages,
  onPageChange,
}: {
  items: JournalItem[]
  totalCount: number
  page: number
  totalPages: number
  onPageChange: (next: number) => void
}) {
  const canPrev = page > 0
  const canNext = page < totalPages - 1

  return (
    <section className="diary-list" aria-label="情绪日记时间轴">
      <div className="section-heading">
        <div>
          <p className="section-kicker">最近记录</p>
          <h2>你已经认真看见自己 {totalCount} 次</h2>
        </div>
        <span className="diary-badge">
          <Sparkles size={14} aria-hidden />
          自动生成
        </span>
      </div>

      <div className="diary-timeline">
        {items.map((j) => (
          <JournalEntryRow key={j.id} item={j} />
        ))}
      </div>

      <nav className="diary-pager" aria-label="日记分页">
        <button
          type="button"
          className="diary-pager__btn"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden />
          上一页
        </button>
        <span className="diary-pager__status">
          第 {page + 1} / {totalPages} 页
        </span>
        <button
          type="button"
          className="diary-pager__btn"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
          <ChevronRight size={16} aria-hidden />
        </button>
      </nav>

      <p className="diary-ending">
        <CalendarDays size={16} aria-hidden />
        每一次记录，都是在告诉自己：我的感受值得被看见。
      </p>
    </section>
  )
}

export default function JournalPage() {
  const [items, setItems] = useState<JournalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await listMyJournals()
        if (alive) setItems(rows)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载日记'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))

  useEffect(() => {
    if (page >= totalPages) setPage(0)
  }, [page, totalPages])

  const pageItems = useMemo(
    () => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [items, page],
  )

  const handlePageChange = (next: number) => {
    if (next < 0 || next >= totalPages) return
    setPage(next)
  }

  return (
    <div className="journal-workspace">
      <div className="diary-scene">
        <DateRail mode="now" />
        <div className="diary-paper">
          <header className="page-header">
            <div>
              <p className="page-header__eyebrow">心情日记</p>
              <h1>把今天轻轻放下来</h1>
              <p className="page-header__description">
                每次结束陪伴会话后，MindHarbor 会为你留下一段情绪记录。只读查看，不可修改。
              </p>
            </div>
          </header>

          <div className="diary-intro">
            <span aria-hidden>“</span>
            <p>不必把一天总结得很有道理，只需要留下一点真实。</p>
          </div>

          {error && (
            <p className="inline-state" role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <p className="empty-state">正在翻开你的私密日记…</p>
          ) : items.length === 0 ? (
            <p className="empty-state">还没有日记。在陪伴页结束会话后，记录会出现在这里。</p>
          ) : (
            <DiaryBookPages
              items={pageItems}
              totalCount={items.length}
              page={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export function JournalDetailPage() {
  const { id } = useParams()
  const journalId = Number(id)
  const [item, setItem] = useState<JournalItem | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!Number.isFinite(journalId)) {
      setError('无效的日记 id')
      setLoading(false)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const row = await getMyJournal(journalId)
        if (alive) setItem(row)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载日记详情'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [journalId])

  const when = entryWhen(item?.created_at)
  const emo = emotionDisplay(item?.emotion?.category)

  return (
    <div className="journal-workspace">
      <div className="diary-scene">
        <DateRail iso={item?.created_at} />
        <article className="diary-paper diary-paper--detail">
          <header className="page-header">
            <div>
              <p className="page-header__eyebrow">日记详情</p>
              <h1>{item?.summary || '情绪日记'}</h1>
              <p className="page-header__description">
                <Link to="/student/journals" className="diary-back">
                  ← 返回列表
                </Link>
              </p>
            </div>
          </header>

          {loading && <p className="empty-state">加载中…</p>}
          {error && (
            <p className="inline-state" role="alert">
              {error}
            </p>
          )}

          {item && (
            <>
              <div className="diary-detail-meta">
                <span className="diary-detail-meta__emoji" aria-hidden>
                  {emo.emoji}
                </span>
                <div>
                  <strong>{when.month}</strong>
                  <small>
                    {when.time}
                    {item.emotion?.intensity != null ? ` · 强度 ${item.emotion.intensity}/10` : ''}
                    {item.mood_score != null ? ` · mood ${item.mood_score}` : ''}
                  </small>
                </div>
                <span className="chip">{emo.label}</span>
              </div>

              <div className="diary-detail-body">{item.content || item.summary}</div>

              {(item.emotion?.stress_source || item.emotion?.support_need) && (
                <div className="diary-detail-aside">
                  {item.emotion.stress_source && (
                    <p>
                      <strong>压力来源</strong>
                      {item.emotion.stress_source}
                    </p>
                  )}
                  {item.emotion.support_need && (
                    <p>
                      <strong>支持需求</strong>
                      {item.emotion.support_need}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </div>
  )
}
