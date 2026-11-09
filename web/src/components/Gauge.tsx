import { ordinal } from '../lib/describe'
import { fmtRatio } from '../lib/format'
import type { Judgement } from '../lib/headline'

const W = 240
const R = 96
const CX = W / 2
const CY = 112

function polar(p: number, r = R): [number, number] {
  const a = Math.PI * (1 - p / 100)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

function arc(p0: number, p1: number, r = R) {
  const [x0, y0] = polar(p0, r)
  const [x1, y1] = polar(p1, r)
  return `M${x0},${y0} A${r},${r} 0 ${p1 - p0 > 50 ? 1 : 0} 1 ${x1},${y1}`
}

/** Percentile gauge: arc band = percentile range over the bootstrap; needle at its middle. */
export default function Gauge({ j }: { j: Judgement }) {
  const has = j.pct != null && !j.guard && j.value != null
  const [p0, p1] = has ? j.pct! : [0, 0]
  const mid = (p0 + p1) / 2
  const [nx, ny] = polar(mid, R - 18)
  const label = !has ? (j.guard ? 'too little fire to judge' : 'no data')
    : p1 === 0 ? 'below every baseline year'
    : `${p0 === p1 ? ordinal(p0) : `${ordinal(p0)}–${ordinal(p1)}`} percentile`
  return (
    <figure className="flex flex-col items-center" aria-label={`Gauge: ${label}${j.ratio != null && has ? `, ${fmtRatio(j.ratio)} the typical month` : ''}`}>
      <svg viewBox={`0 0 ${W} 132`} className="w-full max-w-[260px]" role="img" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((t) => {
          const [a, b] = polar(t, R + 10)
          const [c, d] = polar(t, R + 4)
          return <line key={t} x1={a} y1={b} x2={c} y2={d} stroke="var(--border-strong)" strokeWidth={1} />
        })}
        <path d={arc(0, 100)} fill="none" stroke="var(--surface-3)" strokeWidth={14} strokeLinecap="round" />
        <path d={arc(0, 50, R)} fill="none" stroke="#2166AC" strokeOpacity={0.25} strokeWidth={14} />
        <path d={arc(50, 100, R)} fill="none" stroke="#B2182B" strokeOpacity={0.25} strokeWidth={14} />
        {has && (
          <>
            <path d={arc(Math.max(0, p0 - 0.8), Math.min(100, p1 + 0.8))} fill="none" stroke="var(--text)" strokeWidth={14} strokeLinecap="round" />
            <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={5} fill="var(--accent)" />
          </>
        )}
        <text x={polar(0, R + 20)[0]} y={CY + 16} textAnchor="middle" className="fill-[var(--text-faint)] font-mono text-[10px]">low</text>
        <text x={polar(100, R + 20)[0]} y={CY + 16} textAnchor="middle" className="fill-[var(--text-faint)] font-mono text-[10px]">high</text>
      </svg>
      <figcaption className="-mt-1 text-center">
        <div className="font-display text-[32px] leading-none font-bold text-text">
          {has && j.ratio != null ? fmtRatio(j.ratio) : j.guard ? '~' : '—'}
        </div>
        <div className="mt-1 text-xs text-muted">{has ? 'of the typical month' : ''}</div>
        <div className="num mt-2 text-sm text-text">{label}</div>
        {has && (j.beyond || j.rp) && (j.ratio ?? 0) > 1 && (
          <div className="mt-1 text-xs text-muted">{j.beyond ? 'beyond the 2003–2022 record' : `≈ 1-in-${Math.round(j.rp!)} years`}</div>
        )}
      </figcaption>
    </figure>
  )
}
