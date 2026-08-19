import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

type Props = {
  title: string
  eyebrow: string
  layout?: 'immersive' | 'guided' | 'panel'
  onClose: () => void
  children: ReactNode
}

export function PracticeModalShell({
  title,
  eyebrow,
  layout = 'guided',
  onClose,
  children,
}: Props) {
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
      <div className={`practice-modal__panel practice-modal__panel--${layout}`}>
        <header className={`practice-modal__head practice-modal__head--${layout}`}>
          <div>
            <p className="practice-modal__eyebrow">{eyebrow}</p>
            <h2 id="practice-modal-title">{title}</h2>
          </div>
          <button type="button" className="ghost-button practice-modal__close" onClick={onClose}>
            <X size={18} aria-hidden />
            关闭
          </button>
        </header>
        <div className={`practice-modal__body practice-modal__body--${layout}`}>{children}</div>
      </div>
    </div>
  )
}
