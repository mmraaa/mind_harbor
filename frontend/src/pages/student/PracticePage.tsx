import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  BREATHING_EXERCISES,
  getBreathingExercise,
  type BreathingExercise,
} from '../../data/breathing'

type SessionState = 'idle' | 'running' | 'paused'

export default function PracticePage() {
  const [selectedId, setSelectedId] = useState<BreathingExercise['id']>('478')
  const exercise = getBreathingExercise(selectedId)
  const hasCycle = exercise.cycle.length > 0

  const [session, setSession] = useState<SessionState>('idle')
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [round, setRound] = useState(1)
  const [stepIndex, setStepIndex] = useState(0)

  const sessionRef = useRef(session)
  const phaseRef = useRef(phaseIndex)
  const cycleRef = useRef(exercise.cycle)
  const timerRef = useRef<number | null>(null)

  sessionRef.current = session
  phaseRef.current = phaseIndex
  cycleRef.current = exercise.cycle

  const phase = hasCycle ? exercise.cycle[phaseIndex] : null

  useEffect(() => {
    return () => stopTimer()
  }, [])

  useEffect(() => {
    stopTimer()
    setSession('idle')
    setPhaseIndex(0)
    setSecondsLeft(0)
    setRound(1)
    setStepIndex(0)
  }, [selectedId])

  function stopTimer() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function advancePhase() {
    const cycle = cycleRef.current
    const next = phaseRef.current + 1
    if (next >= cycle.length) {
      setRound((r) => r + 1)
      setPhaseIndex(0)
      setSecondsLeft(cycle[0].seconds)
      return
    }
    setPhaseIndex(next)
    setSecondsLeft(cycle[next].seconds)
  }

  function startTicker() {
    stopTimer()
    timerRef.current = window.setInterval(() => {
      if (sessionRef.current !== 'running') return
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1
        advancePhase()
        return 0
      })
    }, 1000)
  }

  function startTimed() {
    if (!hasCycle) return
    setSession('running')
    setPhaseIndex(0)
    setRound(1)
    setSecondsLeft(exercise.cycle[0].seconds)
    startTicker()
  }

  function pause() {
    stopTimer()
    setSession('paused')
  }

  function resume() {
    if (!hasCycle || session !== 'paused') return
    setSession('running')
    startTicker()
  }

  function reset() {
    stopTimer()
    setSession('idle')
    setPhaseIndex(0)
    setSecondsLeft(0)
    setRound(1)
    setStepIndex(0)
  }

  const motion = session === 'running' && phase ? phase.motion : 'idle'
  const cueLabel =
    session === 'idle'
      ? '准备好了再开始'
      : session === 'paused'
        ? '已暂停'
        : (phase?.label ?? exercise.steps[stepIndex] ?? '跟随呼吸')

  const orbStyle: CSSProperties | undefined =
    phase && session === 'running'
      ? ({ '--tide-seconds': `${phase.seconds}s` } as CSSProperties)
      : undefined

  return (
    <div className="practice-page">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">HARBOR TIDE</p>
          <h1>放松练习</h1>
          <p className="page-header__description">
            跟随港湾潮汐的节奏。与聊天里唤起的呼吸卡片同一套引导。
          </p>
        </div>
      </header>

      <div className="practice-stage">
        <section className="tide-panel" aria-live="polite">
          <div className={`tide-orb tide-orb--${motion}`} style={orbStyle}>
            <div className="tide-orb__core">
              <span className="tide-orb__phase">{cueLabel}</span>
              {session === 'running' && phase ? (
                <span className="tide-orb__count">{secondsLeft}</span>
              ) : (
                <span className="tide-orb__hint">吸 · 停 · 呼</span>
              )}
            </div>
          </div>

          <div className="tide-panel__copy">
            <p className="tide-kicker">{exercise.durationHint}</p>
            <h2>{exercise.name}</h2>
            <p className="tide-tagline">{exercise.tagline}</p>

            {hasCycle ? (
              <div className="tide-phases">
                {exercise.cycle.map((p, i) => (
                  <span
                    key={`${p.label}-${i}`}
                    className={
                      session !== 'idle' && i === phaseIndex
                        ? 'tide-phases__item tide-phases__item--active'
                        : 'tide-phases__item'
                    }
                  >
                    {p.label}
                    <em>{p.seconds}s</em>
                  </span>
                ))}
              </div>
            ) : (
              <ol className="tide-steps">
                {exercise.steps.map((s, i) => (
                  <li key={s} className={i === stepIndex ? 'is-current' : undefined}>
                    {s}
                  </li>
                ))}
              </ol>
            )}

            {session !== 'idle' && hasCycle && <p className="tide-round">第 {round} 组</p>}

            <div className="tide-actions">
              {hasCycle ? (
                <>
                  {session === 'idle' && (
                    <button type="button" className="primary-button" onClick={startTimed}>
                      开始跟随
                    </button>
                  )}
                  {session === 'running' && (
                    <button type="button" className="primary-button" onClick={pause}>
                      暂停
                    </button>
                  )}
                  {session === 'paused' && (
                    <button type="button" className="primary-button" onClick={resume}>
                      继续
                    </button>
                  )}
                  {session !== 'idle' && (
                    <button type="button" className="ghost-button" onClick={reset}>
                      结束本轮
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setStepIndex((i) => Math.min(i + 1, exercise.steps.length - 1))}
                    disabled={stepIndex >= exercise.steps.length - 1}
                  >
                    {stepIndex >= exercise.steps.length - 1 ? '已到最后一步' : '下一步'}
                  </button>
                  <button type="button" className="ghost-button" onClick={reset}>
                    从头开始
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="practice-picker" aria-label="选择练习">
          <p className="practice-picker__label">选择节奏</p>
          <ul className="practice-picker__list">
            {BREATHING_EXERCISES.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    item.id === selectedId ? 'practice-pick practice-pick--active' : 'practice-pick'
                  }
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="practice-pick__name">{item.name}</span>
                  <span className="practice-pick__meta">{item.durationHint}</span>
                  <span className="practice-pick__desc">{item.tagline}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="practice-picker__note">
            聊天里说「想做个呼吸练习」，助手也会推送同款步骤卡片。
          </p>
        </aside>
      </div>
    </div>
  )
}
