import { useId, useMemo, useState } from 'react'
import { describe } from '../lib/describe'
import { fmtCompact } from '../lib/format'
import { MONTH_INITIALS, MONTHS, VIIRS_START, key, valueOf } from '../lib/series'
import type { Grid } from '../lib/series'
import type { ClassScale } from '../lib/scales'
import type { ViewMode } from '../lib/types'
import { useCellNav } from '../lib/useCellNav'
import type { Cell } from '../lib/useCellNav'
import Tooltip from './Tooltip'

interface Props {
  grid: Grid
  scale: ClassScale
  mode: ViewMode
  active: Cell | null
  onActive: (c: Cell | null) => void
  onSelect: (c: Cell) => void
  label: string
}

/** Year × month grid. Rows are years (oldest at top); last column is the year total of the shown series. */
export default function GridCalendar({ grid, scale, mode, active, onActive, onSelect, label }: Props) {
  const uid = useId().replace(/:/g, '')
  const { years, byKey } = grid
  const last = useMemo(() => {
    const ks = [...byKey.values()]
    return { y: ks[ks.length - 1].y, m: ks[ks.length - 1].m }
  }, [byKey])
  const [focus, setFocus] = useState<Cell>(last)
  const nav = useCellNav({
    years, focus, setFocus: (c) => { setFocus(c); onActive(c) }, onSelect,
    onClear: () => onActive(null), upIsLaterYear: false, isValid: (c) => byKey.has(key(c.y, c.m)),
  })

  const totals = useMemo(() => years.map((y) => {
    let sum = 0
    let complete = true
    for (let m = 1; m <= 12; m++) {
      const r = byKey.get(key(y, m))
      const v = r ? valueOf(r, mode) : null
      if (v == null || r?.flags.includes('mtd')) complete = false
      if (v != null) sum += v
    }
    return { y, sum, complete }
  }), [years, byKey, mode])

  const t = active ? describe(byKey.get(key(active.y, active.m)), active.y, active.m, mode) : null
  const row = active ? years.indexOf(active.y) : -1

  return (
    <div className="relative" onMouseLeave={() => onActive(null)}>
      <div
        role="grid"
        aria-label={`${label}. Grid calendar: rows are years ${years[0]}–${years[years.length - 1]}, columns are months, last column is the year total.`}
        aria-rowcount={years.length + 1}
        onKeyDown={nav.onKeyDown}
        className="grid gap-[2px] text-[11px]"
        style={{ gridTemplateColumns: '2.6rem repeat(12, minmax(0, 1fr)) 3.2rem' }}
      >
        <div role="row" className="contents">
          <div role="columnheader" className="text-faint" />
          {MONTHS.map((mn, i) => (
            <div key={mn} role="columnheader" aria-label={mn} className="pb-1 text-center font-mono text-faint">
              {MONTH_INITIALS[i]}
            </div>
          ))}
          <div role="columnheader" className="pb-1 text-right font-mono text-faint">Year</div>
        </div>
        {years.map((y, yi) => (
          <div key={y} role="row" className="contents">
            <div role="rowheader" className={`num flex items-center pr-1 text-[11px] ${active?.y === y ? 'text-text' : 'text-muted'}`}
              style={y === VIIRS_START ? { boxShadow: 'inset 0 1.5px 0 0 var(--text-muted)' } : undefined}>
              {y}
            </div>
            {MONTHS.map((_, mi) => {
              const m = mi + 1
              const r = byKey.get(key(y, m))
              if (!r) return <div key={m} role="gridcell" aria-label={`${MONTHS[mi]} ${y}: outside record`} />
              const v = valueOf(r, mode)
              const color = scale.colorOf(v)
              const provisional = r.flags.includes('provisional') || r.flags.includes('mtd')
              const isFocus = focus.y === y && focus.m === m
              const dim = active && active.y !== y && active.m !== m
              return (
                <div
                  key={m}
                  ref={nav.register({ y, m }) as (el: HTMLDivElement | null) => void}
                  role="gridcell"
                  tabIndex={isFocus ? 0 : -1}
                  aria-label={describe(r, y, m, mode).aria}
                  aria-selected={active?.y === y && active?.m === m}
                  onMouseEnter={() => onActive({ y, m })}
                  onFocus={() => { setFocus({ y, m }); onActive({ y, m }) }}
                  onClick={() => { setFocus({ y, m }); onSelect({ y, m }) }}
                  className={`relative h-[18px] cursor-pointer rounded-[3px] transition-opacity duration-[var(--dur-fast)] ${dim ? 'opacity-35' : ''} ${active?.y === y && active?.m === m ? 'ring-2 ring-text' : ''}`}
                  style={{
                    background: color ?? `repeating-linear-gradient(45deg, var(--border-strong) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, var(--border-strong) 0 1px, transparent 1px 4px)`,
                    outline: provisional ? '1px dotted var(--text)' : undefined,
                    outlineOffset: provisional ? '-1px' : undefined,
                    boxShadow: [color === 'var(--zero)' ? 'inset 0 0 0 1px var(--border)' : '', y === VIIRS_START ? '0 -2px 0 0 var(--bg), 0 -3.5px 0 0 var(--text-muted)' : '']
                      .filter(Boolean).join(', ') || undefined,
                  }}
                >
                  {r.flags.includes('uncertain') && (
                    <span className="absolute inset-0 rounded-[3px]" style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 1.4px, transparent 1.4px 5px)' }} />
                  )}
                </div>
              )
            })}
            <div role="gridcell" aria-label={`${y} total: ${fmtCompact(totals[yi].sum)}${totals[yi].complete ? '' : ' (incomplete year)'}`}
              className={`num flex items-center justify-end text-[11px] ${active?.y === y ? 'text-text' : 'text-muted'}`}>
              {totals[yi].complete ? '' : '~'}{fmtCompact(totals[yi].sum)}
            </div>
          </div>
        ))}
      </div>
      {t && row >= 0 && active && (
        <Tooltip text={t} x={((2.6 * 16 + ((active.m - 0.5) / 12) * 100) / (2.6 * 16 + 100 + 3.2 * 16)) * 100}
          y={((row + 1) / (years.length + 1)) * 100}
          transform={`translate(${active.m <= 3 ? '-12px' : active.m >= 10 ? 'calc(-100% + 12px)' : '-50%'}, ${row < 6 ? '14px' : 'calc(-100% - 14px)'})`} />
      )}
      <p id={`${uid}-note`} className="mt-3 text-xs text-faint">
        Line above {VIIRS_START}: MODIS → VIIRS. "~" = incomplete year (missing or partial months).
      </p>
    </div>
  )
}
