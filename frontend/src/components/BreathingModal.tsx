import { X } from 'lucide-react'
import { useEffect } from 'react'
import { getBreathingExercise } from '../data/breathing'
import { BreathingPractice } from './BreathingPractice'

type Props = {
  onClose: () => void
}

export function BreathingModal({ onClose }: Props) {
  const exercise = getBreathingExercise('478')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="practice-modal" role="dialog" aria-modal="true" aria-labelledby="practice-modal-title">
      <button type="button" className="practice-modal__backdrop" aria-label="关闭" onClick={onClose} />
      <div className="practice-modal__panel">
        <header className="practice-modal__head">
          <div>
            <p className="practice-modal__eyebrow">呼吸练习</p>
            <h2 id="practice-modal-title">{exercise.name}</h2>
          </div>
          <button type="button" className="ghost-button practice-modal__close" onClick={onClose}>
            <X size={18} aria-hidden />
            关闭
          </button>
        </header>
        <div className="practice-modal__body">
          <BreathingPractice compact />
        </div>
      </div>
    </div>
  )
}
