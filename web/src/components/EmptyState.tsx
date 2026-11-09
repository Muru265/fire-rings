import type { ReactNode } from 'react'

/** Explicit "not built / no data yet" state. Never shows a number (hard rule 1). */
export default function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card border-dashed text-muted">
      <p className="font-display text-base font-semibold text-text">{title}</p>
      {children && <div className="mt-2 text-sm">{children}</div>}
    </div>
  )
}
