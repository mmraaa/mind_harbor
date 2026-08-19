import { describe, expect, it } from 'vitest'

import { getApiErrorMessage, normalizeAuthResponse } from './authApi'

describe('auth response compatibility', () => {
  it('normalizes a legacy token and nested user response', () => {
    const response = normalizeAuthResponse(
      {
        data: {
          token: 'legacy-token',
          user: { id: '7', name: '小林', username: 'xiaolin', role: 'user' },
        },
      },
      'student',
      'xiaolin',
    )

    expect(response).toEqual({
      access_token: 'legacy-token',
      token_type: 'bearer',
      user: { id: 7, nickname: '小林', username: 'xiaolin', role: 'student' },
    })
  })

  it('uses the selected role when a compatible API only returns a token', () => {
    const response = normalizeAuthResponse({ accessToken: 'token-only' }, 'counselor', 'lin')

    expect(response.access_token).toBe('token-only')
    expect(response.user).toEqual({ id: 0, nickname: 'lin', username: 'lin', role: 'counselor' })
  })

  it('rejects responses without a token instead of navigating as if login succeeded', () => {
    expect(() => normalizeAuthResponse({ data: { user: {} } }, 'student', 'xiaolin')).toThrow(
      '登录接口返回格式无法识别。',
    )
  })

  it('reads common nested API error messages', () => {
    expect(
      getApiErrorMessage({
        response: { data: { error: { message: '账号已存在' } } },
        isAxiosError: true,
      }),
    ).toBe('账号已存在')
  })
})
