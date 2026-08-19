import type { PracticeMeta, PracticeMood } from '../../data/practiceCatalog'

type Props = {
  mood: PracticeMood | null
  featured: PracticeMeta
  onPickMood: (mood: PracticeMood) => void
  onOpenFeatured: () => void
}

const MOOD_CARDS: Array<{
  id: PracticeMood
  title: string
  blurb: string
}> = [
  { id: 'calm', title: '先把呼吸放慢', blurb: '适合考试前、情绪上来时先稳住身体。' },
  { id: 'sleep', title: '给睡意腾出位置', blurb: '睡不着时，不催自己，先让白天退场。' },
  { id: 'focus', title: '把注意力带回这里', blurb: '走神、脑子乱时，先抓住一个具体目标。' },
]

export function PracticeHero({ mood, featured, onPickMood, onOpenFeatured }: Props) {
  return (
    <section className="practice-hero" aria-labelledby="practice-hero-title">
      <div className="practice-hero__copy">
        <p className="section-kicker">情绪导航桌面</p>
        <h2 id="practice-hero-title">不用判断做得对不对，先选一个最接近现在的状态。</h2>
        <p>
          放松练习不需要一次做很多。先让身体、睡意或注意力找到一个落点，再决定要不要继续。
        </p>
        <div className="practice-mood-row" role="tablist" aria-label="选择当前状态">
          {MOOD_CARDS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={mood === item.id ? 'practice-mood practice-mood--active' : 'practice-mood'}
              onClick={() => onPickMood(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="button" className={`practice-feature practice-feature--${featured.tone}`} onClick={onOpenFeatured}>
        <span className="practice-feature__flag">今日建议</span>
        <h3>{featured.title}</h3>
        <p>{featured.description}</p>
        <div className="practice-feature__meta">
          <span>适合：{featured.bestFor}</span>
          <span>{featured.duration}</span>
        </div>
        <span className="practice-feature__cta">从这里开始</span>
      </button>
    </section>
  )
}
