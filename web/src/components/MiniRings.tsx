import { arc as d3arc } from 'd3-shape'
import { useMemo } from 'react'
import { quantileScale } from '../lib/scales'
import type { MonthRec } from '../lib/types'

/** Non-interactive small Fire Rings (harmonized), for cards. */
export default function MiniRings({ months, size = 72, label }: { months: MonthRec[]; size?: number; label: string }) {
  const paths = useMemo(() => {
    const years = [...new Set(months.map((r) => r.y))].sort((a, b) => a - b)
    const sc = quantileScale(months.map((r) => r.H))
    const r0 = size * 0.14
    const r1 = size * 0.49
    const w = (r1 - r0) / years.length
    const gen = d3arc<{ i: number; m: number }>().innerRadius((d) => r0 + d.i * w).outerRadius((d) => r0 + (d.i + 1) * w)
      .startAngle((d) => ((d.m - 1) / 12) * Math.PI * 2).endAngle((d) => (d.m / 12) * Math.PI * 2)
    return months.map((r) => ({ d: gen({ i: years.indexOf(r.y), m: r.m }) ?? '', c: (sc.colorOf(r.H) ?? '#18212E').replace('var(--zero)', '#1C2533') }))
  }, [months, size])
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} role="img" aria-label={label}>
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.c} />)}
    </svg>
  )
}
