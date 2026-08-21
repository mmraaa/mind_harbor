import { useEffect, useMemo, useRef } from 'react'
import type { EmotionDistItem } from '../api/counselorStats'
import { emotionDisplay } from '../data/emotions'

type Props = {
  items: EmotionDistItem[]
}

const PIE_COLORS = ['#587565', '#d4866d', '#8eafb5', '#dfb45f', '#6f8f7c', '#ad654f', '#799370']

export function EmotionPieChart({ items }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const visible = useMemo(() => items.filter((item) => item.count > 0), [items])

  useEffect(() => {
    const el = hostRef.current
    if (!el || visible.length === 0) return
    let disposed = false
    let chart: { resize: () => void; dispose: () => void; setOption: (opt: unknown) => void } | null = null

    const onResize = () => chart?.resize()

    void import('echarts').then((echarts) => {
      if (disposed || !hostRef.current) return
      chart = echarts.init(hostRef.current)
      chart.setOption({
        color: PIE_COLORS,
        tooltip: {
          trigger: 'item',
          formatter: (params: unknown) => {
            const p = params as { name?: string; value?: number; percent?: number }
            return `${p.name ?? ''}<br/>${p.value ?? 0} 条 · ${p.percent ?? 0}%`
          },
        },
        legend: {
          orient: 'vertical',
          right: 8,
          top: 'middle',
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: '#6b7a72', fontSize: 12 },
        },
        series: [
          {
            type: 'pie',
            radius: ['42%', '68%'],
            center: ['38%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: '#fffaf0',
              borderWidth: 2,
            },
            label: { show: false },
            emphasis: {
              label: {
                show: true,
                fontSize: 13,
                fontWeight: 600,
                color: '#263934',
              },
            },
            data: visible.map((item) => ({
              name: emotionDisplay(item.category).label,
              value: item.count,
            })),
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
  }, [visible])

  if (visible.length === 0) {
    return <p className="archive-empty__text">暂无情绪类别分布。</p>
  }

  return <div ref={hostRef} className="counselor-pie-chart" role="img" aria-label="情绪类别分布饼图" />
}
