import { useState } from 'react'

const STEPS = [
  { title: '允许清醒', instruction: '先对自己说：此刻还没睡着也没关系，我只是在休息。' },
  { title: '延长呼气', instruction: '自然吸气，然后把呼气放慢一点，重复几次，不需要计数。' },
  { title: '放下今天', instruction: '想到未完成的事时，轻轻标记"明天再处理"，再回到被子的触感。' },
  { title: '让注意力变宽', instruction: '不再抓住任何单一想法，让声音、呼吸和黑暗一起存在。' },
]

export function SleepRelaxation() {
  const [step, setStep] = useState(0)
  const [started, setStarted] = useState(false)
  const done = step >= STEPS.length

  return (
    <div className="guided-exercise-content">
      <p className="guided-exercise-content__intro">
        目标不是命令自己立刻睡着，而是让白天逐渐退场。
      </p>

      {!started ? (
        <button type="button" className="primary-button" onClick={() => setStarted(true)}>
          开始引导
        </button>
      ) : done ? (
        <div className="guided-exercise-content__done">
          <h3>练习已完成</h3>
          <p>不必马上判断有没有"效果"，先给身体一点适应的时间。</p>
          <button type="button" className="ghost-button" onClick={() => { setStep(0); setStarted(false) }}>
            再做一次
          </button>
        </div>
      ) : (
        <div className="guided-exercise-content__step">
          <div className="guided-exercise-content__progress">
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="guided-exercise-content__step-label">第 {step + 1} / {STEPS.length} 步</p>
          <h3>{STEPS[step].title}</h3>
          <p>{STEPS[step].instruction}</p>
          <div className="guided-exercise-content__actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setStep((s) => s + 1)}
            >
              {step === STEPS.length - 1 ? '完成练习' : '下一步'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
