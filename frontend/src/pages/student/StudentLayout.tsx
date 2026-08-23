import { Bell, BookHeart, BookMarked, History, House, Leaf, UserRound } from 'lucide-react'
import { WorkspaceShell } from '../../components/layout/WorkspaceShell'

const NAV = [
  { label: '今日陪伴', shortLabel: '陪伴', path: '/student', icon: House, end: true },
  { label: '情绪日记', shortLabel: '日记', path: '/student/journals', icon: BookHeart },
  { label: '我的提醒', shortLabel: '提醒', path: '/student/reminders', icon: Bell },
  { label: '放松练习', shortLabel: '练习', path: '/student/practice', icon: Leaf },
  { label: '收藏回复', shortLabel: '收藏', path: '/student/favorites', icon: BookMarked },
  { label: '历史会话', shortLabel: '历史', path: '/student/history', icon: History },
  { label: '我的画像', shortLabel: '画像', path: '/student/profile', icon: UserRound },
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
