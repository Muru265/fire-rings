import { fmtInt } from '../lib/format'
import { agoText } from '../lib/live'
import type { LiveData } from '../lib/live'

/** "LIVE · Last satellite pass X h ago · N detections in 72 h" — near-real-time, provisional, never in the record. */
export default function LiveBadge({ live, compact }: { live: LiveData | null; compact?: boolean }) {
  if (!live) {
    return <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-faint" aria-live="polite">LIVE · checking FIRMS…</span>
  }
  if (!live.ok) {
    return <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-faint" title={live.error}>LIVE · feed temporarily unavailable</span>
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-accent-2/40 bg-accent-2/10 px-3 py-1 text-xs text-accent-2"
      title="Near-real-time VIIRS NOAA-20/21 from NASA FIRMS, provisional, filtered like the record. Not part of the harmonized numbers.">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-2 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-2" />
      </span>
      <span><strong>LIVE</strong>{compact ? '' : ' ·'} {compact ? '' : `Last satellite pass ${agoText(live.last_acq_utc)} · `}<span className="num">{fmtInt(live.count)}</span> detections in 72 h</span>
    </span>
  )
}
