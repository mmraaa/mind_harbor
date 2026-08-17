import { BreathingPractice } from '../../components/BreathingPractice'

export default function PracticePage() {
  return (
    <div className="practice-page">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">自助调节</p>
          <h1>放松练习</h1>
          <p className="page-header__description">
            考试前、入睡前，用可跟随的节奏把身体慢慢拉回来。当前提供 478 呼吸，与聊天里唤起的呼吸卡片同一套引导。
          </p>
        </div>
      </header>
      <BreathingPractice />
    </div>
  )
}
