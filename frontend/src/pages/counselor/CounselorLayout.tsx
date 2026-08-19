import { Bot, NotebookPen } from 'lucide-react'
import { WorkspaceShell } from '../../components/layout/WorkspaceShell'

const NAV = [
  { label: 'SQL 助手', shortLabel: '助手', path: '/counselor/agent', icon: Bot, end: true },
  { label: '学生档案', shortLabel: '档案', path: '/counselor/students', icon: NotebookPen },
]

export default function CounselorLayout() {
  return (
    <WorkspaceShell
      brandTo="/counselor/agent"
      nav={NAV}
      roleNote="咨询师端 · 只读档案 + SQL Agent"
    />
  )
}
