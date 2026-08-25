import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type Kind = 'session' | 'journal'

const COPY: Record<Kind, { title: string; body: string }> = {
  session: {
    title: '你已删除该会话',
    body: '这段对话已从你的历史中移除。对应情绪日记也会一并隐藏；收藏与提醒不受影响。',
  },
  journal: {
    title: '你已删除该笔记',
    body: '这篇情绪日记已对你隐藏。若需要继续陪伴，可以从首页开始新的对话。',
  },
}

/** 学生软删后强开网址时的空态：回首页按钮 + 可选倒计时跳转 */
export function StudentDeletedNotice({
  kind,
  homeTo = '/student',
  autoSeconds = 5,
}: {
  kind: Kind
  homeTo?: string
  autoSeconds?: number
}) {
  const navigate = useNavigate()
  const [left, setLeft] = useState(autoSeconds)
  const copy = COPY[kind]

  useEffect(() => {
    if (autoSeconds <= 0) return
    setLeft(autoSeconds)
    const tick = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          window.clearInterval(tick)
          navigate(homeTo, { replace: true })
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => window.clearInterval(tick)
  }, [autoSeconds, homeTo, navigate])

  return (
    <div className="student-gone" role="status">
      <p className="student-gone__eyebrow">已移除</p>
      <h1>{copy.title}</h1>
      <p className="student-gone__body">{copy.body}</p>
      <div className="student-gone__actions">
        <Link to={homeTo} className="primary-button" replace>
          返回首页
        </Link>
        {autoSeconds > 0 ? (
          <p className="student-gone__hint">{left} 秒后自动返回首页</p>
        ) : null}
      </div>
    </div>
  )
}
