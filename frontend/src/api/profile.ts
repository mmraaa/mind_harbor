import { api } from './client'

export type ProfileTrait = {
  label: string
  value: string
  option: string
  source: string
  confidence: number
  score?: number
  level?: string
  description?: string
}

export type ProfileObservation = {
  trait_key: string
  value: string
  status: string
  evidence_count: number
  confidence: number
}

export type ProfileSnapshot = {
  id: number
  version: number
  source: string
  summary: string
  traits: Record<string, ProfileTrait>
  big_five?: Record<string, { label: string; score: number; level: string; description: string }>
  observations: ProfileObservation[]
  overall_analysis?: string
  thinking_decision?: string
  learning_style?: string
  strengths_blind_spots?: string
  interests?: string
  career_directions?: string
  work_environment?: string
  growth_focus?: string
  evidence_count?: number
  confidence?: number
  generated_at?: string
  model_version?: string
  questionnaire_version?: string
  questionnaire_answers?: Record<string, string>
  created_at: string | null
}

export type ProfileResponse = {
  enabled: boolean
  questionnaire_completed: boolean
  test_completed?: boolean
  items?: Array<{ key: string; value: string; label: string; source: string; status: string }>
  consented_at: string | null
  revoked_at: string | null
  last_self_edit_at: string | null
  next_self_edit_at: string | null
  snapshot: ProfileSnapshot | null
}

export type ProfileQuestion = {
  id: string
  dimension: string
  label: string
  prompt: string
  reverse: boolean
  options: Array<[string, string]>
}

export const BIG_FIVE_QUESTIONNAIRE_VERSION = 'big-five-cn-v1'

const SCALE = [
  ['1', '非常不像我'], ['2', '不太像我'], ['3', '不确定'], ['4', '比较像我'], ['5', '非常像我'],
] as Array<[string, string]>

function question(id: string, dimension: string, label: string, prompt: string, reverse = false): ProfileQuestion {
  return { id, dimension, label, prompt, reverse, options: SCALE }
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  question('openness_1', 'openness', '开放性', '我喜欢接触与平时不同的新观点。'), question('openness_2', 'openness', '开放性', '我常常会对一个问题展开丰富的想象。'), question('openness_3', 'openness', '开放性', '我愿意尝试新的兴趣、活动或表达方式。'),
  question('openness_4', 'openness', '开放性', '我更喜欢熟悉的做法，不太愿意改变。', true), question('openness_5', 'openness', '开放性', '遇到复杂问题时，我通常不会去了解背后的不同可能。', true), question('openness_6', 'openness', '开放性', '我很少被艺术、故事或新鲜事物吸引。', true),
  question('conscientiousness_1', 'conscientiousness', '尽责性', '我会提前安排重要的任务和时间。'), question('conscientiousness_2', 'conscientiousness', '尽责性', '我答应别人的事情通常会尽力做到。'), question('conscientiousness_3', 'conscientiousness', '尽责性', '我会把大目标拆成下一步可以执行的小行动。'),
  question('conscientiousness_4', 'conscientiousness', '尽责性', '我经常拖到最后一刻才开始处理重要事情。', true), question('conscientiousness_5', 'conscientiousness', '尽责性', '计划被打乱后，我很难重新整理节奏。', true), question('conscientiousness_6', 'conscientiousness', '尽责性', '我常常忽略已经答应或需要完成的事情。', true),
  question('extraversion_1', 'extraversion', '外向性', '和熟悉的人交流通常会让我恢复能量。'), question('extraversion_2', 'extraversion', '外向性', '我愿意主动认识新的人或加入集体活动。'), question('extraversion_3', 'extraversion', '外向性', '我通常能比较自然地表达自己的想法。'),
  question('extraversion_4', 'extraversion', '外向性', '在人多的场合，我往往只想尽快离开。', true), question('extraversion_5', 'extraversion', '外向性', '我很少主动发起聊天或邀请别人一起做事。', true), question('extraversion_6', 'extraversion', '外向性', '即使有想法，我也经常选择保持沉默。', true),
  question('agreeableness_1', 'agreeableness', '宜人性', '我会认真考虑别人的感受，再表达不同意见。'), question('agreeableness_2', 'agreeableness', '宜人性', '看到身边的人需要帮助时，我愿意提供支持。'), question('agreeableness_3', 'agreeableness', '宜人性', '发生冲突时，我愿意寻找双方都能接受的办法。'),
  question('agreeableness_4', 'agreeableness', '宜人性', '我通常不在意别人的感受，只要事情按我的想法进行。', true), question('agreeableness_5', 'agreeableness', '宜人性', '我很难相信别人是出于善意。', true), question('agreeableness_6', 'agreeableness', '宜人性', '当别人犯错时，我容易先责备而不是先了解原因。', true),
  question('emotional_sensitivity_1', 'emotional_sensitivity', '情绪敏感度', '我能敏锐察觉到自己的情绪变化。'), question('emotional_sensitivity_2', 'emotional_sensitivity', '情绪敏感度', '压力大时，身体或情绪的反应会比较明显。'), question('emotional_sensitivity_3', 'emotional_sensitivity', '情绪敏感度', '别人的评价有时会在我心里停留很久。'),
  question('emotional_sensitivity_4', 'emotional_sensitivity', '情绪敏感度', '遇到压力时，我通常很快就能恢复平静。', true), question('emotional_sensitivity_5', 'emotional_sensitivity', '情绪敏感度', '即使发生不顺利的事情，我也很少反复担心。', true), question('emotional_sensitivity_6', 'emotional_sensitivity', '情绪敏感度', '我的情绪通常不会影响学习、工作或生活安排。', true),
]

// 旧客户端契约继续导出，便于旧后端回退。
export const QUESTIONNAIRE = {
  support_style: { label: '当你难受时，更希望助手怎样陪你？', options: [['listen_first', '先听我说，再一起想办法'], ['direct_steps', '直接给我可执行的小步骤'], ['knowledge', '先解释原理和相关信息']] },
  coping_style: { label: '什么方式通常更容易让你慢慢稳定下来？', options: [['small_steps', '把事情拆成很小的步骤'], ['body_practice', '呼吸、感官或身体练习'], ['writing', '写下来，慢慢整理']] },
  social_support: { label: '需要支持时，你更倾向于？', options: [['trusted_person', '联系一位信任的人'], ['solo_first', '先自己安静一会儿'], ['professional', '寻求专业支持']] },
} as const

export type ProfileAnswers = Record<string, string>
type LegacyProfileItem = { key?: string; value?: string; label?: string; source?: string; status?: string }
type LegacyProfileResponse = { enabled?: boolean; test_completed?: boolean; items?: LegacyProfileItem[]; next_manual_edit_at?: string | null }

export function profileErrorMessage(value: unknown): string {
  const message = typeof value === 'string' ? value.trim() : ''
  return /^not found$/i.test(message) ? '当前后端尚未提供画像接口，请重启或更新本地后端服务' : message || '画像暂时无法加载'
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('response' in error)) return false
  return (error as { response?: { status?: unknown } }).response?.status === 404
}

function fromLegacyProfile(data: LegacyProfileResponse): ProfileResponse {
  const items = Array.isArray(data.items) ? data.items : []
  const traits = Object.fromEntries(items.filter((item): item is Required<Pick<LegacyProfileItem, 'key'>> & LegacyProfileItem => Boolean(item.key)).map((item) => [item.key, { label: item.label || item.key, value: item.label || item.value || '', option: item.value || '', source: item.source || 'test', confidence: 0.6 }]))
  const completed = Boolean(data.test_completed || items.length)
  return { enabled: Boolean(data.enabled), questionnaire_completed: completed, test_completed: completed, items: [], consented_at: null, revoked_at: null, last_self_edit_at: null, next_self_edit_at: data.next_manual_edit_at || null, snapshot: completed ? { id: 0, version: 1, source: 'test', summary: '这份记录来自现有陪伴偏好问卷，用于帮助助手调整回应方式。', traits, observations: [], overall_analysis: '暂不判断：当前后端只提供旧画像数据。', career_directions: '暂不判断：完成新版问卷后再探索。', created_at: null } : null }
}

export async function getMyProfile(): Promise<ProfileResponse> {
  try { const { data } = await api.get<ProfileResponse>('/profile/mine'); return data }
  catch (error) { if (!isNotFound(error)) throw error; const { data } = await api.get<LegacyProfileResponse>('/profile'); return fromLegacyProfile(data) }
}

export async function setProfileConsent(enabled: boolean): Promise<ProfileResponse> {
  const { data } = await api.post<ProfileResponse>('/profile/consent', { enabled }); return data
}

function legacyAnswers(answers: ProfileAnswers) {
  const direct = answers.support_style === 'direct_steps'; const writing = answers.coping_style === 'writing'; const body = answers.coping_style === 'body_practice'
  return { q1: direct ? 'actionable_steps' : 'listening_first', q2: direct ? 'actionable_steps' : 'listening_first', q3: direct ? 'actionable_steps' : 'listening_first', q4: writing ? 'structured_reflection' : 'gentle_reflection', q5: writing ? 'structured_reflection' : 'gentle_reflection', q6: body ? 'guided_practice' : 'structured_reflection', q7: body ? 'guided_practice' : 'gentle_reflection', q8: writing ? 'structured_reflection' : 'gentle_reflection' }
}

export async function submitProfileQuestionnaire(answers: ProfileAnswers): Promise<ProfileResponse> {
  try { const { data } = await api.post<ProfileResponse>('/profile/questionnaire', { answers }); return data }
  catch (error) { if (!isNotFound(error)) throw error; const { data } = await api.post<LegacyProfileResponse>('/profile/test', { answers: legacyAnswers(answers) }); return fromLegacyProfile(data) }
}

export async function editMyProfile(updates: Partial<ProfileAnswers>): Promise<ProfileResponse> {
  try { const { data } = await api.patch<ProfileResponse>('/profile/self-edit', { updates }); return data }
  catch (error) { if (!isNotFound(error)) throw error; const items = Object.entries(updates).map(([key, value]) => ({ key, value })); const { data } = await api.patch<LegacyProfileResponse>('/profile/manual', { items }); return fromLegacyProfile(data) }
}

export async function deleteMyProfile(): Promise<void> { await api.delete('/profile/mine') }
