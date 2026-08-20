import { Grid3X3, MapPin, MoonStar, Wind, type LucideIcon } from 'lucide-react'

export type PracticeId = 'breathing' | 'sleep' | 'grounding' | 'schulte'
export type PracticeCategory = 'breath' | 'sleep' | 'grounding' | 'focus'
export type PracticeTone = 'sage' | 'clay' | 'night'
export type PracticeModalLayout = 'immersive' | 'guided' | 'panel'

export type PracticeMeta = {
  id: PracticeId
  title: string
  tag: string
  duration: string
  durationMinutes: number
  difficulty: '轻' | '中'
  description: string
  bestFor: string
  featured?: boolean
  tone: PracticeTone
  category: PracticeCategory
  icon: LucideIcon
  modalLayout: PracticeModalLayout
}

export const PRACTICE_CATALOG: PracticeMeta[] = [
  {
    id: 'breathing',
    title: '478 呼吸',
    tag: '舒缓呼吸',
    duration: '约 2–3 分钟',
    durationMinutes: 3,
    difficulty: '轻',
    description: '用更长的呼气告诉身体：此刻可以慢一点。',
    bestFor: '考试前、心跳快、需要快速安静下来',
    featured: true,
    tone: 'sage',
    category: 'breath',
    icon: Wind,
    modalLayout: 'immersive',
  },
  {
    id: 'sleep',
    title: '睡前放松',
    tag: '睡眠友好',
    duration: '约 12 分钟',
    durationMinutes: 12,
    difficulty: '轻',
    description: '目标不是命令自己立刻睡着，而是让白天逐渐退场。',
    bestFor: '准备入睡、躺下后脑子停不下来',
    tone: 'night',
    category: 'sleep',
    icon: MoonStar,
    modalLayout: 'guided',
  },
  {
    id: 'grounding',
    title: '5-4-3-2-1 感官着陆',
    tag: '稳定此刻',
    duration: '约 5 分钟',
    durationMinutes: 5,
    difficulty: '轻',
    description: '把注意力从纷乱想法带回此刻可观察的具体事物。',
    bestFor: '脑子很乱、情绪上来时需要落地',
    tone: 'clay',
    category: 'grounding',
    icon: MapPin,
    modalLayout: 'guided',
  },
  {
    id: 'schulte',
    title: '舒尔特方格',
    tag: '专注训练',
    duration: '约 3 分钟',
    durationMinutes: 3,
    difficulty: '中',
    description: '按顺序寻找 1 到 25，在轻量挑战中练习视觉搜索和持续注意。',
    bestFor: '走神、注意力散开、想重新聚焦',
    tone: 'sage',
    category: 'focus',
    icon: Grid3X3,
    modalLayout: 'panel',
  },
]
