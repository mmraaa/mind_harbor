import { BookOpenText, Shield, Users } from 'lucide-react'
import { WorkspaceShell } from '../../components/layout/WorkspaceShell'

const NAV = [
  { label: '咨询师管理', shortLabel: '咨询师', path: '/admin/counselors', icon: Shield },
  { label: '学生账号', shortLabel: '学生', path: '/admin/students', icon: Users },
  { label: '心理资源', shortLabel: '资源', path: '/admin/resources', icon: BookOpenText },
]

export default function AdminLayout() {
  return (
    <WorkspaceShell brandTo="/admin/counselors" nav={NAV} roleNote="管理端 · 数据维护" />
  )
}
