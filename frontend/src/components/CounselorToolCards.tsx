import { AlertTriangle, Database, NotebookPen, Users } from 'lucide-react'
import type {
  AtRiskStudentsPayload,
  CounselorToolCardPayload,
  StatsTablePayload,
  StudentJournalsPayload,
} from '../api/counselorChat'
import { emotionDisplay } from '../data/emotions'
import { rowsToMarkdownTable } from '../lib/markdownTable'
import { MarkdownTable } from './MarkdownTable'

function StatsTableCard({ payload }: { payload: StatsTablePayload }) {
  const { sql, headers, rows, row_count, explanation } = payload

  return (
    <>
      <div className="tool-card tool-card--sql">
        <h4 className="tool-card__heading">
          <Database size={14} aria-hidden />
          生成的 SQL
        </h4>
        <code>{sql}</code>
      </div>
      <div className="tool-card tool-card--stats">
        <h4 className="tool-card__heading">查询结果</h4>
        {explanation ? <p className="tool-card__hint">{explanation}</p> : null}
        {headers.length === 0 ? (
          <p className="tool-card__hint">无列定义或查询未返回结构。</p>
        ) : rows.length === 0 ? (
          <p className="tool-card__hint">查询成功，但无匹配数据（0 行）。</p>
        ) : (
          <>
            <p className="tool-card__meta">共 {row_count} 行（最多展示 100 行）</p>
            <MarkdownTable markdown={rowsToMarkdownTable(headers, rows)} />
          </>
        )}
      </div>
    </>
  )
}

function StudentJournalsCard({ payload }: { payload: StudentJournalsPayload }) {
  const { student, count, entries } = payload

  return (
    <div className="tool-card tool-card--journals">
      <h4 className="tool-card__heading">
        <NotebookPen size={14} aria-hidden />
        {student} · 情绪记录
      </h4>
      {count === 0 ? (
        <p className="tool-card__hint">未找到匹配学生的情绪记录，请检查姓名或用户名。</p>
      ) : (
        <>
          <p className="tool-card__meta">最近 {count} 条</p>
          <ul className="counselor-entry-list">
            {entries.map((e, i) => {
              const emo = emotionDisplay(e.category)
              return (
                <li key={`${e.student_id}-${e.created_at ?? i}`}>
                  <span className="counselor-entry-list__emo">
                    {emo.emoji} {emo.label}
                    {e.intensity != null ? ` · ${e.intensity}/10` : ''}
                  </span>
                  {e.stress_source ? <p>压力来源：{e.stress_source}</p> : null}
                  {e.created_at ? (
                    <time className="counselor-entry-list__time">
                      {new Date(e.created_at).toLocaleString('zh-CN')}
                    </time>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function AtRiskStudentsCard({ payload }: { payload: AtRiskStudentsPayload }) {
  const { days, count, students } = payload

  return (
    <div className="tool-card tool-card--at-risk">
      <h4 className="tool-card__heading">
        <AlertTriangle size={14} aria-hidden />
        需关注学生
      </h4>
      <p className="tool-card__hint">
        近 {days} 天内高强度负面情绪（≥7）或存在高风险会话的学生。
      </p>
      {count === 0 ? (
        <p className="tool-card__meta">暂无异常标记学生。</p>
      ) : (
        <>
          <p className="tool-card__meta">共 {count} 人</p>
          <MarkdownTable
            markdown={rowsToMarkdownTable(
              ['学生', '高强度负面次数', '最近情绪', '高风险会话'],
              students.map((s) => ({
                学生: s.name,
                高强度负面次数: s.hot_emotion_count,
                最近情绪: s.latest_emotion ?? '—',
                高风险会话: s.high_risk_sessions,
              })),
            )}
          />
        </>
      )}
    </div>
  )
}

/** 咨询师 Agent 工具卡片：stats_table / student_journals / at_risk_students */
export function CounselorToolCards({ cards }: { cards: CounselorToolCardPayload[] }) {
  if (!cards.length) return null

  const nodes = cards.map((payload, idx) => {
    if (payload.type === 'stats_table') {
      return <StatsTableCard key={`stats-${idx}`} payload={payload as StatsTablePayload} />
    }
    if (payload.type === 'student_journals') {
      return (
        <StudentJournalsCard key={`journals-${idx}`} payload={payload as StudentJournalsPayload} />
      )
    }
    if (payload.type === 'at_risk_students') {
      return (
        <AtRiskStudentsCard key={`risk-${idx}`} payload={payload as AtRiskStudentsPayload} />
      )
    }
    return null
  })

  const visible = nodes.filter(Boolean)
  if (!visible.length) return null

  return <div className="tool-stack">{visible}</div>
}

export function CounselorToolsHint() {
  return (
    <div className="counselor-tools-hint">
      <Users size={14} aria-hidden />
      <span>支持：情绪统计（SQL）、学生日记检索、异常学生识别</span>
    </div>
  )
}
