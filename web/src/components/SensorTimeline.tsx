import { scaleLinear } from 'd3-scale'
import { useWidth } from '../lib/useWidth'

// Data spans as delivered by NASA FIRMS (docs/data_inventory.md); drift onsets per NASA Terra/Aqua mission pages.
const ROWS = [
  { id: 'Terra', sensor: 'MODIS', from: 2000 + 10 / 12, to: 2026 + 10.25 / 12, drift: 2020, note: 'orbit drifting since 2020' },
  { id: 'Aqua', sensor: 'MODIS', from: 2002 + 6 / 12, to: 2026 + 10.25 / 12, drift: 2021 + 11 / 12, note: 'drifting since Dec 2021' },
  { id: 'Suomi-NPP', sensor: 'VIIRS', from: 2012 + 0.6 / 12, to: 2026 + 10.06 / 12, drift: null, note: 'data ended Nov 2026', ended: true },
  { id: 'NOAA-20', sensor: 'VIIRS', from: 2018 + 3 / 12, to: 2026 + 10.25 / 12, drift: null, note: 'carries the record on' },
  { id: 'NOAA-21', sensor: 'VIIRS', from: 2023 + 2 / 12, to: 2026 + 10.25 / 12, drift: null, note: 'cross-check' },
]
const C = { MODIS: '#3B8FCC', VIIRS: '#D97706' }

export default function SensorTimeline({ compact }: { compact?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const rowH = compact ? 22 : 30
  const M = { t: 26, r: 12, b: 22, l: compact ? 76 : 96 }
  const H = M.t + ROWS.length * rowH + M.b
  const x = scaleLinear().domain([2000, 2027]).range([M.l, w - M.r])
  const narrow = w < 560
  return (
    <figure ref={ref} aria-label="Satellite timeline: Terra MODIS from Nov 2000 (drifting since 2020), Aqua MODIS from Jul 2002 (drifting since Dec 2021), Suomi-NPP VIIRS Jan 2012 to Nov 2026, NOAA-20 VIIRS from Apr 2018, NOAA-21 VIIRS from Mar 2023. Calibration window Jul 2012 to Dec 2019.">
      <svg width={w} height={H} aria-hidden="true">
        <defs>
          <pattern id="drift-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect x={x(2012.5)} y={M.t - 6} width={x(2020) - x(2012.5)} height={H - M.t - M.b + 6} fill="var(--surface-3)" opacity={0.6} rx={4} />
        <text x={(x(2012.5) + x(2020)) / 2} y={M.t - 10} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px]">calibration window</text>
        {[2000, 2005, 2010, 2015, 2020, 2025].map((y) => (
          <g key={y}>
            <line x1={x(y)} x2={x(y)} y1={M.t - 4} y2={H - M.b} stroke="var(--border)" />
            <text x={x(y)} y={H - 6} textAnchor="middle" className="fill-[var(--text-faint)] font-mono text-[10px]">{y}</text>
          </g>
        ))}
        {ROWS.map((r, i) => {
          const y = M.t + i * rowH + rowH / 2
          const bh = compact ? 8 : 10
          return (
            <g key={r.id}>
              <text x={M.l - 8} y={y} dy="0.32em" textAnchor="end" className="fill-[var(--text)] text-[11px]">{r.id}</text>
              <rect x={x(r.from)} y={y - bh / 2} width={x(r.to) - x(r.from)} height={bh} rx={bh / 2} fill={C[r.sensor as 'MODIS' | 'VIIRS']} />
              {r.drift && <rect x={x(r.drift)} y={y - bh / 2} width={x(r.to) - x(r.drift)} height={bh} fill="url(#drift-hatch)" />}
              {r.ended && <circle cx={x(r.to)} cy={y} r={bh / 2 + 2} fill="var(--bg)" stroke={C.VIIRS} strokeWidth={2} />}
              {!compact && !narrow && (
                <text x={x(r.from) + 6} y={y - bh / 2 - 3} className="fill-[var(--text-faint)] text-[9px]">{r.sensor} · {r.note}</text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: C.MODIS }} />MODIS (1 km)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: C.VIIRS }} />VIIRS (375 m)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.6) 0 1.5px, #3B8FCC 1.5px 4px)' }} />orbit drift</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: C.VIIRS }} />data delivery ended</span>
      </figcaption>
    </figure>
  )
}
