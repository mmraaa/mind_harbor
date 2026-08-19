import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthPage } from './AuthPage'

describe('AuthPage', () => {
  it('clears entered credentials when the selected role changes', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/student/register']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/auth/:role/:mode" element={<AuthPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '小林' } })
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'xiaolin' } })
    fireEvent.change(screen.getByLabelText('密码', { exact: true }), { target: { value: 'correct-horse' } })
    fireEvent.click(screen.getByRole('button', { name: '管理' }))

    await waitFor(() => expect(screen.getByText(/当前以/).textContent).toContain('管理'))
    expect((screen.getByLabelText('昵称') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('账号') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('密码', { exact: true }) as HTMLInputElement).value).toBe('')
  })
})
