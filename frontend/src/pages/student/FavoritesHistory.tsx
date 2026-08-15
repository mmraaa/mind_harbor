import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import './favorites.css'

interface FavoriteItem {
  favorite_id: number
  message_id: number
  session_id: number
  session_title: string
  content: string
  created_at: string | null
}

interface SessionItem {
  id: number
  title: string
  summary: string
  started_at: string | null
  risk_level: string
  status: string
}

type Tab = 'favorites' | 'history'

export default function FavoritesHistory() {
  const [tab, setTab] = useState<Tab>('favorites')
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = (t: Tab) => {
    setLoading(true)
    setError('')
    const url = t === 'favorites' ? '/favorites/mine' : '/chat/sessions'
    api
      .get(url)
      .then(({ data }) => {
        if (t === 'favorites') setFavorites(data)
        else setSessions(data)
      })
      .catch(() => setError('加载失败,请稍后重试'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const removeFavorite = async (messageId: number) => {
    await api.delete(`/favorites/${messageId}`)
    setFavorites((prev) => prev.filter((f) => f.message_id !== messageId))
  }

  return (
    <div className="fav-page">
      <header className="page-head">
        <h2 className="page-title">收藏与历史</h2>
        <div className="fav-tabs">
          <button
            className={tab === 'favorites' ? 'fav-tab is-active' : 'fav-tab'}
            onClick={() => setTab('favorites')}
          >
            收藏回复
          </button>
          <button
            className={tab === 'history' ? 'fav-tab is-active' : 'fav-tab'}
            onClick={() => setTab('history')}
          >
            历史对话
          </button>
        </div>
      </header>

      {loading && <p className="page-state">正在加载…</p>}
      {error && <p className="page-state is-error">{error}</p>}

      {!loading && !error && tab === 'favorites' && (
        <>
          {favorites.length === 0 && (
            <p className="page-state">还没有收藏。聊天时把喜欢的回复收藏起来吧。</p>
          )}
          <div className="fav-list">
            {favorites.map((f) => (
              <div key={f.favorite_id} className="fav-item">
                <div className="fav-item-main">
                  <span className="fav-session">来自「{f.session_title}」</span>
                  <p className="fav-content">{f.content}</p>
                </div>
                <div className="fav-actions">
                  <Link to={`/student/chat/${f.session_id}`}>去查看</Link>
                  <button onClick={() => void removeFavorite(f.message_id)}>取消收藏</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !error && tab === 'history' && (
        <>
          {sessions.length === 0 && (
            <p className="page-state">还没有历史对话。去聊几句吧。</p>
          )}
          <div className="fav-list">
            {sessions.map((s) => (
              <Link key={s.id} to={`/student/chat/${s.id}`} className="fav-item session-item">
                <div className="fav-item-main">
                  <span className="fav-session">
                    {s.title}
                    {s.risk_level === 'high' && <span className="risk-badge">高风险</span>}
                  </span>
                  <p className="fav-content">{s.summary || '(暂无摘要)'}</p>
                </div>
                <span className="session-status">{s.status === 'closed' ? '已结束' : '进行中'}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
