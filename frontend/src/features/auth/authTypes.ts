import type { Role } from './roles'

export interface AuthUser {
  id: number
  nickname: string
  username: string
  display_username?: string
  role: Role
}

export interface AuthResponse {
  access_token: string
  token_type: 'bearer'
  user: AuthUser
}

export interface LoginPayload {
  username: string
  password: string
  role: Role
}

export interface RegisterPayload extends LoginPayload {
  nickname: string
}
