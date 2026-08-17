import { BookOpen, Headphones, Sparkles } from 'lucide-react'
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

function voiceSrc(p: ToolCardPayload): string | null {
  if (typeof p.url === 'string' && p.url) return p.url
  if (typeof p.audio_b64 === 'string' && p.audio_b64) {
    const format = typeof p.format === 'string' ? p.format : 'mp3'
    return `data:audio/${format};base64,${p.audio_b64}`
  }
  return null
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
              <a href={item.url} target="_blank" rel="noreferrer noopener">
                查看详情
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function VoiceCard({ payload }: { payload: ToolCardPayload }) {
  const src = voiceSrc(payload)
  const text = typeof payload.text === 'string' ? payload.text : ''
  const degraded = payload.degraded === true

  return (
    <div className="tool-card tool-card--voice">
      <h4 className="tool-card__heading">
        <Headphones size={14} aria-hidden />
        语音陪伴
      </h4>
      {text ? <p className="tool-card__voice-text">{text}</p> : null}
      {src ? (
        <audio className="tool-card__audio" controls preload="none" src={src}>
          你的浏览器不支持音频播放。
        </audio>
      ) : degraded ? (
        <p className="tool-card__hint">{typeof payload.note === 'string' ? payload.note : '语音暂不可用'}</p>
      ) : null}
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

/** 仅渲染用户可理解的卡片；内部工具结果不直接展示。 */
export function ToolCards({ cards }: { cards: UiCard[] }) {
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
        </div>
      )
    }

    const p = card.payload
    if (p.type === 'knowledge' || p.type === 'sources') {
      return <KnowledgeCard key={`knowledge-${idx}`} payload={p} />
    }
    if (p.type === 'resources') {
      return <ResourcesCard key={`resources-${idx}`} payload={p} />
    }
    if (p.type === 'voice') {
      return <VoiceCard key={`voice-${idx}`} payload={p} />
    }
    if (p.type === 'crisis') {
      return <CrisisCard key={`crisis-${idx}`} payload={p} />
    }

    return null
  })

  const visible = nodes.filter(Boolean)
  if (!visible.length) return null

  return <div className="tool-stack">{visible}</div>
}
