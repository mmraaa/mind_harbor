import { useEffect, useRef, useState } from 'react'

function shuffle(): number[] {
  const arr = Array.from({ length: 25 }, (_, i) => i + 1)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function SchulteGrid() {
  const [numbers, setNumbers] = useState(shuffle)
  const [next, setNext] = useState(1)
  const [mistakes, setMistakes] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const timerRef = useRef<number | null>(null)
  const completed = next > 25

  useEffect(() => {
    if (!running) return
    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => { if (timerRef.current != null) window.clearInterval(timerRef.current) }
  }, [running])

  function choose(value: number) {
    if (completed) return
    if (!running) setRunning(true)
    if (value === next) {
      const nextVal = next + 1
      setNext(nextVal)
      if (nextVal > 25) setRunning(false)
    } else {
      setMistakes((m) => m + 1)
    }
  }

  function restart() {
    setNumbers(shuffle())
    setNext(1)
    setMistakes(0)
    setElapsed(0)
    setRunning(false)
  }

  return (
    <div className="schulte-content">
      <p className="schulte-content__intro">从 1 开始依次找到 25。看错并不代表失败，只要回到当前数字即可。</p>

      <div className="schulte-content__stats">
        <span>当前目标：<strong>{completed ? '完成' : next}</strong></span>
        <span>错误 {mistakes} 次</span>
        <span>用时 {elapsed} 秒</span>
      </div>

      <div className="schulte-content__grid">
        {numbers.map((value) => (
          <button
            type="button"
            key={value}
            disabled={completed || value < next}
            className={value < next ? 'schulte-content__cell schulte-content__cell--done' : 'schulte-content__cell'}
            onClick={() => choose(value)}
          >
            {value}
          </button>
        ))}
      </div>

      {completed && (
        <p className="schulte-content__result">
          训练完成：用时 {elapsed} 秒，错误 {mistakes} 次。
        </p>
      )}

      <button type="button" className="ghost-button" onClick={restart}>
        {completed ? '再来一次' : '重新生成'}
      </button>
    </div>
  )
}
