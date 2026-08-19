import { describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import { adminApi } from './adminApi'

describe('adminApi', () => {
  it('loads an aggregated operational overview', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { students: 2 } } as never)

    await adminApi.getOverview()

    expect(get).toHaveBeenCalledWith('/admin/overview')
    get.mockRestore()
  })

  it('uses the admin counselor contract', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { total: 0, items: [] } } as never)

    await adminApi.listCounselors('林')

    expect(get).toHaveBeenCalledWith('/admin/counselors', { params: { keyword: '林' } })
    get.mockRestore()
  })

  it('sends student risk tags and account state together', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { id: 7 } } as never)

    await adminApi.updateStudent(7, { risk_tags: ['关注'], is_enabled: false })

    expect(patch).toHaveBeenCalledWith('/admin/students/7', {
      risk_tags: ['关注'],
      is_enabled: false,
    })
    patch.mockRestore()
  })

  it('updates an API service without persisting its secret', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { service_id: 'llm', api_key_configured: true } } as never)
    await adminApi.updateApiConfig('llm', { api_key: 'one-time-secret', max_tokens: 512 })
    expect(patch).toHaveBeenCalledWith('/admin/api-configs/llm', { api_key: 'one-time-secret', max_tokens: 512 })
    patch.mockRestore()
  })
})
