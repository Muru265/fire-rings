import { fmtInt } from '../lib/format'
import { MONTHS, key, valueOf } from '../lib/series'
import type { Grid } from '../lib/series'
import type { ViewMode } from '../lib/types'

/** Accessible table twin of the calendar charts. */
export default function CalendarTable({ grid, mode, caption }: { grid: Grid; mode: ViewMode; caption: string }) {
  return (
    <div className="max-h-[560px] overflow-auto rounded-sm border border-border">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-mono font-medium text-muted">Year</th>
            {MONTHS.map((m) => (
              <th key={m} scope="col" className="px-2 py-1.5 text-right font-mono font-medium text-muted">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.years.map((y) => (
            <tr key={y} className="border-t border-border">
              <th scope="row" className="num px-2 py-1 text-left text-muted">{y}</th>
              {MONTHS.map((_, mi) => {
                const r = grid.byKey.get(key(y, mi + 1))
                const v = r ? valueOf(r, mode) : null
                const mark = r?.flags.includes('provisional') || r?.flags.includes('mtd') ? '*' : ''
                return (
                  <td key={mi} className="num px-2 py-1 text-right text-text">
                    {r ? (v == null ? <span className="text-faint">n/a</span> : `${fmtInt(v)}${mark}`) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2 py-2 text-xs text-faint">* provisional or month to date · n/a = no data or insufficient satellite coverage</p>
    </div>
  )
}
