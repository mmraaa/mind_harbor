import { useEffect, useState } from 'react'
import { listFavorites, removeFavorite, type FavoriteItem } from '../../api/favorites'
import { getErrorMessage } from '../../api/client'
import { MarkdownMessage } from '../../components/MarkdownMessage'

function formatTime(iso?: string | null) {
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

export default function FavoritesPage() {
  const [items, setItems] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setItems(await listFavorites())
    } catch (err) {
      setError(getErrorMessage(err, '无法加载收藏'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onRemove(item: FavoriteItem) {
    try {
      await removeFavorite(item.message_id)
      setItems((prev) => prev.filter((x) => x.message_id !== item.message_id))
    } catch (err) {
      setError(getErrorMessage(err, '取消收藏失败'))
    }
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">SAVED</p>
          <h1>收藏回复</h1>
          <p className="page-header__description">保存对你有帮助的陪伴句子与资源摘要，方便回看。</p>
        </div>
      </header>

      {error && (
        <p style={{ color: 'var(--danger)', marginBottom: 12, fontFamily: 'var(--font-ui)' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>加载中…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>还没有收藏。在聊天里点书签即可保存助手回复。</p>
      ) : (
        <div className="list-panel">
          {items.map((item) => (
            <article key={item.favorite_id} className="list-row">
              <div>
                <h3>{item.session_title || `会话 #${item.session_id}`}</h3>
                <MarkdownMessage text={item.content} />
              </div>
              <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                <span className="time">{formatTime(item.created_at)}</span>
                <button type="button" className="ghost-button" onClick={() => void onRemove(item)}>
                  取消收藏
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
