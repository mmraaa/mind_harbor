type SpeechRec = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start: () => void
  abort: () => void
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechResultList = ArrayLike<{
  isFinal: boolean
  0?: { transcript: string }
}>

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRec
  webkitSpeechRecognition?: new () => SpeechRec
}

export function speechRecognitionSupported(): boolean {
  const w = window as SpeechWindow
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function startSpeechRecognition(options: {
  onResult: (text: string, isFinal: boolean) => void
  onError: (message: string) => void
  onEnd: () => void
}): () => void {
  const w = window as SpeechWindow
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) {
    options.onError('当前浏览器不支持语音识别，请改用 Chrome，或直接打字。')
    options.onEnd()
    return () => {}
  }

  const rec = new Ctor()
  rec.lang = 'zh-CN'
  rec.interimResults = true
  rec.continuous = true
  rec.maxAlternatives = 1

  rec.onresult = (event) => {
    let finals = ''
    let interim = ''
    // 必须从 0 累加：第一句被标成 isFinal 后，下一句会从新的 resultIndex 开始，
    // 只取增量会覆盖输入框里已经认出的上一句。
    for (let i = 0; i < event.results.length; i += 1) {
      const piece = event.results[i][0]?.transcript ?? ''
      if (event.results[i].isFinal) finals += piece
      else interim += piece
    }
    const text = `${finals}${finals && interim ? ' ' : ''}${interim}`.trim()
    if (text) options.onResult(text, !interim)
  }

  rec.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return
    const map: Record<string, string> = {
      'not-allowed': '没有麦克风权限，请在浏览器设置里允许后重试。',
      network: '语音识别网络异常，请稍后再试。',
    }
    options.onError(map[event.error] || `语音识别失败：${event.error}`)
  }

  rec.onend = () => options.onEnd()
  rec.start()

  return () => {
    try {
      rec.abort()
    } catch {
      // ignore
    }
  }
}
