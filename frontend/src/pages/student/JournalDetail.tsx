import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import './journal.css'

interface JournalDetailData {
  id: number
  summary: string
  content: string
  mood_score: number | null
  created_at: string | null
  emotion?: { category: string; intensity: number; stress_source?: string; support_need?: string }
}

const EMOJI: Record<string, string> = {
  anxious: '😰', sad: '😢', angry: '😠', lonely: '🌫',
  tired: '😮‍💨', calm: '😌', hopeful: '🌅',
}

export default function JournalDetail() {
  const { id } = useParams()
  const [j, setJ] = useState<JournalDetailData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get(`/journals/mine/${id}`)
      .then(({ data }) => setJ(data))
      .catch(() => setError('日记加载失败,请稍后重试'))
  }, [id])

  if (error) return <p className="page-state is-error">{error}</p>
  if (!j) return <p className="page-state">正在翻开这一页…</p>

  return (
    <div className="journal-page">
      <header className="page-head">
        <Link className="back-link" to="/student/journal">← 全部日记</Link>
        <h2 className="page-title">{j.summary}</h2>
        <p className="page-sub">{j.created_at ? j.created_at.slice(0, 10) : ''}</p>
      </header>

      <article className="journal-detail">
        <p className="journal-detail-body">{j.content}</p>

        <div className="journal-detail-meta">
          {j.mood_score != null && (
            <span className="meta-chip">心情分 {j.mood_score}/10</span>
          )}
          {j.emotion && (
            <>
              <span className="meta-chip">{EMOJI[j.emotion.category] || ''} {j.emotion.category}</span>
              <span className="meta-chip">强度 {j.emotion.intensity}/10</span>
              {j.emotion.stress_source && <span className="meta-chip">压力源:{j.emotion.stress_source}</span>}
              {j.emotion.support_need && <span className="meta-chip">需要:{j.emotion.support_need}</span>}
            </>
          )}
        </div>
      </article>
    </div>
  )
}
