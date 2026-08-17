/** 与 backend `generate_breathing` 对齐；前端仅展示 478 呼吸。 */

export type BreathPhase = {
  label: string
  seconds: number
  motion: 'expand' | 'hold' | 'contract'
}

export type BreathingExercise = {
  id: '478'
  name: string
  tagline: string
  durationHint: string
  steps: string[]
  cycle: BreathPhase[]
}

export const BREATHING_478: BreathingExercise = {
  id: '478',
  name: '478 呼吸',
  tagline: '考试前、入睡前，用慢呼气把心跳拉回来。',
  durationHint: '约 2–3 分钟 · 4 组',
  steps: [
    '找一个舒适的姿势，放松肩膀',
    '用鼻子慢慢吸气，默数 4 秒',
    '屏住呼吸，默数 7 秒',
    '用嘴缓缓呼气，默数 8 秒',
    '重复 4 组，感受身体的放松',
  ],
  cycle: [
    { label: '吸气', seconds: 4, motion: 'expand' },
    { label: '屏息', seconds: 7, motion: 'hold' },
    { label: '呼气', seconds: 8, motion: 'contract' },
  ],
}

/** @deprecated 仅保留 478，兼容旧引用 */
export const BREATHING_EXERCISES = [BREATHING_478] as const

export function getBreathingExercise(_id?: string | null): BreathingExercise {
  return BREATHING_478
}
