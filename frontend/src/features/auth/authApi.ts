import axios from 'axios'
import { api } from '../../api/client'
import type { AuthResponse, LoginPayload, RegisterPayload } from './authTypes'
import type { Role } from './roles'

type JsonRecord = Record<string, unknown>

const roleAliases: Record<string, Role> = {
  student: 'student',
  user: 'student',
  normal_user: 'student',
  admin: 'admin',
  counselor: 'counselor',
  consultant: 'counselor',
  adviser: 'counselor',
}

export class AuthContractError extends Error {
  constructor(message = '登录接口返回格式无法识别。') {
    super(message)
    this.name = 'AuthContractError'
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
}

function firstRecord(...values: unknown[]): JsonRecord | undefined {
  return values.find(isRecord)
}

function normalizeRole(value: unknown, fallback: Role): Role {
  if (typeof value !== 'string') return fallback
  return roleAliases[value.trim().toLowerCase()] ?? fallback
}

function normalizeId(value: unknown): number {
  const id = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(id) ? id : 0
}

function payloadRecord(raw: unknown): JsonRecord {
  if (!isRecord(raw)) throw new AuthContractError()
  return firstRecord(raw.data) ?? raw
}

export function normalizeAuthResponse(
  raw: unknown,
  fallbackRole: Role,
  fallbackUsername: string,
): AuthResponse {
  const payload = payloadRecord(raw)
  const user = firstRecord(payload.user, payload.user_info, payload.userInfo, payload.account) ?? payload
  const accessToken = firstString(payload.access_token, payload.accessToken, payload.token)
  if (!accessToken) throw new AuthContractError()

  return {
    access_token: accessToken,
    token_type: 'bearer',
    user: {
      id: normalizeId(user.id ?? user.user_id ?? user.userId),
      nickname: firstString(user.nickname, user.nickName, user.name, user.display_name) ?? fallbackUsername,
      username: firstString(user.username, user.user_name, user.userName, user.account) ?? fallbackUsername,
      role: normalizeRole(user.role ?? user.user_role ?? user.userRole, fallbackRole),
    },
  }
}

export function toTeamLoginRequest(payload: LoginPayload): { username: string; password: string } {
  return { username: payload.username, password: payload.password }
}

export function toTeamRegisterRequest(payload: RegisterPayload): {
  username: string
  password: string
  name: string
} {
  if (payload.role !== 'student') {
    throw new AuthContractError('管理端和咨询师端账号由管理员创建。')
  }
  return { username: payload.username, password: payload.password, name: payload.nickname }
}

function findErrorMessage(value: unknown, depth = 0): string | undefined {
  if (depth > 2 || value === null || value === undefined) return undefined
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const messages = value.map((item) => findErrorMessage(item, depth + 1)).filter(Boolean)
    return messages.length > 0 ? messages.join('；') : undefined
  }
  if (!isRecord(value)) return undefined
  for (const key of ['detail', 'message', 'msg', 'error']) {
    const message = findErrorMessage(value[key], depth + 1)
    if (message) return message
  }
  return undefined
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', toTeamLoginRequest(payload))
    return normalizeAuthResponse(response.data, payload.role, payload.username)
  },
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const response = await api.post('/auth/register', toTeamRegisterRequest(payload))
    return normalizeAuthResponse(response.data, 'student', payload.username)
  },
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof AuthContractError) return error.message
  if (axios.isAxiosError(error) || (isRecord(error) && error.isAxiosError === true)) {
    const response = isRecord(error) ? error.response : undefined
    const message = findErrorMessage(isRecord(response) ? response.data ?? response : response)
    return message ?? '服务暂时不可用，请稍后重试。'
  }
  return error instanceof Error ? error.message : '网络连接失败，请检查服务后重试。'
}
