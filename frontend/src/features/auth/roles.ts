export const roles = ['student', 'admin', 'counselor'] as const

export type Role = (typeof roles)[number]
export type AuthMode = 'login' | 'register'

export interface RoleMeta {
  label: string
  kicker: string
  title: string
  image: string
}

const roleMeta: Record<Role, RoleMeta> = {
  student: {
    label: '用户',
    kicker: 'STUDENT / 用户入口',
    title: '慢慢来，这里一直在。',
    image: '/images/pet-friends.jpg',
  },
  admin: {
    label: '管理',
    kicker: 'ADMIN / 管理入口',
    title: '让每一次陪伴稳定抵达。',
    image: '/images/mountain.jpg',
  },
  counselor: {
    label: '咨询师',
    kicker: 'COUNSELOR / 咨询师入口',
    title: '把专业的倾听留给需要的人。',
    image: '/images/forest.jpg',
  },
}

export function isRole(value: string | undefined): value is Role {
  return roles.includes(value as Role)
}

export function getRoleMeta(role: Role): RoleMeta {
  return roleMeta[role]
}
