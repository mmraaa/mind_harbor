import { describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import { adminApi } from './adminApi'

describe('admin API status contract', () => {
  it('loads service status without exposing credentials', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: { services: [{ id: 'llm', status: 'configured', model: 'glm-5' }] },
    } as never)

    const result = await adminApi.getApiStatus()

    expect(get).toHaveBeenCalledWith('/admin/api-status')
    expect(result.services[0].model).toBe('glm-5')
    get.mockRestore()
  })
})
