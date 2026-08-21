export const roles = ['student', 'admin', 'counselor'] as const

export type Role = (typeof roles)[number]
export type AuthMode = 'login' | 'register'

/** 登录/注册页统一视觉（不再按角色切换入口文案） */
export const authVisual = {
  kicker: 'STUDENT / 用户入口',
  title: '慢慢来，这里一直在。',
  image: '/images/pet-friends.jpg',
} as const

export function isRole(value: string | undefined): value is Role {
  return roles.includes(value as Role)
}
