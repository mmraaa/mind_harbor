/**
 * 学生端 Agent 工具卡片渲染。
 *
 * | 工具 / 来源              | payload.type     | 展示 |
 * |-------------------------|------------------|------|
 * | search_knowledge        | knowledge        | 参考资料(折叠) |
 * | recommend_resources     | resources        | 推荐资源 |
 * | generate_breathing      | breathing        | 478 呼吸 → 弹层 |
 * | create_reminder         | reminder         | 日程提醒 + 本机定时 |
 * | dialogue 风险筛查       | crisis           | 危机热线 |
 * | end_session (独立事件)  | —                | journal 卡片(UiCard) |
 *
 * 工具执行失败 `{ error }` 不会进入卡片列表。
 */
import { BookOpen, Bell, Leaf, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBreathingExercise } from '../data/breathing'
import {
  formatReminderWhen,
  isReminderScheduled,
  registerLocalReminder,
  requestReminderNotification,
} from '../lib/localReminders'
import { MarkdownMessage } from './MarkdownMessage'
import type { ToolCardPayload } from '../api/chat'
import type { UiCard } from '../stores/chat'

function knowledgeHits(p: ToolCardPayload) {
  if (p.type === 'knowledge' && Array.isArray(p.hits)) {
    return p.hits as { title: string; text: string }[]
  }
  if (p.type === 'sources' && Array.isArray(p.sources)) {
    return p.sources as { title: string; text: string }[]
  }
  return []
}

function KnowledgeCard({ payload }: { payload: ToolCardPayload }) {
  const hits = knowledgeHits(payload)
  if (!hits.length) return null

  return (
    <details className="tool-card tool-card--knowledge">
      <summary className="tool-card__summary">
        <BookOpen size={14} aria-hidden />
        <span>参考资料</span>
        <em>{hits.length}</em>
      </summary>
      <p className="tool-card__hint">模型回答时参考了以下知识库内容，供你了解信息来源。</p>
      <ul className="tool-ref-list">
        {hits.map((hit) => (
          <li key={hit.title}>
            <strong>{hit.title}</strong>
            <MarkdownMessage text={hit.text} />
          </li>
        ))}
      </ul>
    </details>
  )
}

function ResourcesCard({ payload }: { payload: ToolCardPayload }) {
  const items = Array.isArray(payload.resources)
    ? (payload.resources as {
        id: number
        title: string
        type?: string
        content?: string
        url?: string | null
      }[])
    : []
  if (!items.length) return null

  return (
    <div className="tool-card tool-card--resources">
      <h4 className="tool-card__heading">
        <Sparkles size={14} aria-hidden />
        推荐资源
      </h4>
      <p className="tool-card__hint">根据你的需要，为你挑选了这些心理资源。</p>
      <ul className="tool-resource-list">
        {items.map((item) => (
          <li key={item.id}>
            <div className="tool-resource-list__head">
              <strong>{item.title}</strong>
              {item.type ? <span className="chip">{item.type}</span> : null}
            </div>
            {item.content ? <p>{item.content}</p> : null}
            {item.url ? (
              <a
                className="tool-resource-list__url"
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {item.url}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CrisisCard({ payload }: { payload: ToolCardPayload }) {
  const hotline = typeof payload.hotline === 'string' ? payload.hotline : '400-161-9995'
  const note =
    typeof payload.note === 'string' ? payload.note : '心理危机干预热线 / 校内心理咨询中心'

  return (
    <div className="tool-card tool-card--crisis">
      <h4>需要即时帮助</h4>
      <p>
        如有自伤或自杀念头，请立即联系：
        <br />
        <strong>{hotline}</strong>
      </p>
      <p className="tool-card__hint">{note}</p>
    </div>
  )
}

function BreathingCard({
  onOpen,
}: {
  payload: ToolCardPayload
  onOpen?: () => void
}) {
  const meta = getBreathingExercise('478')

  return (
    <div className="tool-card tool-card--breathing">
      <h4 className="tool-card__heading">
        <Leaf size={14} aria-hidden />
        478 呼吸
      </h4>
      <p className="tool-card__hint">助手为你准备了一段可跟随的 478 节奏，点按即可开始。</p>
      <div className="tool-card__breathing-head">
        <strong>{meta.name}</strong>
        <span className="chip">{meta.durationHint}</span>
      </div>
      <p className="tool-card__breathing-tagline">{meta.tagline}</p>
      {onOpen ? (
        <button type="button" className="primary-button tool-card__breathing-cta" onClick={onOpen}>
          开始跟随
        </button>
      ) : (
        <Link to="/student/practice" className="primary-button tool-card__breathing-cta">
          开始跟随
        </Link>
      )}
    </div>
  )
}

function ReminderCard({
  payload,
  scheduleOnMount = false,
}: {
  payload: ToolCardPayload
  /** 仅实时对话产生卡片时为 true；回放/历史消息不得再注册，否则会重复通知 */
  scheduleOnMount?: boolean
}) {
  const content = typeof payload.content === 'string' ? payload.content : ''
  const remindAt = typeof payload.remind_at === 'string' ? payload.remind_at : ''
  if (!content || !remindAt) return null

  const [scheduled, setScheduled] = useState(() =>
    isReminderScheduled({
      reminder_id: payload.reminder_id as number | undefined,
      content,
      remind_at: remindAt,
    }),
  )

  useEffect(() => {
    if (!scheduleOnMount) return
    const item = registerLocalReminder({
      reminder_id: payload.reminder_id as number | undefined,
      content,
      remind_at: remindAt,
    })
    if (item) setScheduled(!item.fired)
  }, [scheduleOnMount, content, remindAt, payload.reminder_id])

  const when = formatReminderWhen(remindAt)
  const past = new Date(remindAt).getTime() <= Date.now()

  return (
    <div className="tool-card tool-card--reminder">
      <h4 className="tool-card__heading">
        <Bell size={14} aria-hidden />
        日程提醒
      </h4>
      <p className="tool-card__hint">
        登录学生端后会按约定时间发送浏览器通知；关闭浏览器后，下次登录会补发已到期的待办。
      </p>
      <p className="tool-card__reminder-content">{content}</p>
      <div className="tool-card__reminder-meta">
        <time>{when}</time>
        {scheduled && !past ? <span className="chip chip--live">本机已设置</span> : null}
        {past ? <span className="chip">时间已过</span> : null}
      </div>
      {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
        <button
          type="button"
          className="ghost-button tool-card__reminder-notify"
          onClick={() => void requestReminderNotification()}
        >
          允许浏览器通知
        </button>
      )}
    </div>
  )
}

function renderToolPayload(
  p: ToolCardPayload,
  idx: number,
  onOpenBreathing?: () => void,
  scheduleReminders = false,
) {
  if (p.type === 'knowledge' || p.type === 'sources') {
    return <KnowledgeCard key={`knowledge-${idx}`} payload={p} />
  }
  if (p.type === 'resources') {
    return <ResourcesCard key={`resources-${idx}`} payload={p} />
  }
  if (p.type === 'crisis') {
    return <CrisisCard key={`crisis-${idx}`} payload={p} />
  }
  if (p.type === 'breathing') {
    return <BreathingCard key={`breathing-${idx}`} payload={p} onOpen={onOpenBreathing} />
  }
  if (p.type === 'reminder') {
    return (
      <ReminderCard
        key={`reminder-${idx}`}
        payload={p}
        scheduleOnMount={scheduleReminders}
      />
    )
  }
  return null
}

/** 渲染 Agent / 风险筛查产出的 tool_card；end_session 的 journal 走 UiCard.kind。 */
export function ToolCards({
  cards,
  onOpenBreathing,
  scheduleReminders = false,
}: {
  cards: UiCard[]
  onOpenBreathing?: () => void
  /** 仅当前正在流式输出的消息传 true，避免历史回放重复注册本机定时 */
  scheduleReminders?: boolean
}) {
  const nodes = cards.flatMap((card, idx) => {
    if (card.kind === 'journal') {
      const e = card.payload.emotion
      return (
        <div className="tool-card tool-card--journal" key={`journal-${idx}`}>
          <h4>本轮情绪日记</h4>
          <p>
            {card.payload.summary}
            {e?.category != null && (
              <>
                <br />
                心情：{e.category}
                {e.intensity != null ? ` · ${e.intensity}/10` : ''}
              </>
            )}
          </p>
          {card.payload.journal_id != null && (
            <Link
              to={`/student/journals/${card.payload.journal_id}`}
              className="ghost-button tool-card__journal-link"
            >
              查看日记 →
            </Link>
          )}
        </div>
      )
    }

    return renderToolPayload(card.payload, idx, onOpenBreathing, scheduleReminders)
  })

  const visible = nodes.filter(Boolean)
  if (!visible.length) return null

  return <div className="tool-stack">{visible}</div>
}
