import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getBreathingExercise } from '../data/breathing'

type SessionState = 'idle' | 'running' | 'paused'

type Props = {
  /** 弹层内紧凑布局：单列、可滚动 */
  compact?: boolean
}

export function BreathingPractice({ compact = false }: Props) {
  const exercise = getBreathingExercise('478')
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

  function stopTimer() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function tickPhase(): number {
    const cycle = cycleRef.current
    let next = phaseRef.current + 1
    if (next >= cycle.length) {
      setRound((r) => r + 1)
      next = 0
    }
    phaseRef.current = next
    setPhaseIndex(next)
    return cycle[next].seconds
  }

  function startTicker() {
    stopTimer()
    timerRef.current = window.setInterval(() => {
      if (sessionRef.current !== 'running') return
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1
        return tickPhase()
      })
    }, 1000)
  }

  function startTimed() {
    if (!hasCycle) return
    setSession('running')
    phaseRef.current = 0
    setPhaseIndex(0)
    setRound(1)
    setSecondsLeft(exercise.cycle[0].seconds)
    startTicker()
  }

  function startCountGuide() {
    setSession('running')
    setStepIndex(0)
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
    phaseRef.current = 0
    setPhaseIndex(0)
    setSecondsLeft(0)
    setRound(1)
    setStepIndex(0)
  }

  const motion = session === 'running' && phase ? phase.motion : 'idle'
  const countActive = !hasCycle && session === 'running'
  const cueLabel =
    session === 'idle'
      ? '准备好了再开始'
      : session === 'paused'
        ? '已暂停'
        : countActive
          ? (exercise.steps[stepIndex] ?? '跟随引导')
          : (phase?.label ?? '跟随呼吸')

  const orbStyle: CSSProperties | undefined =
    phase && session === 'running'
      ? ({ '--tide-seconds': `${phase.seconds}s` } as CSSProperties)
      : undefined

  const orbKey = hasCycle ? `478-${round}-${phaseIndex}` : `478-count-${stepIndex}`

  return (
    <div className={compact ? 'practice-stage practice-stage--compact' : 'practice-stage'}>
      <section className="tide-panel" aria-live="polite">
        <div
          key={orbKey}
          className={`tide-orb tide-orb--${countActive ? 'guide' : motion}${compact ? ' tide-orb--compact' : ''}`}
          style={orbStyle}
        >
          <div className="tide-orb__core">
            {countActive ? (
              <>
                <span className="tide-orb__step-badge">
                  第 {stepIndex + 1} / {exercise.steps.length} 步
                </span>
                <span className="tide-orb__phase tide-orb__phase--guide">{cueLabel}</span>
              </>
            ) : (
              <>
                <span className="tide-orb__phase">{cueLabel}</span>
                {session === 'running' && phase ? (
                  <span className="tide-orb__count">{secondsLeft}</span>
                ) : (
                  <span className="tide-orb__hint">吸 · 停 · 呼</span>
                )}
              </>
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
                <li
                  key={s}
                  className={
                    session === 'running' && i === stepIndex
                      ? 'tide-steps__item tide-steps__item--active'
                      : session === 'running' && i < stepIndex
                        ? 'tide-steps__item tide-steps__item--done'
                        : 'tide-steps__item'
                  }
                >
                  <span className="tide-steps__num">{i + 1}</span>
                  <span className="tide-steps__text">{s}</span>
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
                {session === 'idle' && (
                  <button type="button" className="primary-button" onClick={startCountGuide}>
                    开始跟随
                  </button>
                )}
                {session === 'running' && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      setStepIndex((i) => Math.min(i + 1, exercise.steps.length - 1))
                    }
                    disabled={stepIndex >= exercise.steps.length - 1}
                  >
                    {stepIndex >= exercise.steps.length - 1 ? '已到最后一步' : '下一步'}
                  </button>
                )}
                {session !== 'idle' && (
                  <button type="button" className="ghost-button" onClick={reset}>
                    结束本轮
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
