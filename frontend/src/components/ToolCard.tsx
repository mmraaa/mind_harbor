/**
 * 工具卡片:按 tool_card 事件 / 消息 tool_cards 渲染对应卡片。
 * type 枚举(与后端对齐):
 *   crisis / sources / breathing / reminder / resources /
 *   emotion_stats / voice / journal_record
 */

interface SourcesPayload {
  type: 'sources'
  sources?: { title?: string; text?: string }[]
}

interface BreathingPayload {
  type: 'breathing'
  name?: string
  steps?: string[]
}

interface CrisisPayload {
  type: 'crisis'
  hotline?: string
  note?: string
}

interface JournalPayload {
  type: 'journal_record'
  summary?: string
  mood_score?: number
  emotion?: { category?: string; intensity?: number }
}

interface GenericPayload {
  type: string
  [key: string]: unknown
}

export type ToolCardPayload = SourcesPayload | BreathingPayload | CrisisPayload | JournalPayload | GenericPayload

const EMOJI: Record<string, string> = {
  anxious: '😰',
  sad: '😢',
  angry: '😠',
  lonely: '🌫',
  tired: '😮‍💨',
  calm: '😌',
  hopeful: '🌅',
}

function BreathingCard({ payload }: { payload: BreathingPayload }) {
  return (
    <div className="tool-card breathing-card">
      <div className="breathing-visual" aria-hidden>
        <span className="breath-ring" />
        <span className="breath-ring ring-2" />
        <span className="breath-core" />
      </div>
      <div>
        <div className="tool-card-title">{payload.name || '呼吸练习'}</div>
        <ol className="breath-steps">
          {(payload.steps || []).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function SourcesCard({ payload }: { payload: SourcesPayload }) {
  return (
    <div className="tool-card sources-card">
      <div className="tool-card-title">📚 参考来源</div>
      {(payload.sources || []).map((s, i) => (
        <div className="source-item" key={i}>
          <span className="source-title">{s.title || '知识库'}</span>
          <span className="source-text">{s.text}</span>
        </div>
      ))}
    </div>
  )
}

function CrisisCard({ payload }: { payload: CrisisPayload }) {
  return (
    <div className="tool-card crisis-card">
      <div className="tool-card-title">🕯 请先照顾好自己</div>
      <p className="crisis-hotline">危机干预热线:{payload.hotline}</p>
      <p className="crisis-note">{payload.note}</p>
    </div>
  )
}

function JournalCard({ payload }: { payload: JournalPayload }) {
  return (
    <div className="tool-card journal-card">
      <div className="tool-card-title">📖 情绪日记已生成</div>
      <p className="journal-summary">{payload.summary}</p>
      {payload.emotion && (
        <span className="journal-emotion">
          {EMOJI[payload.emotion.category || ''] || '💭'} {payload.emotion.category} · 强度 {payload.emotion.intensity}
        </span>
      )}
    </div>
  )
}

function GenericCard({ payload }: { payload: GenericPayload }) {
  const map: Record<string, [string, string]> = {
    reminder: ['⏰ 提醒已创建', (payload.content as string) || ''],
    resources: ['🧭 为你找到这些资源', ((payload.resources as unknown[])?.length || 0) + ' 条相关资源'],
    emotion_stats: ['📊 情绪统计', (payload.explanation as string) || ''],
    voice: ['🎧 语音陪伴', (payload.text as string) || ''],
  }
  const [title, text] = map[payload.type] || [payload.type, '']
  return (
    <div className="tool-card generic-card">
      <div className="tool-card-title">{title}</div>
      {text && <p className="generic-text">{text}</p>}
      {payload.type === 'voice' && Boolean(payload.audio_b64) && (
        <audio
          controls
          src={`data:audio/mp3;base64,${payload.audio_b64}`}
          className="voice-audio"
        />
      )}
      {payload.type === 'resources' && Array.isArray(payload.resources) && (
        <ul className="resource-list">
          {(payload.resources as { id?: number; title?: string; type?: string }[]).map((r, i) => (
            <li key={r.id ?? i}>{r.title ?? ''}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ToolCard({ payload }: { payload: ToolCardPayload }) {
  switch (payload.type) {
    case 'breathing':
      return <BreathingCard payload={payload as BreathingPayload} />
    case 'sources':
      return <SourcesCard payload={payload as SourcesPayload} />
    case 'crisis':
      return <CrisisCard payload={payload as CrisisPayload} />
    case 'journal_record':
      return <JournalCard payload={payload as JournalPayload} />
    default:
      return <GenericCard payload={payload as GenericPayload} />
  }
}
