import { describe, expect, it } from 'vitest'

import { getAuthPath, getRoleMeta, isRole } from './roles'

describe('role routing', () => {
  it('maps each database role to its Chinese display name', () => {
    expect(getRoleMeta('student').label).toBe('用户')
    expect(getRoleMeta('admin').label).toBe('管理')
    expect(getRoleMeta('counselor').label).toBe('咨询师')
  })

  it('creates deterministic auth paths and rejects unknown roles', () => {
    expect(getAuthPath('counselor', 'register')).toBe('/auth/counselor/register')
    expect(isRole('student')).toBe(true)
    expect(isRole('visitor')).toBe(false)
  })
})
