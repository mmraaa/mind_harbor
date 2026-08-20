import { describe, expect, it } from 'vitest'

import { getRoleMeta, isRole } from './roles'

describe('role routing', () => {
  it('maps each database role to its Chinese display name', () => {
    expect(getRoleMeta('student').label).toBe('用户')
    expect(getRoleMeta('admin').label).toBe('管理')
    expect(getRoleMeta('counselor').label).toBe('咨询师')
  })

  it('rejects unknown roles', () => {
    expect(isRole('student')).toBe(true)
    expect(isRole('visitor')).toBe(false)
  })
})
