import { scaleBand, scaleLinear } from 'd3-scale'
import { useState } from 'react'
import { fmtCompact, fmtInt } from '../lib/format'
import type { RegionDoc } from '../lib/types'
import { useWidth } from '../lib/useWidth'
import ChartCard from './ChartCard'

const H = 240
const M = { t: 12, r: 8, b: 26, l: 44 }

/** Annual harmonized totals with 90% bootstrap whiskers; incomplete years drawn hollow. */
export default function AnnualBars({ doc, selectedYear, onSelectYear }: { doc: RegionDoc; selectedYear?: number; onSelectYear?: (y: number) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const data = doc.annual.filter((a) => a.H != null)
  if (!data.length) return null
  const x = scaleBand<number>().domain(data.map((d) => d.y)).range([M.l, w - M.r]).padding(0.22)
  const y = scaleLinear().domain([0, Math.max(...data.map((d) => d.hi ?? d.H ?? 0)) * 1.05]).nice(4).range([H - M.b, M.t])
  const hv = data.find((d) => d.y === hover)
  // x labels: every 5th year plus the last one, dropped when it would collide (needs ~34 px between label centres)
  const labelYears = new Set<number>()
  let lastX = -Infinity
  const lastY = data[data.length - 1].y
  for (const d of data) {
    if (d.y % 5 !== 0 && d.y !== lastY) continue
    const cx = (x(d.y) ?? 0) + x.bandwidth() / 2
    if (cx - lastX >= 34) { labelYears.add(d.y); lastX = cx }
    else if (d.y === lastY) { /* keep the newest year; drop the colliding one before it */
      const prev = [...labelYears].pop()
      if (prev != null) labelYears.delete(prev)
      labelYears.add(d.y); lastX = cx
    }
  }
  const table = {
    caption: 'Annual fire-days (MODIS-equivalent) with 90% interval',
    columns: ['Year', 'Fire-days', '90% low', '90% high', 'Complete', 'Ranked'],
    rows: data.map((d) => [d.y, fmtInt(d.H), fmtInt(d.lo), fmtInt(d.hi), d.complete ? 'yes' : 'partial',
      d.rankable === false ? (d.terra_only_months ? 'no (Terra only)' : 'no') : 'yes']),
  }
  return (
    <ChartCard id="annual" title="Annual totals" table={table}
      subtitle="Harmonized fire-days per year · whiskers: 90% interval · hollow: incomplete year · hatched: Terra-only months (not ranked)">
      <div ref={ref} className="relative">
        <svg width={w} height={H} role="img" aria-label="Annual totals bar chart. Use View as table for values.">
          <defs>
            <pattern id="annual-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="#E55C30" strokeWidth="1.6" />
            </pattern>
          </defs>
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--text-faint)] font-mono text-[10px]">{fmtCompact(t)}</text>
            </g>
          ))}
          {(() => {
            const after = data.find((d) => d.y >= 2012)
            if (!after) return null
            const sx = x(after.y)! - (x.step() - x.bandwidth()) / 2
            return <line x1={sx} x2={sx} y1={M.t} y2={H - M.b} stroke="var(--text-muted)" strokeDasharray="4 3" />
          })()}
          {data.map((d) => {
            const bx = x(d.y)!
            const bw = x.bandwidth()
            const sel = d.y === selectedYear
            return (
              <g key={d.y} onMouseEnter={() => setHover(d.y)} onMouseLeave={() => setHover(null)}
                onClick={() => onSelectYear?.(d.y)} className={onSelectYear ? 'cursor-pointer' : undefined}>
                <rect x={bx - 1} y={M.t} width={bw + 2} height={H - M.b - M.t} fill="transparent" />
                <rect x={bx} y={y(d.H!)} width={bw} height={y(0) - y(d.H!)} rx={Math.min(3, bw / 3)}
                  fill={d.complete && d.rankable !== false ? (sel ? 'var(--accent)' : '#E55C30') : d.terra_only_months ? 'url(#annual-hatch)' : 'transparent'}
                  stroke={d.complete && d.rankable !== false ? 'none' : '#E55C30'} strokeWidth={1.2} opacity={hover && hover !== d.y ? 0.55 : 1} />
                {d.lo != null && d.hi != null && (
                  <line x1={bx + bw / 2} x2={bx + bw / 2} y1={y(d.lo)} y2={y(d.hi)} stroke="var(--text)" strokeWidth={1.2} />
                )}
                {labelYears.has(d.y) && (
                  <text x={bx + bw / 2} y={H - 8} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px]">{d.y}</text>
                )}
              </g>
            )
          })}
        </svg>
        {hv && (
          <div className="pointer-events-none absolute top-0 rounded-sm border border-border-strong bg-surface-3/95 px-3 py-2 text-xs shadow-card"
            style={{ left: Math.min(Math.max(0, (x(hv.y) ?? 0) - 70), w - 180) }}>
            <div className="font-display font-semibold text-text">{hv.y}{hv.complete ? '' : ' (partial)'}</div>
            <div><span className="num text-text">{fmtInt(hv.H)}</span> <span className="text-muted">fire-days</span></div>
            <div className="text-muted">90% {fmtInt(hv.lo)}–{fmtInt(hv.hi)}</div>
          </div>
        )}
      </div>
    </ChartCard>
  )
}
