import { useEffect, useState } from 'react'
import { listFavorites, removeFavorite, type FavoriteItem } from '../../api/favorites'
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

function pickContent(item: FavoriteItem): string {
  return String(item.content ?? item.message_content ?? item.text ?? '（无内容）')
}

function pickMessageId(item: FavoriteItem): number | null {
  const id = item.message_id ?? item.id
  return typeof id === 'number' ? id : null
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
    const mid = pickMessageId(item)
    if (mid == null) return
    try {
      await removeFavorite(mid)
      setItems((prev) => prev.filter((x) => pickMessageId(x) !== mid))
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
          {items.map((item, idx) => {
            const mid = pickMessageId(item)
            return (
              <article key={mid ?? idx} className="list-row">
                <div>
                  <h3>收藏消息{mid != null ? ` #${mid}` : ''}</h3>
                  <p>{pickContent(item)}</p>
                </div>
                <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                  <span className="time">{formatTime(String(item.created_at ?? ''))}</span>
                  {mid != null && (
                    <button type="button" className="ghost-button" onClick={() => void onRemove(item)}>
                      取消收藏
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
