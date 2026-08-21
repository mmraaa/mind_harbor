import { describe, expect, it } from 'vitest'

import { authVisual, isRole } from './roles'

describe('role helpers', () => {
  it('exposes shared auth visual copy', () => {
    expect(authVisual.title).toBe('慢慢来，这里一直在。')
    expect(authVisual.image).toBe('/images/pet-friends.jpg')
  })

  it('rejects unknown roles', () => {
    expect(isRole('student')).toBe(true)
    expect(isRole('admin')).toBe(true)
    expect(isRole('counselor')).toBe(true)
    expect(isRole('visitor')).toBe(false)
  })
})
