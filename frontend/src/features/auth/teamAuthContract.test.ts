import { describe, expect, it } from 'vitest'

import { toTeamLoginRequest, toTeamRegisterRequest } from './authApi'

describe('team auth contract adapter', () => {
  it('omits the UI role from the team login request', () => {
    expect(toTeamLoginRequest({ username: 'student', password: 'student123', role: 'student' })).toEqual({
      username: 'student',
      password: 'student123',
    })
  })

  it('maps nickname to name for student registration', () => {
    expect(
      toTeamRegisterRequest({
        nickname: '小林',
        username: 'xiaolin',
        password: 'student123',
        role: 'student',
      }),
    ).toEqual({ username: 'xiaolin', password: 'student123', name: '小林' })
  })

  it('rejects non-student registration before calling the team API', () => {
    expect(() =>
      toTeamRegisterRequest({
        nickname: '咨询师',
        username: 'counselor',
        password: 'counselor123',
        role: 'counselor',
      }),
    ).toThrow('管理端和咨询师端账号由管理员创建。')
  })
})
