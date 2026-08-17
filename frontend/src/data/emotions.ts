/** 与后端情绪枚举对齐 */
export const EMOTION_META: Record<
  string,
  { label: string; emoji: string }
> = {
  anxious: { label: '焦虑', emoji: '😰' },
  sad: { label: '难过', emoji: '😢' },
  angry: { label: '生气', emoji: '😤' },
  lonely: { label: '孤独', emoji: '🌙' },
  tired: { label: '疲惫', emoji: '😴' },
  calm: { label: '平静', emoji: '🍃' },
  hopeful: { label: '希望', emoji: '✨' },
}

export function emotionDisplay(category?: string | null) {
  if (!category) return { label: '未标注', emoji: '📝' }
  const key = category.toLowerCase()
  return EMOTION_META[key] ?? { label: category, emoji: '📝' }
}
