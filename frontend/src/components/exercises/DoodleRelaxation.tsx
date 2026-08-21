import { Download, Eraser, Palette, Redo2, Sparkles, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { api, getErrorMessage } from '../../api/client'

type Tool = 'brush' | 'eraser'
type Analysis = {
  analysisId: string
  observationSummary: string
  visualElements: string[]
  reflectiveQuestions: string[]
  gentleClosing: string
  safetyNotice: string
  modelVersion: string
  supportiveResponse?: string
  suggestedQuestion?: string
  detectedTexts?: string[]
  riskLevel?: 'none' | 'concern' | 'urgent' | string
  knowledgeUsed?: boolean
  citations?: Array<{ title: string; text: string; url?: string }>
}

const COLORS = ['#334c45', '#d4866d', '#dfb45f', '#789a87', '#789eaa', '#7c718d']
const EMPTY_COLOR = '#fffdf8'
const HISTORY_KEY = 'mindharbor.doodle-history.v1'
const MAX_HISTORY = 8
const MAX_DATA_URL_LENGTH = 1_500_000
// 一次审核包含事实提取和陪伴回应两次模型请求；给后端两个 120 秒调用留足余量。
const DOODLE_ANALYSIS_TIMEOUT_MS = 300_000

type HistoryItem = {
  id: string
  createdAt: string
  imageDataUrl: string
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('无法生成画作图片'))), 'image/png')
  })
}

function paintBlank(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.fillStyle = EMPTY_COLOR
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.restore()
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法保存画作'))
    reader.onerror = () => reject(reader.error ?? new Error('无法保存画作'))
    reader.readAsDataURL(blob)
  })
}

function readHistory(): HistoryItem[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is HistoryItem => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Partial<HistoryItem>
      return typeof candidate.id === 'string' && typeof candidate.createdAt === 'string' &&
        typeof candidate.imageDataUrl === 'string' && candidate.imageDataUrl.startsWith('data:image/png') &&
        candidate.imageDataUrl.length <= MAX_DATA_URL_LENGTH
    }).slice(0, MAX_HISTORY)
  } catch {
    return []
  }
}

function writeHistory(items: HistoryItem[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
  } catch {
    // Storage quota/private browsing must not block drawing.
  }
}

function formatHistoryDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '刚刚' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function doodleErrorMessage(error: unknown) {
  const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response
  const detail = response?.data && typeof response.data === 'object' && 'detail' in response.data
    ? (response.data as { detail?: unknown }).detail
    : undefined
  if (detail && typeof detail === 'object' && 'displayMessage' in detail && typeof detail.displayMessage === 'string') {
    return detail.displayMessage
  }
  const status = response?.status
  if (status === 401) return '登录状态已失效，请重新登录本机服务后再使用 AI 温和观察。'
  if (status === 404) return '当前后端未提供随手画 AI 接口，请让团队后端部署 /api/v1/doodles/analyze。'
  if (status === 502 || status === 503) return '随手画 AI 服务暂时不可用，请检查后端的画作审核 API 配置。'
  return getErrorMessage(error, 'AI 温和观察暂时不可用，请稍后重试。')
}

export function DoodleRelaxation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const pointerRef = useRef<number | null>(null)
  const snapshotsRef = useRef<Blob[]>([])
  const futureRef = useRef<Blob[]>([])
  const activeHistoryIdRef = useRef<string | null>(null)
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState(COLORS[0])
  const [lineWidth, setLineWidth] = useState(7)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('落下第一笔后，这幅画只会保存在当前设备。')
  const [error, setError] = useState('')

  useEffect(() => {
    setHistory(readHistory())
  }, [])

  const context = () => canvasRef.current?.getContext('2d') ?? null

  const capture = useCallback(async () => {
    if (!canvasRef.current) throw new Error('画布尚未准备好')
    return canvasBlob(canvasRef.current)
  }, [])

  const restore = useCallback(async (blob: Blob) => {
    const canvas = canvasRef.current
    const ctx = context()
    if (!canvas || !ctx) return
    const url = URL.createObjectURL(blob)
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => { paintBlank(canvas, ctx); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); resolve() }
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法恢复画作')) }
      image.src = url
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = canvas?.parentElement
    if (!canvas || !frame) return
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(frame.clientWidth || 640, 320)
    const height = Math.round(width * 0.58)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = EMPTY_COLOR
    ctx.fillRect(0, 0, width, height)
  }, [])

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = context()
    if (!ctx) return
    const next = point(event)
    drawingRef.current = true
    pointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
    ctx.beginPath()
    ctx.moveTo(next.x, next.y)
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || pointerRef.current !== event.pointerId) return
    const ctx = context()
    if (!ctx) return
    const next = point(event)
    ctx.strokeStyle = tool === 'eraser' ? EMPTY_COLOR : color
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 2.5 : lineWidth
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
  }

  async function pointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || pointerRef.current !== event.pointerId) return
    drawingRef.current = false
    pointerRef.current = null
    context()?.closePath()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const snapshot = await capture()
    snapshotsRef.current = [...snapshotsRef.current, snapshot].slice(-20)
    futureRef.current = []
    setUndoCount(Math.max(0, snapshotsRef.current.length - 1))
    setRedoCount(0)
    setHasDrawing(true)
    setMessage('已保存在当前设备；提交 AI 观察前不会上传。')
    try {
      const imageDataUrl = await blobToDataUrl(snapshot)
      if (imageDataUrl.length <= MAX_DATA_URL_LENGTH) {
        setHistory((current) => {
          const id = activeHistoryIdRef.current ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
          activeHistoryIdRef.current = id
          const entry = { id, createdAt: new Date().toISOString(), imageDataUrl }
          const next = [entry, ...current.filter((item) => item.id !== id)].slice(0, MAX_HISTORY)
          writeHistory(next)
          return next
        })
      }
    } catch {
      setMessage('画作已保存在当前设备，但浏览器历史缓存暂不可用。')
    }
  }

  async function clear() {
    const canvas = canvasRef.current
    const ctx = context()
    if (!canvas || !ctx) return
    paintBlank(canvas, ctx)
    snapshotsRef.current = []
    futureRef.current = []
    setUndoCount(0)
    setRedoCount(0)
    setHasDrawing(false)
    setAnalysis(null)
    activeHistoryIdRef.current = null
    setMessage('画布已清空，仍然只保存在当前设备。')
  }

  async function restoreHistory(item: HistoryItem) {
    const canvas = canvasRef.current
    const ctx = context()
    if (!canvas || !ctx) return
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => { paintBlank(canvas, ctx); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); activeHistoryIdRef.current = item.id; setHasDrawing(true); setMessage('已恢复本地历史画作；提交 AI 观察前不会上传。'); resolve() }
      image.onerror = () => reject(new Error('无法恢复历史画作'))
      image.src = item.imageDataUrl
    }).catch((caught) => setError(getErrorMessage(caught, '无法恢复历史画作，请稍后重试。')))
  }

  function removeHistory(item: HistoryItem) {
    setHistory((current) => {
      const next = current.filter((entry) => entry.id !== item.id)
      writeHistory(next)
      return next
    })
    if (activeHistoryIdRef.current === item.id) activeHistoryIdRef.current = null
  }

  async function undo() {
    const previous = snapshotsRef.current[snapshotsRef.current.length - 2]
    const current = snapshotsRef.current[snapshotsRef.current.length - 1]
    if (!previous || !current) return
    snapshotsRef.current = snapshotsRef.current.slice(0, -1)
    futureRef.current = [current, ...futureRef.current]
    await restore(previous)
    setHasDrawing(snapshotsRef.current.length > 0)
    setUndoCount(Math.max(0, snapshotsRef.current.length - 1))
    setRedoCount(futureRef.current.length)
  }

  async function redo() {
    const next = futureRef.current.shift()
    if (!next) return
    snapshotsRef.current = [...snapshotsRef.current, next].slice(-20)
    await restore(next)
    setHasDrawing(true)
    setUndoCount(Math.max(0, snapshotsRef.current.length - 1))
    setRedoCount(futureRef.current.length)
  }

  async function download() {
    try {
      const blob = await capture()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `mindharbor-doodle-${Date.now()}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setMessage('PNG 已下载')
    } catch (caught) {
      setError(getErrorMessage(caught, '下载失败，请稍后重试。'))
    }
  }

  async function analyze() {
    if (!hasDrawing || loading) return
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('image', await capture(), 'mindharbor-doodle.png')
      const response = await api.post<Analysis>('/doodles/analyze', form, { timeout: DOODLE_ANALYSIS_TIMEOUT_MS })
      setAnalysis(response.data)
      setMessage('AI 观察完成；它只描述可见画面，不作心理诊断。')
    } catch (caught) {
      setError(doodleErrorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  return <div className="doodle-relaxation">
    <div className="doodle-relaxation__heading"><div><Palette size={18} /><strong>安静画室</strong></div><span>{message}</span></div>
    <div className="doodle-toolbar" role="toolbar" aria-label="随手画工具">
      <button type="button" className={tool === 'brush' ? 'is-active' : ''} aria-pressed={tool === 'brush'} onClick={() => setTool('brush')}>画笔</button>
      <button type="button" className={tool === 'eraser' ? 'is-active' : ''} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser size={16} />橡皮擦</button>
      <div className="doodle-colors" aria-label="画笔颜色">{COLORS.map((item) => <button key={item} type="button" aria-label={`选择颜色 ${item}`} aria-pressed={color === item} className={color === item ? 'is-active' : ''} style={{ backgroundColor: item }} onClick={() => { setColor(item); setTool('brush') }} />)}</div>
      <label className="doodle-width"><span>笔触</span><input type="range" min="2" max="22" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} /></label>
      <button type="button" aria-label="撤销" disabled={undoCount < 1} onClick={() => void undo()}><Undo2 size={16} /></button>
      <button type="button" aria-label="重做" disabled={redoCount < 1} onClick={() => void redo()}><Redo2 size={16} /></button>
      <button type="button" aria-label="下载 PNG" onClick={() => void download()}><Download size={16} /></button>
      <button type="button" aria-label="清空画布" onClick={() => void clear()}><Trash2 size={16} /></button>
    </div>
    <div className={`doodle-canvas-frame doodle-canvas-frame--${tool}`}><canvas ref={canvasRef} aria-label="随手画画布" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={(event) => void pointerEnd(event)} onPointerCancel={(event) => void pointerEnd(event)} /></div>
    {history.length > 0 ? <section className="doodle-history" aria-label="最近画作"><div className="doodle-history__heading"><strong>最近画作</strong><span>仅保存在当前设备</span></div><div className="doodle-history__grid">{history.map((item) => <article className="doodle-history__item" key={item.id}><img src={item.imageDataUrl} alt={`历史画作 ${formatHistoryDate(item.createdAt)}`} /><div><small>{formatHistoryDate(item.createdAt)}</small><button type="button" aria-label={`恢复画作 ${formatHistoryDate(item.createdAt)}`} onClick={() => void restoreHistory(item)}>恢复</button><button type="button" aria-label={`删除画作 ${formatHistoryDate(item.createdAt)}`} onClick={() => removeHistory(item)}>删除</button></div></article>)}</div></section> : null}
    <div className="doodle-review-row"><button type="button" className="primary-button" disabled={!hasDrawing || loading} onClick={() => void analyze()}><Sparkles size={17} />{loading ? '正在温和观察…' : 'AI 温和观察'}</button><span>只有点击此按钮才会上传当前 PNG；结果仅作画面观察，不代表心理判断。</span></div>
    {error ? <p className="doodle-error" role="alert">{error}</p> : null}
    {analysis ? <section className="doodle-analysis" aria-label="AI 温和观察结果">
      <div className="doodle-analysis__title"><Sparkles size={17} /><strong>观察结果</strong><small>{analysis.modelVersion}</small></div>
      {analysis.detectedTexts?.length ? <div className="doodle-analysis__word"><span>识别到的文字</span><strong>{analysis.detectedTexts.join('、')}</strong></div> : null}
      {analysis.riskLevel === 'concern' || analysis.riskLevel === 'urgent' ? <div className={`doodle-analysis__care doodle-analysis__care--${analysis.riskLevel}`}><strong>温和提醒</strong><span>一个字不能定义你的想法。它也许承载着一些感受，我们可以从这个字本身开始，慢慢把它说清楚。</span></div> : null}
      <p className="doodle-analysis__summary">{analysis.observationSummary}</p>
      <div className="doodle-analysis__support"><strong>理解与陪伴</strong><p>{analysis.supportiveResponse || analysis.gentleClosing}</p></div>
      {analysis.suggestedQuestion ? <div className="doodle-analysis__question"><span>如果你愿意，可以先回答</span><p>{analysis.suggestedQuestion}</p></div> : null}
      <p className="doodle-analysis__notice">{analysis.safetyNotice}</p>
    </section> : null}
  </div>
}
