import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import './journal.css'

interface JournalItem {
  id: number
  session_id: number | null
  summary: string
  mood_score: number | null
  created_at: string | null
  emotion?: { category: string; intensity: number; stress_source?: string; support_need?: string }
}

const EMOJI: Record<string, string> = {
  anxious: '😰', sad: '😢', angry: '😠', lonely: '🌫',
  tired: '😮‍💨', calm: '😌', hopeful: '🌅',
}

export default function Journal() {
  const [items, setItems] = useState<JournalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/journals/mine')
      .then(({ data }) => setItems(data))
      .catch(() => setError('日记加载失败,请稍后重试'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="journal-page">
      <header className="page-head">
        <h2 className="page-title">情绪日记</h2>
        <p className="page-sub">每次聊天结束时,由 MindHarbor 为你写下的文字</p>
      </header>

      {loading && <p className="page-state">正在翻开日记本…</p>}
      {error && <p className="page-state is-error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="journal-empty">
          <p className="empty-main">还没有日记</p>
          <p className="empty-sub">
            去<Link to="/student/chat">聊天</Link>吧,结束会话时点「结束并生成日记」,第一篇日记就在那里等你。
          </p>
        </div>
      )}

      <div className="journal-list">
        {items.map((j) => (
          <Link key={j.id} to={`/student/journal/${j.id}`} className="journal-item">
            <span className="journal-emoji" aria-hidden>
              {EMOJI[j.emotion?.category || ''] || '💭'}
            </span>
            <span className="journal-item-main">
              <span className="journal-item-summary">{j.summary}</span>
              <span className="journal-item-meta">
                {j.emotion?.category} · 强度 {j.emotion?.intensity}
                {j.created_at ? ` · ${j.created_at.slice(0, 10)}` : ''}
              </span>
            </span>
            {j.mood_score != null && <span className="journal-item-score">{j.mood_score}</span>}
          </Link>
        ))}
      </div>
    </div>
  )
}
