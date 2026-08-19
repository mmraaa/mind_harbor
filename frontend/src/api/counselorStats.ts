import { api } from './client'

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

export type EmotionTrendPoint = {
  date: string
  avg_intensity: number | null
  count: number
  top_category: string | null
}

export type StudentProfile = {
  session_count: number
  journal_count: number
  high_risk_sessions: number
  emotion_count: number
  avg_intensity: number | null
  latest_emotion: string | null
  latest_intensity: number | null
  latest_at: string | null
}

export type StudentSessionIndex = {
  id: number
  title: string
  summary: string
  risk_level: string
  status: string
  started_at: string | null
  message_count: number
}

export type StudentDetail = {
  student: {
    id: number
    name: string
    username: string
    role: string
    created_at: string | null
  }
  profile: StudentProfile
  days: number
  emotion_trend: EmotionTrendPoint[]
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
    content: string
    mood_score: number | null
    created_at: string | null
    stress_source: string | null
    support_need: string | null
  }[]
  sessions: StudentSessionIndex[]
}

export type SessionMessage = {
  id: number
  role: string
  content: string
  emotion_tags: unknown
  tool_cards: unknown
  created_at: string | null
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
  days = 14,
): Promise<StudentDetail> {
  const { data } = await api.get<StudentDetail>(`/counselor/stats/students/${studentId}/detail`, {
    params: { days },
  })
  return data
}

export async function fetchSessionMessages(
  sessionId: number,
): Promise<{ session_id: number; count: number; messages: SessionMessage[] }> {
  const { data } = await api.get(`/counselor/stats/sessions/${sessionId}/messages`)
  return data
}
