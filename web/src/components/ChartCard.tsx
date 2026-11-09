import { useState } from 'react'
import type { ReactNode } from 'react'

export interface TableSpec {
  caption: string
  columns: string[]
  rows: (string | number | null)[][]
}

/** Card with a title and a "View as table" toggle (every chart has a table twin). */
export default function ChartCard({ title, subtitle, table, children, actions, id }: {
  title: string; subtitle?: ReactNode; table: TableSpec; children: ReactNode; actions?: ReactNode; id?: string
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className="card min-w-0" aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id ? `${id}-h` : undefined} className="font-display text-lg font-semibold">{title}</h2>
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
      {asTable ? <DataTable spec={table} /> : children}
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
