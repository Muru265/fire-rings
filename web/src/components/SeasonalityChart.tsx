import { scaleBand, scaleLinear } from 'd3-scale'
import { useState } from 'react'
import { fmtCompact, fmtInt } from '../lib/format'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'
import { useWidth } from '../lib/useWidth'
import ChartCard from './ChartCard'

const H = 240
const M = { t: 12, r: 12, b: 26, l: 44 }
const C_CMP = '#3B8FCC'
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

/** One plain sentence from the data (QA #14). */
function takeaway(doc: RegionDoc, year: number): string {
  const c = doc.climatology!
  const order = c.median.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])
  const peaks = order.slice(0, 2).map(([, i]) => FULL[i]).sort((a, b) => FULL.indexOf(a) - FULL.indexOf(b))
  const recs = doc.months.filter((r) => r.y === year && r.H != null && !r.flags.includes('mtd'))
  const below = recs.filter((r) => r.H! < c.p10[r.m - 1]).map((r) => FULL[r.m - 1])
  const above = recs.filter((r) => r.H! > c.p90[r.m - 1]).map((r) => FULL[r.m - 1])
  const parts = [`${list(peaks)} are normally the peak.`]
  if (!recs.length) return parts[0]
  if (below.length) parts.push(`In ${year}, ${list(below.slice(0, 4))} ${below.length === 1 ? 'was' : 'were'} below the normal range`)
  if (above.length) parts.push(`${below.length ? '; ' : `In ${year}, `}${list(above.slice(0, 4))} ${above.length === 1 ? 'was' : 'were'} above it`)
  if (!below.length && !above.length) parts.push(`In ${year}, every complete month so far was inside the normal range`)
  return parts.join(' ').replace(' ;', ';') + '.'
}

/** Baseline P10–P90 band + median per month, with the selected year (and an optional similar year) as dots. */
export default function SeasonalityChart({ doc, year, compareYear }: { doc: RegionDoc; year: number; compareYear?: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const c = doc.climatology
  if (!c) return null
  const yr = MONTHS.map((_, i) => doc.months.find((r) => r.y === year && r.m === i + 1) ?? null)
  const cy = compareYear ? MONTHS.map((_, i) => doc.months.find((r) => r.y === compareYear && r.m === i + 1) ?? null) : null
  const ymax = Math.max(...c.p90, ...yr.map((r) => r?.hi ?? r?.H ?? 0), ...(cy ?? []).map((r) => r?.H ?? 0)) * 1.08 || 1
  const x = scaleBand<number>().domain(MONTHS.map((_, i) => i)).range([M.l, w - M.r]).padding(0.28)
  const y = scaleLinear().domain([0, ymax]).nice(4).range([H - M.b, M.t])
  const cx = (i: number) => x(i)! + x.bandwidth() / 2
  const table = {
    caption: `Typical fire-days by month (baseline ${doc.baseline[0]}–${doc.baseline[1]}) and ${year}`,
    columns: ['Month', 'P10', 'Median', 'P90', `${year}`, `${year} 90% range`, ...(compareYear ? [`${compareYear}`] : [])],
    rows: MONTHS.map((mn, i) => [mn, fmtInt(c.p10[i]), fmtInt(c.median[i]), fmtInt(c.p90[i]),
      yr[i]?.H != null ? fmtInt(yr[i]!.H) : null, yr[i]?.lo != null ? `${fmtInt(yr[i]!.lo)}–${fmtInt(yr[i]!.hi)}` : null,
      ...(cy ? [cy[i]?.H != null ? fmtInt(cy[i]!.H) : null] : [])]),
  }
  return (
    <ChartCard id="season" title="Seasonality" table={table}
      subtitle={<span data-testid="season-takeaway">{takeaway(doc, year)}</span>}>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-[3px] bg-surface-3" />normal range (8 of 10 years, {doc.baseline[0]}–{doc.baseline[1]})</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-text" />typical (median)</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" />{year}</li>
        {compareYear && <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: C_CMP }} />{compareYear} (similar year)</li>}
      </ul>
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
                  <line x1={cx(i)} x2={cx(i)} y1={y(r.lo)} y2={y(r.hi)} stroke="var(--accent)" strokeWidth={1.5} />
                )}
                {r?.H != null && <circle cx={cx(i)} cy={y(r.H)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
                <text x={cx(i)} y={H - 8} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px]">{mn[0]}</text>
              </g>
            )
          })}
          {cy && (
            <polyline fill="none" stroke={C_CMP} strokeWidth={2} strokeDasharray="5 4"
              points={cy.map((r, i) => (r?.H != null ? `${cx(i)},${y(r.H)}` : '')).filter(Boolean).join(' ')} />
          )}
        </svg>
      </div>
      {/* readout below the plot: never covers axes or the hovered element (QA #13) */}
      <p className="mt-1 min-h-[1.25rem] text-xs text-muted" aria-live="polite">
        {hover != null ? (
          <>
            <span className="font-semibold text-text">{MONTHS[hover]}</span> · typical <span className="num text-text">{fmtInt(c.median[hover])}</span>
            {' '}(normal range {fmtInt(c.p10[hover])}–{fmtInt(c.p90[hover])})
            {yr[hover]?.H != null && <> · {year}: <span className="num text-text">{fmtInt(yr[hover]!.H)}</span></>}
            {cy?.[hover]?.H != null && <> · {compareYear}: <span className="num text-text">{fmtInt(cy[hover]!.H)}</span></>} MODIS-equivalent fire-days
          </>
        ) : 'Hover a month for its values.'}
      </p>
    </ChartCard>
  )
}
