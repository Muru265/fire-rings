import { scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useWidth } from '../lib/useWidth'

export interface Series {
  id: string
  label: string
  color: string
  dashed?: boolean
  width?: number
  points: { x: number; y: number | null }[]
}

export interface Annotation { x: number; label: string; align?: 'left' | 'right' }

/** Multi-series line chart on a shared x (years). Crosshair tooltip, legend, direct end labels, bands, annotations. */
export default function LineChart({ series, height = 280, yFormat, xBand, annotations = [], yLabel, zeroLine, legendExtra }: {
  series: Series[]; height?: number; yFormat: (v: number) => string; xBand?: [number, number, string]
  annotations?: Annotation[]; yLabel?: string; zeroLine?: boolean; legendExtra?: ReactNode
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hx, setHx] = useState<number | null>(null)
  const M = { t: 26, r: 92, b: 26, l: 52 }
  const xs = series.flatMap((s) => s.points.map((p) => p.x))
  const ys = series.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v != null))
  const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([M.l, w - M.r])
  const lo = Math.min(0, ...ys)
  const y = scaleLinear().domain([lo, Math.max(...ys) * 1.06]).nice(4).range([height - M.b, M.t])
  const gen = d3line<{ x: number; y: number | null }>().defined((p) => p.y != null).x((p) => x(p.x)).y((p) => y(p.y!))
  const years = [...new Set(xs)].sort((a, b) => a - b)
  const tick = years.length > 14 ? 5 : 2

  return (
    <div ref={ref} className="relative">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? '4 3' : undefined} /></svg>
            {s.label}
          </li>
        ))}
        {legendExtra}
      </ul>
      <svg width={w} height={height} role="img" aria-label={`Line chart: ${series.map((s) => s.label).join(', ')}. Use View as table for values.`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const xv = x.invert(e.clientX - r.left)
          const near = years.reduce((a, b) => (Math.abs(b - xv) < Math.abs(a - xv) ? b : a), years[0])
          setHx(near)
        }}
        onMouseLeave={() => setHx(null)}>
        {xBand && (
          <g>
            <rect x={x(xBand[0])} y={M.t} width={x(xBand[1]) - x(xBand[0])} height={height - M.b - M.t} fill="var(--surface-3)" opacity={0.6} />
            <text x={(x(xBand[0]) + x(xBand[1])) / 2} y={M.t - 8} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px]">{xBand[2]}</text>
          </g>
        )}
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} stroke={zeroLine && t === 0 ? 'var(--text-faint)' : 'var(--border)'} />
            <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--text-faint)] font-mono text-[10px]">{yFormat(t)}</text>
          </g>
        ))}
        {yLabel && <text x={12} y={height / 2} transform={`rotate(-90 12 ${height / 2})`} textAnchor="middle" className="fill-[var(--text-faint)] text-[10px]">{yLabel}</text>}
        {years.filter((yr) => yr % tick === 0 || yr === years[0] || yr === years[years.length - 1]).map((yr) => (
          <text key={yr} x={x(yr)} y={height - 8} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px]">{yr}</text>
        ))}
        {annotations.map((a) => (
          <g key={a.label}>
            <line x1={x(a.x)} x2={x(a.x)} y1={M.t} y2={height - M.b} stroke="var(--text-muted)" strokeDasharray="3 3" />
            <text x={x(a.x) + (a.align === 'left' ? -4 : 4)} y={M.t + 10} textAnchor={a.align === 'left' ? 'end' : 'start'}
              className="fill-[var(--text)] text-[10px]" style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}>{a.label}</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.id} d={gen(s.points) ?? ''} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />
        ))}
        {(() => {
          // direct end labels, nudged apart so they never overprint
          const labs = series.map((s) => {
            const last = [...s.points].reverse().find((p) => p.y != null)
            return last ? { id: s.id, text: s.label.split(' (')[0], x: x(last.x) + 6, y: y(last.y!) } : null
          }).filter((l): l is { id: string; text: string; x: number; y: number } => l != null).sort((a, b) => a.y - b.y)
          for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 13) labs[i].y = labs[i - 1].y + 13
          return labs.map((l) => <text key={l.id} x={l.x} y={l.y} dy="0.32em" className="text-[11px]" fill="var(--text)">{l.text}</text>)
        })()}
        {hx != null && (
          <g pointerEvents="none">
            <line x1={x(hx)} x2={x(hx)} y1={M.t} y2={height - M.b} stroke="var(--text-faint)" />
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hx)
              return p?.y != null ? <circle key={s.id} cx={x(hx)} cy={y(p.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null
            })}
          </g>
        )}
      </svg>
      {hx != null && (
        <div className="pointer-events-none absolute rounded-sm border border-border-strong bg-surface-3/95 px-3 py-2 text-xs shadow-card"
          style={{ top: 30, left: Math.min(Math.max(0, x(hx) + 12), w - 200) }}>
          <div className="font-display font-semibold text-text">{hx}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.x === hx)
            return <div key={s.id} className="flex items-center gap-2 text-muted">
              <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />{s.label}: <span className="num text-text">{p?.y != null ? yFormat(p.y) : '—'}</span>
            </div>
          })}
        </div>
      )}
    </div>
  )
}
