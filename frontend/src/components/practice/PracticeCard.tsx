import type { PracticeMeta } from '../../data/practiceCatalog'

type Props = {
  item: PracticeMeta
  highlighted?: boolean
  featured?: boolean
  onOpen: () => void
}

export function PracticeCard({ item, highlighted = false, featured = false, onOpen }: Props) {
  const Icon = item.icon
  const cls = [
    'exercise-card',
    `exercise-card--${item.tone}`,
    featured ? 'exercise-card--featured' : '',
    highlighted ? 'exercise-card--highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={cls} onClick={onOpen}>
      <span className="exercise-card__rail" aria-hidden />
      <div className="exercise-card__icon-wrap">
        <Icon size={featured ? 28 : 24} strokeWidth={1.6} />
      </div>
      <div className="exercise-card__topline">
        <span className="exercise-card__tag">{item.tag}</span>
        <span className="exercise-card__difficulty">{item.difficulty}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <div className="exercise-card__chips">
        <span>适合：{item.bestFor}</span>
      </div>
      <div className="exercise-card__foot">
        <span className="exercise-card__duration">{item.duration}</span>
        <span className="exercise-card__duration">难度 {item.difficulty}</span>
      </div>
    </button>
  )
}
