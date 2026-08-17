import { Anchor, MessageCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  listMessages,
  listSessionsPage,
  SESSION_PAGE_SIZE,
  type ChatMessage,
  type ChatSession,
  type SessionStatusFilter,
} from '../../api/chat'
import { getErrorMessage } from '../../api/client'
import { MarkdownMessage } from '../../components/MarkdownMessage'
import { useChatStore } from '../../stores/chat'

const TAB_LABELS: Record<SessionStatusFilter, string> = {
  active: '进行中',
  closed: '已结束',
}

function formatTime(iso: string) {
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

function SessionRow({
  session,
  active,
  isCurrent,
  onSelect,
}: {
  session: ChatSession
  active: boolean
  isCurrent: boolean
  onSelect: (id: number) => void
}) {
  const closed = session.status === 'closed'

  return (
    <li>
      <button
        type="button"
        className={`tide-session-row${active ? ' tide-session-row--active' : ''}${isCurrent ? ' tide-session-row--current' : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(session.id)}
      >
        <span
          className={`tide-session-row__node${closed ? ' tide-session-row__node--closed' : ''}${!closed ? ' tide-session-row__node--live' : ''}`}
          aria-hidden
        />
        <span className="tide-session-row__content">
          <span className="tide-session-row__title">{session.title || `会话 #${session.id}`}</span>
          <span className="tide-session-row__summary">
            {closed ? session.summary || '暂无摘要' : '对话继续中，尚无摘要'}
          </span>
          <span className="tide-session-row__meta">
            <time>{formatTime(session.started_at)}</time>
            {isCurrent ? <span className="chip chip--gold">当前</span> : null}
            {closed ? (
              <span className="chip">已结束</span>
            ) : (
              <span className="chip chip--live">进行中</span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

function PortholePreview({
  session,
  messages,
  loadingMessages,
  replaying,
  onOpen,
}: {
  session: ChatSession | null
  messages: ChatMessage[]
  loadingMessages: boolean
  replaying: boolean
  onOpen: () => void
}) {
  if (!session) {
    return (
      <aside className="porthole-preview porthole-preview--idle">
        <MessageCircle size={28} strokeWidth={1.4} aria-hidden />
        <p>从左侧选一段对话，在这里预览消息。</p>
      </aside>
    )
  }

  const closed = session.status === 'closed'

  return (
    <aside className="porthole-preview">
      <header className="porthole-preview__head">
        <div>
          <p className="porthole-preview__eyebrow">舷窗预览</p>
          <h3>{session.title || `会话 #${session.id}`}</h3>
          <div className="porthole-preview__chips">
            {closed ? <span className="chip">已结束 · 只读</span> : <span className="chip chip--live">进行中</span>}
          </div>
        </div>
        <button type="button" className="primary-button" disabled={replaying} onClick={onOpen}>
          {replaying ? '打开中…' : closed ? '回放浏览' : '继续这段陪伴'}
        </button>
      </header>

      <div className="porthole-preview__stream companion-stream">
        {loadingMessages ? (
          <p className="archive-loading">正在载入消息…</p>
        ) : messages.length === 0 ? (
          <p className="archive-empty__text">这段对话还没有消息。</p>
        ) : (
          messages.map((m) => (
            <article key={m.id} className={`msg msg--${m.role === 'user' ? 'user' : 'assistant'}`}>
              <div className="msg__meta">
                <span>{m.role === 'user' ? '我' : '助手'}</span>
                {m.emotion_tags?.length ? (
                  <span className="chip">{m.emotion_tags.join(' · ')}</span>
                ) : null}
              </div>
              <div className="msg__bubble">
                {m.role === 'assistant' ? <MarkdownMessage text={m.content} /> : m.content}
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  )
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const openSession = useChatStore((s) => s.openSession)
  const currentSessionId = useChatStore((s) => s.sessionId)

  const [tab, setTab] = useState<SessionStatusFilter>('active')
  const [items, setItems] = useState<ChatSession[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [tabTotals, setTabTotals] = useState<Record<SessionStatusFilter, number | null>>({
    active: null,
    closed: null,
  })
  const [catalogReady, setCatalogReady] = useState(false)

  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [error, setError] = useState('')

  const activeSession = useMemo(
    () => items.find((s) => s.id === activeId) ?? null,
    [items, activeId],
  )

  const fetchPage = useCallback(
    async (status: SessionStatusFilter, pageNum: number, append: boolean) => {
      const data = await listSessionsPage(status, pageNum, SESSION_PAGE_SIZE)
      setItems((prev) => (append ? [...prev, ...data.items] : data.items))
      setTotal(data.total)
      setPage(data.page)
      setHasMore(data.has_more)
      setTabTotals((prev) => ({ ...prev, [status]: data.total }))
      if (!append && data.items.length > 0) {
        setActiveId((current) => {
          if (current != null && data.items.some((s) => s.id === current)) return current
          return data.items[0].id
        })
      } else if (!append && data.items.length === 0) {
        setActiveId(null)
        setMessages([])
      }
      return data
    },
    [],
  )

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [activePeek, closedPeek] = await Promise.all([
          listSessionsPage('active', 1, 1),
          listSessionsPage('closed', 1, 1),
        ])
        if (!alive) return
        setTabTotals({ active: activePeek.total, closed: closedPeek.total })
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载会话统计'))
      } finally {
        if (alive) setCatalogReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!catalogReady) return
    let alive = true
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        await fetchPage(tab, 1, false)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载会话列表'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [tab, catalogReady, fetchPage])

  useEffect(() => {
    if (activeId == null) return
    let alive = true
    setLoadingMessages(true)
    ;(async () => {
      try {
        const rows = await listMessages(activeId)
        if (alive) setMessages(rows)
      } catch (err) {
        if (alive) setError(getErrorMessage(err, '无法加载消息'))
      } finally {
        if (alive) setLoadingMessages(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [activeId])

  async function loadMore() {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      await fetchPage(tab, page + 1, true)
    } catch (err) {
      setError(getErrorMessage(err, '无法加载更多会话'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function openInChat(sessionId: number) {
    setReplaying(true)
    setError('')
    try {
      await openSession(sessionId)
      navigate('/student')
    } catch (err) {
      setError(getErrorMessage(err, '无法打开该会话'))
    } finally {
      setReplaying(false)
    }
  }

  const bothEmpty =
    catalogReady && tabTotals.active === 0 && tabTotals.closed === 0

  return (
    <div className="archive-page archive-page--tide">
      <header className="page-header archive-page__header">
        <div>
          <p className="page-header__eyebrow">对话轨迹</p>
          <h1>历史会话</h1>
          <p className="page-header__description">
            进行中的对话可以继续；已结束的只能回放浏览，不能续聊。
          </p>
        </div>
      </header>

      {error && <p className="archive-alert">{error}</p>}

      {!catalogReady || (loading && items.length === 0 && !bothEmpty) ? (
        <p className="archive-loading">正在打开档案…</p>
      ) : bothEmpty ? (
        <div className="archive-empty archive-empty--tide">
          <Anchor size={32} strokeWidth={1.4} aria-hidden />
          <h2>还没有对话记录</h2>
          <p>去「今日陪伴」说几句，第一次会话会出现在这里。</p>
          <Link to="/student" className="primary-button">
            去今日陪伴
          </Link>
        </div>
      ) : (
        <div className="archive-grid">
          <div className="tide-index">
            <div className="tide-session-tabs" role="tablist" aria-label="会话状态">
              {(['active', 'closed'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  className={`tide-session-tabs__btn${tab === key ? ' tide-session-tabs__btn--active' : ''}`}
                  onClick={() => {
                    if (tab !== key) setTab(key)
                  }}
                >
                  {TAB_LABELS[key]}
                  {tabTotals[key] != null ? (
                    <span className="tide-session-tabs__count">{tabTotals[key]}</span>
                  ) : null}
                </button>
              ))}
            </div>

            <section className="tide-session-group">
              <h2 className="tide-session-group__title">
                {TAB_LABELS[tab]}
                <span className="tide-session-group__count">{total}</span>
              </h2>

              {loading && items.length === 0 ? (
                <p className="archive-loading">正在载入…</p>
              ) : items.length === 0 ? (
                <p className="archive-empty__text">
                  {tab === 'active' ? '暂无进行中的对话。' : '暂无已结束的对话。'}
                </p>
              ) : (
                <>
                  <ul className="tide-session-list">
                    {items.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        active={activeId === s.id}
                        isCurrent={currentSessionId === s.id}
                        onSelect={setActiveId}
                      />
                    ))}
                  </ul>
                  {hasMore ? (
                    <button
                      type="button"
                      className="ghost-button tide-session-more"
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                    >
                      {loadingMore ? '加载中…' : `加载更多（${items.length}/${total}）`}
                    </button>
                  ) : items.length > 0 && total > items.length ? (
                    <p className="tide-session-more tide-session-more--done">
                      已显示全部 {total} 条
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </div>

          <PortholePreview
            session={activeSession}
            messages={messages}
            loadingMessages={loadingMessages}
            replaying={replaying}
            onOpen={() => activeId != null && void openInChat(activeId)}
          />
        </div>
      )}
    </div>
  )
}
