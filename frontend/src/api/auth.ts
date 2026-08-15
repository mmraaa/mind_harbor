import { api, type TokenResponse, type UserOut } from './client'

export async function login(username: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/login', { username, password })
  return data
}

export async function register(
  username: string,
  password: string,
  name = '',
): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/register', { username, password, name })
  return data
}

export async function fetchMe(): Promise<UserOut> {
  const { data } = await api.get<UserOut>('/auth/me')
  return data
}
