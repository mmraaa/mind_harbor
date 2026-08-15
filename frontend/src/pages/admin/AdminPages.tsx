import { Info } from 'lucide-react'

type Row = {
  name: string
  meta: string
  status: string
}

function AdminCrudPage({
  eyebrow,
  title,
  description,
  boundary,
  columns,
  rows,
  actionLabel,
}: {
  eyebrow: string
  title: string
  description: string
  boundary: string
  columns: [string, string, string]
  rows: Row[]
  actionLabel: string
}) {
  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="page-header__description">{description}</p>
        </div>
      </header>

      <div className="admin-boundary">
        <Info size={18} aria-hidden />
        <div>
          <strong>权限边界</strong>
          <p>{boundary}</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="search">
          <label className="field-label" htmlFor={`search-${title}`}>
            搜索
          </label>
          <input id={`search-${title}`} className="text-input" placeholder="按姓名 / 关键词检索…" />
        </div>
        <button type="button" className="primary-button">
          {actionLabel}
        </button>
      </div>

      <section className="admin-panel">
        <div className="admin-panel__head">
          <h2>列表</h2>
          <span className="chip">{rows.length} 条</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.meta}</td>
                  <td>
                    <span className="chip">{row.status}</span>
                  </td>
                  <td>
                    <button type="button" className="ghost-button">
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function CounselorsAdminPage() {
  return (
    <AdminCrudPage
      eyebrow="ADMIN"
      title="咨询师管理"
      description="维护咨询师资料、专长领域与可预约信息。"
      boundary="管理端仅做 CRUD 数据维护，不查看学生心理内容。"
      columns={['姓名', '专长', '状态']}
      actionLabel="新增咨询师"
      rows={[
        { name: '林晓', meta: '学业压力 / 睡眠', status: '可预约' },
        { name: '周衡', meta: '情绪调节 / 人际关系', status: '可预约' },
        { name: '陈沐', meta: '危机干预协作', status: '暂停' },
      ]}
    />
  )
}

export function StudentsAdminPage() {
  return (
    <AdminCrudPage
      eyebrow="ADMIN"
      title="学生用户管理"
      description="学生账号检索与风险标记维护。"
      boundary="心理日记与情绪趋势归咨询师端查看；此处仅账号与标记。"
      columns={['学号/账号', '风险标记', '状态']}
      actionLabel="新增学生"
      rows={[
        { name: '20240101 · 阿南', meta: 'low', status: '正常' },
        { name: '20240118 · 小禾', meta: 'medium', status: '关注' },
        { name: '20240202 · 阿舟', meta: 'high', status: '置顶质检' },
      ]}
    />
  )
}

export function ResourcesAdminPage() {
  return (
    <AdminCrudPage
      eyebrow="ADMIN"
      title="心理资源管理"
      description="录入与上下架心理科普、练习与校园服务资源。"
      boundary="资源卡片供 Agent 推荐与知识引用；上下架即时生效。"
      columns={['标题', '类型', '状态']}
      actionLabel="新增资源"
      rows={[
        { name: '考试焦虑自助清单', meta: '科普', status: '已上架' },
        { name: '4-2-6 呼吸引导', meta: '练习', status: '已上架' },
        { name: '学生发展中心预约须知', meta: '校园流程', status: '草稿' },
      ]}
    />
  )
}
