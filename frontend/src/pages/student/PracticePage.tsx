import { useMemo, useState, type ReactNode } from 'react'
import { BreathingPractice } from '../../components/BreathingPractice'
import { SleepRelaxation } from '../../components/exercises/SleepRelaxation'
import { Grounding54321 } from '../../components/exercises/Grounding54321'
import { SchulteGrid } from '../../components/exercises/SchulteGrid'
import { DoodleRelaxation } from '../../components/exercises/DoodleRelaxation'
import { PracticeCatalog } from '../../components/practice/PracticeCatalog'
import { PracticeModalShell } from '../../components/practice/PracticeModalShell'
import { PRACTICE_CATALOG, type PracticeId } from '../../data/practiceCatalog'

function ExerciseModal({ exerciseId, onClose }: { exerciseId: PracticeId; onClose: () => void }) {
  const meta = PRACTICE_CATALOG.find((e) => e.id === exerciseId)!

  let content: ReactNode = null
  switch (exerciseId) {
    case 'breathing':
      content = <BreathingPractice compact />
      break
    case 'sleep':
      content = <SleepRelaxation />
      break
    case 'grounding':
      content = <Grounding54321 />
      break
    case 'schulte':
      content = <SchulteGrid />
      break
    case 'doodle':
      content = <DoodleRelaxation />
      break
  }

  return (
    <PracticeModalShell
      title={meta.title}
      eyebrow={`${meta.tag} · ${meta.duration}`}
      layout={meta.modalLayout}
      onClose={onClose}
    >
      {content}
    </PracticeModalShell>
  )
}

export default function PracticePage() {
  const [active, setActive] = useState<PracticeId | null>(null)
  const lead = useMemo(
    () => PRACTICE_CATALOG.find((item) => item.featured) ?? PRACTICE_CATALOG[0],
    [],
  )
  const secondary = useMemo(
    () => PRACTICE_CATALOG.filter((item) => item.id !== lead.id),
    [lead.id],
  )

  return (
    <div className="practice-page">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">自助调节</p>
          <h1>放松练习</h1>
          <p className="page-header__description">
            考试前、入睡前，或只是想把自己慢慢拉回来时，挑一项适合此刻的练习开始。
          </p>
        </div>
      </header>

      <section className="practice-intro-board" aria-labelledby="practice-intro-title">
        <div className="practice-intro-board__copy">
          <p className="section-kicker">练习展板</p>
          <h2 id="practice-intro-title">先选一个你愿意开始的小练习，不用一次做很多。</h2>
          <p>
            这里收纳的是短时、可跟随、能随时结束的自助练习。
          </p>
        </div>
      </section>

      <PracticeCatalog featured={lead} items={secondary} onOpen={setActive} />

      {active && <ExerciseModal exerciseId={active} onClose={() => setActive(null)} />}
    </div>
  )
}
