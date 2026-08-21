export type Counselor = {
  id: number
  user_id: number
  username: string
  role: 'counselor'
  name: string
  title: string
  specialty: string
  bio: string
  availability: string
  is_enabled: boolean
}

export type Student = {
  id: number
  username: string
  role: 'student'
  name: string
  risk_tags: string[]
  is_enabled: boolean
}

export type Resource = {
  id: number
  title: string
  type: string
  content: string
  url: string | null
  is_active: boolean
}

export type CounselorCreatePayload = {
  username: string
  password: string
  name: string
  title: string
  specialty: string
  bio: string
  availability: string
}

export type CounselorUpdatePayload = Partial<Omit<CounselorCreatePayload, 'username'>> & {
  is_enabled?: boolean
}

export type StudentUpdatePayload = {
  name?: string
  risk_tags?: string[]
  is_enabled?: boolean
}

export type ResourcePayload = {
  title: string
  type: string
  content: string
  url: string
  is_active: boolean
}

export type ResourceUpdatePayload = Partial<ResourcePayload>

export type AdminOverview = {
  students: number
  counselors: number
  resources: number
  active_resources: number
  enabled_accounts: number
  disabled_accounts: number
}

export type AdminApiService = {
  id: string
  label: string
  status: 'reachable' | 'configured' | 'invalid' | 'disabled'
  model: string | null
  base_url: string | null
}

export type AdminApiStatus = {
  services: AdminApiService[]
  lan_sync: {
    status: 'reachable' | 'configured' | 'invalid' | 'disabled'
    host: string | null
    database: string | null
  }
}

export type AdminApiUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  request_count: number
  failure_count: number
  remaining_tokens: number | null
}

export type AdminApiConfig = {
  service_id: string
  label: string
  enabled: boolean
  base_url: string | null
  model: string | null
  api_key_configured: boolean
  api_key_masked: string | null
  context_window: number | null
  max_tokens: number | null
  timeout_seconds: number
  token_budget: number | null
  usage: AdminApiUsage
  fallback: {
    enabled: boolean
    base_url: string | null
    model: string | null
    api_key_configured: boolean
    api_key_masked: string | null
  }
}

export type AdminApiConfigUpdate = {
  enabled?: boolean
  base_url?: string
  model?: string
  api_key?: string
  context_window?: number
  max_tokens?: number
  timeout_seconds?: number
  token_budget?: number
  fallback?: {
    enabled: boolean
    base_url?: string
    model?: string
    api_key?: string
  }
}
