import { useEffect, useRef } from 'react'
import type { EmotionTrendPoint } from '../api/counselorStats'

type Props = {
  points: EmotionTrendPoint[]
}

export function EmotionTrendChart({ points }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    let disposed = false
    let chart: { resize: () => void; dispose: () => void; setOption: (opt: unknown) => void } | null = null

    const onResize = () => chart?.resize()

    void import('echarts').then((echarts) => {
      if (disposed || !hostRef.current) return
      chart = echarts.init(hostRef.current)
      chart.setOption({
        color: ['#587565'],
        grid: { left: 36, right: 16, top: 28, bottom: 36 },
        tooltip: {
          trigger: 'axis',
          formatter: (params: unknown) => {
            const items = Array.isArray(params) ? params : [params]
            const first = items[0] as { dataIndex?: number }
            const point = points[first.dataIndex ?? 0]
            if (!point) return ''
            const intensity = point.avg_intensity == null ? '无记录' : `${point.avg_intensity}`
            return `${point.date}<br/>均强 ${intensity}<br/>记录 ${point.count} 条`
          },
        },
        xAxis: {
          type: 'category',
          data: points.map((p) => p.date.slice(5).replace('-', '/')),
          boundaryGap: false,
          axisLine: { lineStyle: { color: 'rgba(88, 117, 101, 0.28)' } },
          axisLabel: { color: '#6b7a72', fontSize: 11 },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 10,
          splitNumber: 5,
          splitLine: { lineStyle: { color: 'rgba(88, 117, 101, 0.12)' } },
          axisLabel: { color: '#6b7a72', fontSize: 11 },
        },
        series: [
          {
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            connectNulls: true,
            data: points.map((p) => p.avg_intensity),
            lineStyle: { width: 2.5 },
            areaStyle: { color: 'rgba(88, 117, 101, 0.12)' },
          },
        ],
      })
      window.addEventListener('resize', onResize)
    })

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      chart?.dispose()
    }
  }, [points])

  return <div ref={hostRef} className="counselor-trend-chart" role="img" aria-label="情绪强度折线图" />
}
