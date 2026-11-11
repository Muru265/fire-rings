import { useState } from 'react'
import { downloadHotspots } from '../lib/hotspots'
import type { HotQuery } from '../lib/hotspots'

/** "Download hotspots (CSV)" for any month or range ≤31 days (P1.2). Calm message if NASA is busy. */
export default function HotspotButton({ q, label = 'Download hotspots (CSV)', primary = false }: { q: HotQuery; label?: string; primary?: boolean }) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null })
  const name = `fire-rings_hotspots_${q.region}${q.bbox ? '_box' : ''}_${q.start}_to_${q.end}.csv`
  return (
    <span className="inline-flex flex-col gap-1">
      <button data-testid="hotspot-download" disabled={state.busy}
        onClick={async () => { setState({ busy: true, msg: null }); const msg = await downloadHotspots(q, name); setState({ busy: false, msg }) }}
        title="Every filtered satellite detection (MODIS + VIIRS) for these dates, from NASA FIRMS — same filters as the record. Up to 31 days per download."
        className={`rounded-sm px-3 py-1.5 text-xs disabled:opacity-60 ${primary ? 'bg-accent font-semibold text-bg hover:brightness-110' : 'border border-border-strong text-text hover:bg-surface-2'}`}>
        {state.busy ? 'Fetching from NASA FIRMS…' : label}
      </button>
      {state.msg && <span role="status" className="max-w-xs text-[11px] text-warn" data-testid="hotspot-msg">{state.msg}</span>}
    </span>
  )
}
