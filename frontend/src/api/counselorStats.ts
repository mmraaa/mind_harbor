import { api } from './client'

export type StatsOverview = {
  days: number
  students: number
  sessions: number
  active_sessions: number
  closed_sessions: number
  high_risk_sessions: number
  journals: number
  emotions_in_window: number
  avg_intensity: number | null
}

export type EmotionDistItem = {
  category: string
  count: number
  pct: number
}

export type EmotionDistribution = {
  days: number
  total: number
  distribution: EmotionDistItem[]
}

export type StudentSummary = {
  id: number
  name: string
  username: string
  emotion_count: number
  avg_intensity: number | null
  latest_emotion: string | null
  latest_intensity: number | null
  latest_at: string | null
  high_risk_sessions: number
}

export type StudentDetail = {
  student: { id: number; name: string; username: string; created_at: string | null }
  emotion_series: {
    id: number
    category: string
    intensity: number
    stress_source: string | null
    created_at: string | null
  }[]
  journals: {
    id: number
    summary: string
    mood_score: number | null
    created_at: string | null
  }[]
  sessions: {
    id: number
    title: string
    risk_level: string
    status: string
    started_at: string | null
  }[]
}

export type SessionQA = {
  id: number
  student_id: number
  student_name: string
  student_username: string
  title: string
  risk_level: string
  status: string
  started_at: string | null
  message_count: number
}

export async function fetchOverview(days = 30): Promise<StatsOverview> {
  const { data } = await api.get<StatsOverview>('/counselor/stats/overview', { params: { days } })
  return data
}

export async function fetchEmotionDistribution(
  days = 30,
  studentId?: number,
): Promise<EmotionDistribution> {
  const { data } = await api.get<EmotionDistribution>('/counselor/stats/emotion-distribution', {
    params: { days, ...(studentId ? { student_id: studentId } : {}) },
  })
  return data
}

export async function fetchStudents(
  opts: { keyword?: string; risk?: string; days?: number } = {},
): Promise<{ count: number; students: StudentSummary[] }> {
  const { data } = await api.get('/counselor/stats/students', { params: opts })
  return data
}

export async function fetchStudentDetail(
  studentId: number,
  days = 30,
): Promise<StudentDetail> {
  const { data } = await api.get<StudentDetail>(`/counselor/stats/students/${studentId}/detail`, {
    params: { days },
  })
  return data
}

export async function fetchSessions(
  opts: { risk?: string; days?: number } = {},
): Promise<{ count: number; sessions: SessionQA[] }> {
  const { data } = await api.get('/counselor/stats/sessions', { params: opts })
  return data
}
