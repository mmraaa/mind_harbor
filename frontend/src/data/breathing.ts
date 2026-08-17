/** 与 backend `generate_breathing` 内置模板对齐 */

export type BreathPhase = {
  label: string
  /** seconds; 0 = 无固定时长，仅展示引导 */
  seconds: number
  /** orb scale cue: expand | hold | contract */
  motion: 'expand' | 'hold' | 'contract'
}

export type BreathingExercise = {
  id: '478' | 'box' | 'count'
  name: string
  tagline: string
  durationHint: string
  steps: string[]
  /** timed cycle for the practice stage; empty = step-only guide */
  cycle: BreathPhase[]
}

export const BREATHING_EXERCISES: BreathingExercise[] = [
  {
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
  },
  {
    id: 'box',
    name: '四方呼吸',
    tagline: '想象沿着正方形的边走一圈，节奏均匀。',
    durationHint: '约 2 分钟 · 5 组',
    steps: [
      '吸气 4 秒 → 屏息 4 秒 → 呼气 4 秒 → 屏息 4 秒',
      '想象沿着正方形的边依次进行',
      '重复 5 组',
    ],
    cycle: [
      { label: '吸气', seconds: 4, motion: 'expand' },
      { label: '屏息', seconds: 4, motion: 'hold' },
      { label: '呼气', seconds: 4, motion: 'contract' },
      { label: '屏息', seconds: 4, motion: 'hold' },
    ],
  },
  {
    id: 'count',
    name: '数息练习',
    tagline: '走神了就温柔回到 1，不评判自己。',
    durationHint: '约 3–5 分钟',
    steps: [
      '闭眼，自然呼吸',
      '每次呼气时默数：1、2、3……数到 10',
      '走神了就温柔地回到 1 重新开始',
      '持续 3–5 分钟',
    ],
    cycle: [],
  },
]

export function getBreathingExercise(id: string | undefined | null): BreathingExercise {
  return BREATHING_EXERCISES.find((e) => e.id === id) ?? BREATHING_EXERCISES[0]
}
