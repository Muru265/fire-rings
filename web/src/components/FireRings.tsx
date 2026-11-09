import { arc as d3arc } from 'd3-shape'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { describe } from '../lib/describe'
import { MONTHS, VIIRS_START, key } from '../lib/series'
import type { Grid } from '../lib/series'
import type { MonthRec, ViewMode } from '../lib/types'
import { useCellNav } from '../lib/useCellNav'
import type { Cell } from '../lib/useCellNav'
import Patterns from './Patterns'
import Tooltip from './Tooltip'

const S = 640
const C = S / 2
const R0 = 62
const R1 = 278
const TAU = Math.PI * 2

interface Props {
  grid: Grid
  colorOf: (r: MonthRec) => string | null
  mode: ViewMode
  centerLabel?: string
  /** draw cells (on first mount) from the centre outward */
  drawIn?: boolean
  /** story mode: cells for which this returns false are faded */
  emphasis?: (y: number, m: number) => boolean
  active: Cell | null
  onActive: (c: Cell | null) => void
  onSelect: (c: Cell) => void
  label: string
}

/** Radial calendar: years are rings (first year at the centre), months run clockwise from 12 o'clock. */
export default function FireRings({ grid, colorOf, mode, active, onActive, onSelect, label, centerLabel, drawIn, emphasis }: Props) {
  const uid = useId().replace(/:/g, '')
  const { years, byKey } = grid
  const w = (R1 - R0) / years.length
  const last = useMemo(() => {
    const ks = [...byKey.values()]
    const r = ks[ks.length - 1]
    return { y: r.y, m: r.m }
  }, [byKey])
  const [focus, setFocus] = useState<Cell>(last)
  const [hasFocus, setHasFocus] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const arcGen = useMemo(() => d3arc<{ i: number; m: number }>()
    .innerRadius((d) => R0 + d.i * w + 0.6)
    .outerRadius((d) => R0 + (d.i + 1) * w - 0.6)
    .startAngle((d) => ((d.m - 1) / 12) * TAU)
    .endAngle((d) => (d.m / 12) * TAU)
    .padAngle(0.006)
    .padRadius(R1), [w])

  const isValid = (c: Cell) => byKey.has(key(c.y, c.m))
  const nav = useCellNav({
    years, focus, setFocus: (c) => { setFocus(c); onActive(c) }, onSelect,
    onClear: () => onActive(null), upIsLaterYear: true, isValid,
  })

  const t = active ? describe(byKey.get(key(active.y, active.m)), active.y, active.m, mode) : null
  // tooltip anchored just outside the cell, pushed radially outward so it never covers the highlighted spoke
  let tipPos: { x: number; y: number; transform: string } | null = null
  if (active) {
    const i = years.indexOf(active.y)
    const a = ((active.m - 0.5) / 12) * TAU
    const rr = R0 + (i + 1) * w + 6
    const ax = Math.sin(a) * rr
    const ay = -Math.cos(a) * rr
    const tx = ax < -20 ? 'calc(-100% - 6px)' : ax > 20 ? '6px' : '-50%'
    const ty = ay < -20 ? 'calc(-100% - 6px)' : ay > 20 ? '6px' : '-50%'
    tipPos = { x: ((C + ax) / S) * 100, y: ((C + ay) / S) * 100, transform: `translate(${tx}, ${ty})` }
  }
  const i2012 = years.indexOf(VIIRS_START)

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-[600px]" onMouseLeave={() => !hasFocus && onActive(null)}>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="block h-auto w-full select-none"
        role="grid"
        aria-label={`${label}. Fire Rings radial calendar: each ring is a year from ${years[0]} at the centre to ${years[years.length - 1]} at the edge; months run clockwise from January at the top. Use arrow keys to move, Enter to open a month.`}
        onKeyDown={nav.onKeyDown}
        onFocus={() => setHasFocus(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) { setHasFocus(false); onActive(null) }
        }}
      >
        <Patterns id={uid} />
        <g transform={`translate(${C},${C})`}>
          {years.map((y, i) => (
            <g key={y} role="row" aria-label={String(y)}
              className={drawIn ? 'ring-in' : undefined} style={drawIn ? { animationDelay: `${i * 40}ms` } : undefined}>
              {MONTHS.map((_, mi) => {
                const m = mi + 1
                const r = byKey.get(key(y, m))
                if (!r) return null
                const fill = colorOf(r) ?? `url(#${uid}-nodata)`
                const dim = (active && active.y !== y && active.m !== m) || (emphasis && !emphasis(y, m))
                const isActive = active?.y === y && active?.m === m
                const isFocus = focus.y === y && focus.m === m
                const provisional = r.flags.includes('provisional') || r.flags.includes('mtd')
                const d = arcGen({ i, m }) ?? ''
                return (
                  <g key={m}>
                    <path
                      ref={nav.register({ y, m }) as (el: SVGPathElement | null) => void}
                      d={d}
                      role="gridcell"
                      tabIndex={isFocus ? 0 : -1}
                      aria-label={describe(r, y, m, mode).aria}
                      aria-selected={isActive}
                      fill={fill}
                      opacity={dim ? 0.32 : 1}
                      stroke={provisional ? 'var(--text)' : 'none'}
                      strokeWidth={provisional ? 0.8 : 0}
                      strokeDasharray={provisional ? '1.2 1.6' : undefined}
                      className="cursor-pointer outline-none transition-opacity duration-[var(--dur-fast)]"
                      onMouseEnter={() => onActive({ y, m })}
                      onFocus={() => { setFocus({ y, m }); onActive({ y, m }) }}
                      onClick={() => { setFocus({ y, m }); onSelect({ y, m }) }}
                    />
                    {(r.flags.includes('uncertain') || r.flags.includes('terra_only')) && <path d={d} fill={`url(#${uid}-hatch)`} pointerEvents="none" />}
                  </g>
                )
              })}
            </g>
          ))}

          {/* active cell outline drawn on top */}
          {active && years.includes(active.y) && (
            <path d={arcGen({ i: years.indexOf(active.y), m: active.m }) ?? ''} fill="none" stroke="var(--text)" strokeWidth={2} pointerEvents="none" />
          )}

          {/* MODIS → VIIRS transition ring */}
          {i2012 > 0 && (
            <g pointerEvents="none" aria-hidden="true">
              <circle r={R0 + i2012 * w} fill="none" stroke="var(--text)" strokeOpacity={0.85} strokeWidth={1.2} strokeDasharray="4 3" />
            </g>
          )}

          {/* month labels */}
          {MONTHS.map((name, mi) => {
            const a = ((mi + 0.5) / 12) * TAU
            const rr = R1 + 20
            return (
              <text key={name} x={Math.sin(a) * rr} y={-Math.cos(a) * rr} textAnchor="middle" dominantBaseline="central"
                className="fill-[var(--text-muted)] font-mono text-[15px]" aria-hidden="true">
                {name}
              </text>
            )
          })}

          {/* year labels along the 12 o'clock seam */}
          {[years[0], VIIRS_START, years[years.length - 1]].filter((y) => years.includes(y)).map((y) => {
            const rr = R0 + (years.indexOf(y) + 0.5) * w
            return (
              <text key={y} x={-5} y={-rr} textAnchor="end" dominantBaseline="central" aria-hidden="true"
                className="fill-[var(--text)] font-mono text-[12px] font-medium"
                style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 3 }}>
                {y}
              </text>
            )
          })}

          {/* centre */}
          <g aria-hidden="true">
            <circle r={R0 - 6} fill="var(--surface-2)" stroke="var(--border)" />
            <text y={-8} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px] uppercase tracking-[0.12em]">
              {centerLabel ?? (mode === 'raw' ? 'Raw' : 'Harmonized')}
            </text>
            <text y={9} textAnchor="middle" className="fill-[var(--text)] font-display text-[13px] font-semibold">
              {years[0]}–{String(years[years.length - 1]).slice(2)}
            </text>
          </g>
        </g>
      </svg>
      {t && tipPos && !narrow && <Tooltip text={t} x={tipPos.x} y={tipPos.y} transform={tipPos.transform} />}
      {narrow && (
        <div className="mt-3 min-h-[76px] rounded-sm border border-border bg-surface-2 px-3 py-2 text-xs" aria-hidden="true">
          {t ? (
            <>
              <div><span className="font-display text-sm font-semibold text-text">{t.title}</span> · <span className="num text-text">{t.value}</span> <span className="text-muted">{t.unit}</span></div>
              {t.lines.map((l) => <div key={l} className="text-muted">{l}</div>)}
            </>
          ) : (
            <span className="text-faint">Tap a cell to read a month.</span>
          )}
        </div>
      )}
    </div>
  )
}
