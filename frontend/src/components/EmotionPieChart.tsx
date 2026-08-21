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
        tooltip: { show: false },
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
            radius: ['44%', '70%'],
            center: ['36%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: '#fffaf0',
              borderWidth: 2,
            },
            // 悬停文案固定显示在环心，避免左侧扇区标签被裁切或省略
            label: {
              show: false,
              position: 'center',
            },
            emphasis: {
              scale: true,
              scaleSize: 6,
              label: {
                show: true,
                formatter: '{b}\n{c} 条 · {d}%',
                fontSize: 13,
                fontWeight: 650,
                color: '#263934',
                lineHeight: 20,
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
