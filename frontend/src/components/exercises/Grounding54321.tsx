import { useState } from 'react'

const STEPS = [
  { title: '看见 5 样事物', instruction: '缓慢环顾四周，说出五样你能看见的东西和它们的颜色或形状。' },
  { title: '感受 4 种触感', instruction: '留意衣物、椅面、双脚或空气接触皮肤的四种感觉。' },
  { title: '听见 3 个声音', instruction: '辨认三个远近不同的声音，不需要判断它们好不好。' },
  { title: '找到 2 种气味', instruction: '留意此刻的两种气味；若不明显，可回想熟悉且安全的气味。' },
  { title: '觉察 1 种味道或呼吸', instruction: '感受口中的味道；若没有，就把注意力放在一次自然呼吸上。' },
]

export function Grounding54321() {
  const [step, setStep] = useState(0)
  const [started, setStarted] = useState(false)
  const done = step >= STEPS.length

  return (
    <div className="guided-exercise-content">
      <p className="guided-exercise-content__intro">
        把注意力从纷乱想法带回此刻可观察的具体事物。
      </p>

      {!started ? (
        <button type="button" className="primary-button" onClick={() => setStarted(true)}>
          开始引导
        </button>
      ) : done ? (
        <div className="guided-exercise-content__done">
          <h3>练习已完成</h3>
          <p>五种感官都已经着陆，此刻的你和这里在一起。</p>
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
