import { Routes, Route, Navigate } from 'react-router-dom'

/**
 * 三角色前端入口(学生 / 管理 / 咨询师)。
 * 角色路由在 src/router 中细化,此处仅搭骨架。
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<div>登录页(待实现)</div>} />
      <Route path="*" element={<div>404</div>} />
    </Routes>
  )
}
