import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

type Msg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  sql?: string
  table?: { headers: string[]; rows: string[][] }
}

const SUGGESTIONS = [
  '本周焦虑强度最高的 3 位学生是谁？',
  '阿南近 7 日情绪类别分布？',
  '列出本月被标记为 high 风险的会话',
]

const SEED: Msg[] = [
  {
    id: '1',
    role: 'assistant',
    text: '你好。我是咨询师端 SQL Agent，可以用自然语言查询你管理范围内的学生情绪、日记与会话统计。查询只读，不会修改数据。',
  },
]

export function SqlAgentPage() {
  const [messages, setMessages] = useState<Msg[]>(SEED)
  const [draft, setDraft] = useState('')

  function ask(text: string) {
    const q = text.trim()
    if (!q) return
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: q },
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: '已在只读连接中执行查询，并整理如下结果。',
        sql: "SELECT u.name, AVG(e.intensity) AS avg_intensity\nFROM emotions e JOIN users u ON u.id = e.user_id\nWHERE e.created_at >= NOW() - INTERVAL '7 days'\nGROUP BY u.name\nORDER BY avg_intensity DESC\nLIMIT 3;",
        table: {
          headers: ['学生', '近 7 日平均强度', '主情绪'],
          rows: [
            ['阿舟', '7.4', 'anxious'],
            ['小禾', '6.1', 'tired'],
            ['阿南', '5.2', 'anxious'],
          ],
        },
      },
    ])
    setDraft('')
  }

  return (
    <div className="companion-page">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">SQL AGENT</p>
          <h1>学生资料整理助手</h1>
          <p className="page-header__description">
            用自然语言查询管理学生的情绪记录、日记摘要与会话统计。底层走只读 SQL + 白名单校验。
          </p>
        </div>
      </header>

      <section className="companion-chat">
        <header className="companion-chat__header">
          <div>
            <h2>SQL Agent</h2>
            <p>自然语言 → SQL → 只读执行 → 解释</p>
          </div>
          <span className="chip">READ ONLY</span>
        </header>

        <div className="companion-stream">
          {messages.map((m) => (
            <article key={m.id} className={`msg msg--${m.role}`}>
              <div className="msg__bubble">{m.text}</div>
              {m.sql && (
                <div className="tool-stack">
                  <div className="tool-card tool-card--sql">
                    <h4>生成的 SQL</h4>
                    <code>{m.sql}</code>
                  </div>
                  {m.table && (
                    <div className="tool-card">
                      <h4>结果摘要</h4>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              {m.table.headers.map((h) => (
                                <th key={h}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {m.table.rows.map((row) => (
                              <tr key={row.join('-')}>
                                {row.map((cell) => (
                                  <td key={cell}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="companion-dock">
          <div className="suggest-row">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="suggest" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              ask(draft)
            }}
          >
            <textarea
              className="text-area"
              rows={2}
              placeholder="例如：帮我整理本周高焦虑学生名单…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="primary-button">
              询问
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

const SESSIONS = [
  {
    student: '阿舟',
    title: '高风险倾诉',
    risk: 'high',
    summary: '已触发风险模板与热线提示，待质检确认。',
    time: '今天 09:20',
  },
  {
    student: '小禾',
    title: '持续焦虑与失眠',
    risk: 'medium',
    summary: '多次触发呼吸练习；建议关注睡眠与学业负荷。',
    time: '昨天',
  },
  {
    student: '阿南',
    title: '小组作业压力',
    risk: 'low',
    summary: '情绪日记已生成，整体可观察。',
    time: '昨天',
  },
]

export function SessionsPage() {
  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">QA</p>
          <h1>会话记录质检</h1>
          <p className="page-header__description">风险会话置顶。可回放消息并核对危机话术是否准确给出。</p>
        </div>
      </header>

      <div className="stats-strip">
        <div className="stat-card">
          <div className="label">今日待质检</div>
          <div className="value">3</div>
        </div>
        <div className="stat-card">
          <div className="label">高风险</div>
          <div className="value">1</div>
        </div>
        <div className="stat-card">
          <div className="label">已复核</div>
          <div className="value">12</div>
        </div>
      </div>

      <div className="list-panel">
        {SESSIONS.map((s) => (
          <article key={`${s.student}-${s.title}`} className="list-row">
            <div>
              <h3>
                {s.student} · {s.title}
              </h3>
              <p>{s.summary}</p>
              <span
                className={`chip${s.risk === 'high' ? ' chip--risk' : ''}`}
                style={{ marginTop: 8 }}
              >
                risk · {s.risk}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
              <span className="time">{s.time}</span>
              <button type="button" className="ghost-button">
                回放
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

type ManagedStudent = {
  id: string
  name: string
  studentNo: string
  risk: 'low' | 'medium' | 'high'
  primaryEmotion: string
  avgIntensity: number
}

const MANAGED_STUDENTS: ManagedStudent[] = [
  {
    id: 's1',
    name: '阿南',
    studentNo: '20240101',
    risk: 'low',
    primaryEmotion: 'anxious',
    avgIntensity: 5.2,
  },
  {
    id: 's2',
    name: '小禾',
    studentNo: '20240118',
    risk: 'medium',
    primaryEmotion: 'tired',
    avgIntensity: 6.1,
  },
  {
    id: 's3',
    name: '阿舟',
    studentNo: '20240202',
    risk: 'high',
    primaryEmotion: 'anxious',
    avgIntensity: 7.4,
  },
  {
    id: 's4',
    name: '林夏',
    studentNo: '20240311',
    risk: 'low',
    primaryEmotion: 'calm',
    avgIntensity: 3.8,
  },
  {
    id: 's5',
    name: '周予',
    studentNo: '20240328',
    risk: 'medium',
    primaryEmotion: 'lonely',
    avgIntensity: 5.6,
  },
]

const BARS = [42, 58, 36, 70, 48, 62, 55]

export function StudentArchivePage() {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState(MANAGED_STUDENTS[0].id)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return MANAGED_STUDENTS
    return MANAGED_STUDENTS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.studentNo.includes(q) ||
        s.primaryEmotion.toLowerCase().includes(q),
    )
  }, [query])

  const active = MANAGED_STUDENTS.find((s) => s.id === activeId) ?? MANAGED_STUDENTS[0]

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">ARCHIVE</p>
          <h1>学生心理档案</h1>
          <p className="page-header__description">
            搜索你负责的学生，查看其情绪日记（LLM 生成）与情绪趋势。学生端不可查看这些内容。
          </p>
        </div>
      </header>

      <div className="archive-search">
        <label className="field-label" htmlFor="student-search">
          搜索负责学生
        </label>
        <div className="archive-search__row">
          <Search size={18} aria-hidden />
          <input
            id="student-search"
            className="text-input"
            placeholder="输入姓名、学号或主情绪…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="archive-search__results" role="listbox" aria-label="负责学生列表">
          {filtered.length === 0 ? (
            <p className="archive-search__empty">没有匹配的负责学生，试试其他关键词。</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === active.id}
                className={`archive-student${s.id === active.id ? ' archive-student--active' : ''}`}
                onClick={() => setActiveId(s.id)}
              >
                <span className="archive-student__name">
                  {s.name}
                  <small>{s.studentNo}</small>
                </span>
                <span className={`chip${s.risk === 'high' ? ' chip--risk' : ''}`}>
                  {s.risk}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="counselor-grid">
        <section>
          <div className="trend-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong>
                {active.name} · 近 7 日情绪强度
              </strong>
              <span className="chip chip--clay">
                {active.primaryEmotion} · 均强 {active.avgIntensity}
              </span>
            </div>
            <div className="trend-bars" aria-hidden>
              {BARS.map((h, i) => (
                <div key={i} className="trend-bar" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          <div className="list-panel">
            {[
              {
                title: '日记 · 小组作业与失眠',
                excerpt: '压力来自学业堆叠；需要放松与可执行下一步。mood 5/10',
                time: '今天',
              },
              {
                title: '日记 · 想家',
                excerpt: '孤独感上升；推荐同伴支持资源后情绪略回落。',
                time: '周三',
              },
            ].map((j) => (
              <article key={j.title} className="list-row">
                <div>
                  <h3>{j.title}</h3>
                  <p>{j.excerpt}</p>
                </div>
                <span className="time">{j.time}</span>
              </article>
            ))}
          </div>
        </section>

        <aside className="card-item">
          <h3>{active.name} · 情绪快照</h3>
          <p>
            主情绪 {active.primaryEmotion} · 平均强度 {active.avgIntensity}
          </p>
          <p>压力来源：学业 / 睡眠</p>
          <p>支持需求：放松、结构化建议</p>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' }} />
          <h3>近期风险</h3>
          <p>
            {active.risk === 'high'
              ? '存在 high 风险会话，建议优先质检。'
              : active.risk === 'medium'
                ? '近期有中风险标记，可持续观察。'
                : '近期无高风险标记。'}
          </p>
          <button type="button" className="ghost-button" style={{ marginTop: 8 }}>
            在 SQL 助手中继续分析
          </button>
        </aside>
      </div>
    </div>
  )
}
