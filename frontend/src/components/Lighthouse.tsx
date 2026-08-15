/**
 * 灯塔标识:MindHarbor 的视觉核心——深夜海面上的一盏灯。
 * 纯几何 SVG:塔身 + 灯室 + 一道暖光带。
 */
export default function Lighthouse({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-label="MindHarbor 灯塔标识"
    >
      {/* 光带 */}
      <path
        d="M14 6 L4 22 M34 6 L44 22"
        stroke="var(--lighthouse)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* 塔身 */}
      <path
        d="M16 44 L16 22 L32 22 L32 44 Z"
        fill="var(--night-2)"
        stroke="var(--water)"
        strokeWidth="1.5"
      />
      {/* 灯室 */}
      <rect x="18" y="16" width="12" height="8" rx="2" fill="var(--lighthouse)" />
      {/* 塔顶 */}
      <path d="M17 16 L31 16 L27 10 L21 10 Z" fill="var(--night-3)" stroke="var(--water)" strokeWidth="1.5" />
      {/* 水面 */}
      <path
        d="M8 44 Q12 41 16 44 T24 44 T32 44 T40 44"
        stroke="var(--water)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  )
}
