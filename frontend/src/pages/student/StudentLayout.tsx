import { BookHeart, BookMarked, History, House, Leaf } from 'lucide-react'
import { WorkspaceShell } from '../../components/layout/WorkspaceShell'

const NAV = [
  { label: '今日陪伴', shortLabel: '陪伴', path: '/student', icon: House, end: true },
  { label: '情绪日记', shortLabel: '日记', path: '/student/journals', icon: BookHeart },
  { label: '放松练习', shortLabel: '练习', path: '/student/practice', icon: Leaf },
  { label: '收藏回复', shortLabel: '收藏', path: '/student/favorites', icon: BookMarked },
  { label: '历史会话', shortLabel: '历史', path: '/student/history', icon: History },
]

export default function StudentLayout() {
  return (
    <WorkspaceShell
      brandTo="/student"
      nav={NAV}
      roleNote="学生端 · 有边界的 AI 陪伴"
      showEmergencyHelp
    />
  )
}
