import { authApi } from '../features/auth/authApi'
import type { Role } from '../features/auth/roles'
import { api, type TokenResponse, type UserOut } from './client'

function toTeamUser(user: { id: number; username: string; nickname: string; role: Role; display_username?: string }): UserOut {
  return {
    id: user.id,
    username: user.username,
    name: user.nickname,
    role: user.role,
    display_username: user.display_username || user.nickname,
    gender: '',
  }
}

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const response = await authApi.login({ username, password, role: 'student' })
  return {
    access_token: response.access_token,
    token_type: response.token_type,
    user: toTeamUser(response.user),
  }
}

export async function register(
  username: string,
  password: string,
  name = '',
): Promise<TokenResponse> {
  const response = await authApi.register({
    username,
    password,
    nickname: name,
    role: 'student',
  })
  return {
    access_token: response.access_token,
    token_type: response.token_type,
    user: toTeamUser(response.user),
  }
}

export async function fetchMe(): Promise<UserOut> {
  const { data } = await api.get<UserOut>('/auth/me')
  return data
}
