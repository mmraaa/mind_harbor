import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMyJournal, listMyJournals, type JournalItem } from '../../api/journals'
import { getErrorMessage } from '../../api/client'

function formatTime(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function JournalPage() {
  const [items, setItems] = useState<JournalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">JOURNAL</p>
          <h1>情绪日记</h1>
          <p className="page-header__description">
            由会话结束时自动生成，只读查看，不可修改。
          </p>
        </div>
      </header>

      {error && (
        <p style={{ color: 'var(--danger)', marginBottom: 12, fontFamily: 'var(--font-ui)' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>加载中…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>还没有日记。在陪伴页结束会话后会出现在这里。</p>
      ) : (
        <div className="list-panel">
          {items.map((j) => (
            <Link key={j.id} to={`/student/journals/${j.id}`} className="list-row">
              <div>
                <h3>{j.summary || `日记 #${j.id}`}</h3>
                <p>
                  {j.emotion?.category ? `${j.emotion.category}` : '情绪未标注'}
                  {j.emotion?.intensity != null ? ` · ${j.emotion.intensity}/10` : ''}
                  {j.mood_score != null ? ` · mood ${j.mood_score}` : ''}
                </p>
              </div>
              <span className="time">{formatTime(j.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
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

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">JOURNAL</p>
          <h1>日记详情</h1>
          <p className="page-header__description">
            <Link to="/student/journals" style={{ color: 'var(--sage-dark)' }}>
              ← 返回列表
            </Link>
          </p>
        </div>
      </header>

      {loading && <p style={{ color: 'var(--muted)' }}>加载中…</p>}
      {error && (
        <p style={{ color: 'var(--danger)', fontFamily: 'var(--font-ui)' }}>{error}</p>
      )}
      {item && (
        <article className="card-item" style={{ maxWidth: 720 }}>
          <h3>{item.summary}</h3>
          <p style={{ color: 'var(--muted)', marginTop: 6 }}>
            {formatTime(item.created_at)}
            {item.emotion?.category ? ` · ${item.emotion.category}` : ''}
            {item.emotion?.intensity != null ? ` · ${item.emotion.intensity}/10` : ''}
            {item.mood_score != null ? ` · mood ${item.mood_score}` : ''}
          </p>
          <p style={{ marginTop: 16, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{item.content}</p>
          {(item.emotion?.stress_source || item.emotion?.support_need) && (
            <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: '0.9rem' }}>
              {item.emotion.stress_source && <p>压力来源：{item.emotion.stress_source}</p>}
              {item.emotion.support_need && <p>支持需求：{item.emotion.support_need}</p>}
            </div>
          )}
        </article>
      )}
    </div>
  )
}
