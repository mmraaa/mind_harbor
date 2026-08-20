import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthBootstrap, RequireAuth } from './components/auth/RequireAuth'
import { AuthPage } from './features/auth/AuthPage'
import LandingPage from './pages/LandingPage'
import StudentLayout from './pages/student/StudentLayout'
import ChatPage from './pages/student/ChatPage'
import PracticePage from './pages/student/PracticePage'
import FavoritesPage from './pages/student/FavoritesPage'
import HistoryPage from './pages/student/HistoryPage'
import JournalPage, { JournalDetailPage } from './pages/student/JournalPage'
import AdminLayout from './pages/admin/AdminLayout'
import {
  AdminOverviewPage,
  CounselorsAdminPage,
  ResourcesAdminPage,
  StudentsAdminPage,
} from './pages/admin/AdminPages'
import CounselorLayout from './pages/counselor/CounselorLayout'
import {
  SqlAgentPage,
  StudentArchivePage,
} from './pages/counselor/CounselorPages'

/**
 * 对接 docs/openapi.json：
 * auth(login/register/me) · chat(SSE/sessions 分组/messages/end) · journals · favorites
 * 咨询师端 SQL 助手对接 POST /counselor/chat（SSE）；会话质检/档案页仍为原型。
 */
export default function App() {
  return (
    <AuthBootstrap>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Navigate to="/auth/login" replace />} />
        <Route path="/auth/:mode" element={<AuthPage />} />
        {/* 兼容旧路径 /auth/:role/:mode */}
        <Route path="/auth/:role/:mode" element={<AuthPage />} />

        <Route element={<RequireAuth roles={['student']} />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<ChatPage />} />
            <Route path="journals" element={<JournalPage />} />
            <Route path="journals/:id" element={<JournalDetailPage />} />
            <Route path="practice" element={<PracticePage />} />
            <Route path="favorites" element={<FavoritesPage />} />
            <Route path="history" element={<HistoryPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth roles={['admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AdminOverviewPage />} />
            <Route path="counselors" element={<CounselorsAdminPage />} />
            <Route path="students" element={<StudentsAdminPage />} />
            <Route path="resources" element={<ResourcesAdminPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth roles={['counselor']} />}>
          <Route path="/counselor" element={<CounselorLayout />}>
            <Route index element={<Navigate to="agent" replace />} />
            <Route path="agent" element={<SqlAgentPage />} />
            <Route path="students" element={<StudentArchivePage />} />
          </Route>
        </Route>

        <Route
          path="*"
          element={
            <div style={{ padding: '20vh 24px', textAlign: 'center' }}>
              <h1>页面不存在</h1>
              <p style={{ color: 'var(--muted)', margin: '12px 0 20px' }}>回到登录入口再试一次。</p>
              <a className="primary-button" href="/auth/login">
                返回登录
              </a>
            </div>
          }
        />
      </Routes>
    </AuthBootstrap>
  )
}
