import type { PracticeMeta } from '../../data/practiceCatalog'
import { PracticeCard } from './PracticeCard'

type Props = {
  featured: PracticeMeta
  items: PracticeMeta[]
  onOpen: (id: PracticeMeta['id']) => void
}

export function PracticeCatalog({ featured, items, onOpen }: Props) {
  return (
    <section className="practice-catalog" aria-labelledby="practice-catalog-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">练习列表</p>
          <h2 id="practice-catalog-title">每个练习都有不同节奏，你可以按喜欢的方式开始</h2>
        </div>
        <span className="privacy-label">可随时暂停或提前结束</span>
      </div>

      <div className="practice-catalog__grid">
        <PracticeCard item={featured} featured onOpen={() => onOpen(featured.id)} />

        <div className="practice-catalog__stack">
          {items.map((item) => (
            <PracticeCard key={item.id} item={item} onOpen={() => onOpen(item.id)} />
          ))}
        </div>
      </div>
    </section>
  )
}
