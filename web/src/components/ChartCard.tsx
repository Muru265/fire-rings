import { useState } from 'react'
import type { ReactNode } from 'react'
import Help from './Help'
import { useFigure } from '../lib/figureCtx'

export interface TableSpec {
  caption: string
  columns: string[]
  rows: (string | number | null)[][]
}

/** Card with a title and a "View as table" toggle (every chart has a table twin). */
export default function ChartCard({ title, subtitle, table, children, actions, id, help }: {
  title: string; subtitle?: ReactNode; table: TableSpec; children: ReactNode; actions?: ReactNode; id?: string
  /** guide entry id for the ⓘ next to the title (QA #9) */
  help?: string
}) {
  const [asTable, setAsTable] = useState(false)
  const bare = useFigure()
  if (bare) return <div className="min-w-0" data-figure-chart={id}>{children}</div>
  return (
    <section className="card min-w-0" aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id ? `${id}-h` : undefined} className="font-display text-lg font-semibold">{title}{help && <Help id={help} label={title} />}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
            className="rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2">
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        </div>
      </div>
      {/* keep the chart mounted (hidden) while the table shows, so it never re-measures at the wrong width (QA #12) */}
      <div hidden={asTable} data-chart-body>{children}</div>
      {asTable && <DataTable spec={table} />}
    </section>
  )
}

export function DataTable({ spec }: { spec: TableSpec }) {
  return (
    <div className="max-h-[480px] overflow-auto rounded-sm border border-border">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">{spec.caption}</caption>
        <thead className="sticky top-0 bg-surface-2">
          <tr>{spec.columns.map((c, i) => (
            <th key={c} scope="col" className={`px-2 py-1.5 font-mono font-medium text-muted ${i ? 'text-right' : 'text-left'}`}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {spec.rows.map((r, ri) => (
            <tr key={ri} className="border-t border-border">
              {r.map((v, i) => i === 0
                ? <th key={i} scope="row" className="num px-2 py-1 text-left font-normal text-muted">{v}</th>
                : <td key={i} className="num px-2 py-1 text-right text-text">{v ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
