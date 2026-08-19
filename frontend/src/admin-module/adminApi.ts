import { api } from '../api/client'
import type {
  Counselor,
  CounselorCreatePayload,
  CounselorUpdatePayload,
  Resource,
  ResourcePayload,
  ResourceUpdatePayload,
  Student,
  StudentUpdatePayload,
  AdminOverview,
  AdminApiStatus,
  AdminApiConfig,
  AdminApiConfigUpdate,
} from './adminTypes'

type Collection<T> = { total: number; items: T[] }

export const adminApi = {
  async getOverview(): Promise<AdminOverview> {
    const { data } = await api.get<AdminOverview>('/admin/overview')
    return data
  },
  async getApiStatus(): Promise<AdminApiStatus> {
    const { data } = await api.get<AdminApiStatus>('/admin/api-status')
    return data
  },
  async listApiConfigs(): Promise<AdminApiConfig[]> {
    const { data } = await api.get<{ services: AdminApiConfig[] }>('/admin/api-configs')
    return data.services
  },
  async updateApiConfig(serviceId: string, payload: AdminApiConfigUpdate): Promise<AdminApiConfig> {
    const { data } = await api.patch<AdminApiConfig>(`/admin/api-configs/${serviceId}`, payload)
    return data
  },
  async testApiConfig(serviceId: string): Promise<{ service_id: string; status: 'reachable' | 'unreachable' }> {
    const { data } = await api.post<{ service_id: string; status: 'reachable' | 'unreachable' }>(`/admin/api-configs/${serviceId}/test`)
    return data
  },
  async listCounselors(keyword = ''): Promise<Collection<Counselor>> {
    const { data } = await api.get<Collection<Counselor>>('/admin/counselors', { params: { keyword } })
    return data
  },
  async createCounselor(payload: CounselorCreatePayload): Promise<Counselor> {
    const { data } = await api.post<Counselor>('/admin/counselors', payload)
    return data
  },
  async updateCounselor(userId: number, payload: CounselorUpdatePayload): Promise<Counselor> {
    const { data } = await api.patch<Counselor>(`/admin/counselors/${userId}`, payload)
    return data
  },
  async listStudents(keyword = ''): Promise<Collection<Student>> {
    const { data } = await api.get<Collection<Student>>('/admin/students', { params: { keyword } })
    return data
  },
  async updateStudent(userId: number, payload: StudentUpdatePayload): Promise<Student> {
    const { data } = await api.patch<Student>(`/admin/students/${userId}`, payload)
    return data
  },
  async listResources(keyword = ''): Promise<Collection<Resource>> {
    const { data } = await api.get<Collection<Resource>>('/admin/resources', { params: { keyword } })
    return data
  },
  async createResource(payload: ResourcePayload): Promise<Resource> {
    const { data } = await api.post<Resource>('/admin/resources', payload)
    return data
  },
  async updateResource(id: number, payload: ResourceUpdatePayload): Promise<Resource> {
    const { data } = await api.patch<Resource>(`/admin/resources/${id}`, payload)
    return data
  },
  async deleteResource(id: number): Promise<void> {
    await api.delete(`/admin/resources/${id}`)
  },
}
