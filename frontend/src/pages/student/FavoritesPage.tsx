import { Bookmark, Shell } from 'lucide-react'
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

function MemoryShell({
  item,
  index,
  onRemove,
}: {
  item: FavoriteItem
  index: number
  onRemove: (item: FavoriteItem) => void
}) {
  return (
    <article
      className="memory-shell"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="memory-shell__rail" aria-hidden>
        <span className="memory-shell__node" />
      </div>
      <div className="memory-shell__body">
        <header className="memory-shell__head">
          <div>
            <Bookmark size={14} aria-hidden className="memory-shell__mark" />
            <h3>{item.session_title || `会话 #${item.session_id}`}</h3>
          </div>
          <time className="memory-shell__time">{formatTime(item.created_at)}</time>
        </header>
        <div className="memory-shell__bubble msg msg--assistant">
          <div className="msg__bubble">
            <MarkdownMessage text={item.content} />
          </div>
        </div>
        <footer className="memory-shell__foot">
          <button type="button" className="ghost-button" onClick={() => void onRemove(item)}>
            移出收藏
          </button>
        </footer>
      </div>
    </article>
  )
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
      setError(getErrorMessage(err, '移出收藏失败'))
    }
  }

  return (
    <div className="archive-page archive-page--memory">
      <header className="page-header archive-page__header">
        <div>
          <p className="page-header__eyebrow">留声</p>
          <h1>收藏回复</h1>
          <p className="page-header__description">
            你标记过的陪伴句子，像留在岸边的回声，随时可以再听一次。
          </p>
        </div>
        {!loading && items.length > 0 && (
          <span className="archive-count">共 {items.length} 条</span>
        )}
      </header>

      {error && <p className="archive-alert">{error}</p>}

      {loading ? (
        <p className="archive-loading">正在打开档案…</p>
      ) : items.length === 0 ? (
        <div className="archive-empty archive-empty--memory">
          <Shell size={32} strokeWidth={1.4} aria-hidden />
          <h2>还没有留声</h2>
          <p>在陪伴对话里，点回复旁的书签，把对你有帮助的句子收进这里。</p>
        </div>
      ) : (
        <div className="memory-timeline">
          {items.map((item, index) => (
            <MemoryShell key={item.favorite_id} item={item} index={index} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}
