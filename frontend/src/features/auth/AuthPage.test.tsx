import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthPage } from './AuthPage'

describe('AuthPage', () => {
  it('shows unified login without role switch', () => {
    render(
      <MemoryRouter initialEntries={['/auth/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/auth/:mode" element={<AuthPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '回到为你留着的位置' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '管理' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
  })

  it('shows student-only register form', () => {
    render(
      <MemoryRouter initialEntries={['/auth/register']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/auth/:mode" element={<AuthPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '把这份陪伴带回身边' })).toBeInTheDocument()
    expect(screen.getByLabelText('昵称')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建用户账号' })).toBeInTheDocument()
  })
})
