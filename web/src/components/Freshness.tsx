import { useMeta } from '../lib/api'

/** Round 6: data freshness line — "Updated daily · last update {date}" from meta.json (written by pipeline/daily.py). */
export default function Freshness({ className = '' }: { className?: string }) {
  const meta = useMeta()
  if (meta.status !== 'ready') return null
  const m = meta.data
  const day = (m.last_update ?? m.generated ?? '').slice(0, 10)
  return (
    <span className={className} data-testid="freshness">
      Updated daily · last update {day || "—"}
    </span>
  )
}
