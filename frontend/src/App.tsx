import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import StudentLayout from './layouts/StudentLayout'
import RequireAuth from './router/RequireAuth'
import Chat from './pages/student/Chat'
import Journal from './pages/student/Journal'
import JournalDetail from './pages/student/JournalDetail'
import FavoritesHistory from './pages/student/FavoritesHistory'
import Profile from './pages/student/Profile'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/student/chat" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/student"
        element={
          <RequireAuth>
            <StudentLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="chat" replace />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:sessionId" element={<Chat />} />
        <Route path="journal" element={<Journal />} />
        <Route path="journal/:id" element={<JournalDetail />} />
        <Route path="favorites" element={<FavoritesHistory />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/student/chat" replace />} />
    </Routes>
  )
}
