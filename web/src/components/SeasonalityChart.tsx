import { scaleBand, scaleLinear } from 'd3-scale'
import { useState } from 'react'
import { fmtCompact, fmtInt } from '../lib/format'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'
import { useWidth } from '../lib/useWidth'
import ChartCard from './ChartCard'

const H = 240
const M = { t: 12, r: 12, b: 26, l: 44 }

/** Baseline P10–P90 band + median per month, with the selected year as a line of dots. */
export default function SeasonalityChart({ doc, year }: { doc: RegionDoc; year: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const c = doc.climatology
  if (!c) return null
  const yr = MONTHS.map((_, i) => doc.months.find((r) => r.y === year && r.m === i + 1) ?? null)
  const ymax = Math.max(...c.p90, ...yr.map((r) => r?.hi ?? r?.H ?? 0)) * 1.08 || 1
  const x = scaleBand<number>().domain(MONTHS.map((_, i) => i)).range([M.l, w - M.r]).padding(0.28)
  const y = scaleLinear().domain([0, ymax]).nice(4).range([H - M.b, M.t])
  const table = {
    caption: `Typical fire-days by month (baseline ${doc.baseline[0]}–${doc.baseline[1]}) and ${year}`,
    columns: ['Month', 'P10', 'Median', 'P90', `${year}`, `${year} 90% interval`],
    rows: MONTHS.map((mn, i) => [mn, fmtInt(c.p10[i]), fmtInt(c.median[i]), fmtInt(c.p90[i]),
      yr[i]?.H != null ? fmtInt(yr[i]!.H) : null, yr[i]?.lo != null ? `${fmtInt(yr[i]!.lo)}–${fmtInt(yr[i]!.hi)}` : null]),
  }
  return (
    <ChartCard id="season" title="Seasonality" table={table}
      subtitle={<>Grey band: P10–P90 of {doc.baseline[0]}–{doc.baseline[1]} · white tick: median · <span className="text-accent">●</span> {year}</>}>
      <div ref={ref} className="relative">
        <svg width={w} height={H} role="img" aria-label={`Seasonality chart. ${table.caption}. Use View as table for values.`}>
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--text-faint)] font-mono text-[10px]">{fmtCompact(t)}</text>
            </g>
          ))}
          {MONTHS.map((mn, i) => {
            const bx = x(i)!
            const bw = x.bandwidth()
            const r = yr[i]
            return (
              <g key={mn} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={bx - 4} y={M.t} width={bw + 8} height={H - M.b - M.t} fill={hover === i ? 'var(--surface-2)' : 'transparent'} />
                <rect x={bx} y={y(c.p90[i])} width={bw} height={Math.max(1, y(c.p10[i]) - y(c.p90[i]))} rx={4} fill="var(--surface-3)" />
                <line x1={bx} x2={bx + bw} y1={y(c.median[i])} y2={y(c.median[i])} stroke="var(--text)" strokeWidth={2} />
                {r?.lo != null && r?.hi != null && (
                  <line x1={bx + bw / 2} x2={bx + bw / 2} y1={y(r.lo)} y2={y(r.hi)} stroke="var(--accent)" strokeWidth={1.5} />
                )}
                {r?.H != null && <circle cx={bx + bw / 2} cy={y(r.H)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
                <text x={bx + bw / 2} y={H - 8} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px]">{mn[0]}</text>
              </g>
            )
          })}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-0 rounded-sm border border-border-strong bg-surface-3/95 px-3 py-2 text-xs shadow-card"
            style={{ left: Math.min(Math.max(0, (x(hover) ?? 0) - 60), w - 190) }}>
            <div className="font-display font-semibold text-text">{MONTHS[hover]}</div>
            <div className="text-muted">typical <span className="num text-text">{fmtInt(c.median[hover])}</span> (P10–P90 {fmtInt(c.p10[hover])}–{fmtInt(c.p90[hover])})</div>
            {yr[hover]?.H != null && <div className="text-muted">{year}: <span className="num text-text">{fmtInt(yr[hover]!.H)}</span> fire-days</div>}
          </div>
        )}
      </div>
    </ChartCard>
  )
}
