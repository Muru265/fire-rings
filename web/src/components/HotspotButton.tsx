import { useState } from 'react'
import { DOWNLOAD_MAX_DAYS, daysIn, downloadHotspots } from '../lib/hotspots'
import type { HotQuery } from '../lib/hotspots'

/** "Download hotspots (CSV)": raw NASA FIRMS detections (MODIS + VIIRS, record filters) for the selected range and area,
 *  fetched server-side (P1.2; Round 8: readable columns, up to 62 days in ≤31-day chunks, explicit truncation notice). */
export default function HotspotButton({ q, label = 'Download hotspots (CSV)', primary = false }: { q: HotQuery; label?: string; primary?: boolean }) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null })
  const name = `fire-rings_hotspots_${q.region}${q.bbox ? '_box' : ''}_${q.start}_to_${q.end}.csv`
  const days = daysIn(q)
  const tooLong = days > DOWNLOAD_MAX_DAYS
  return (
    <span className="inline-flex flex-col gap-1">
      <button data-testid="hotspot-download" disabled={state.busy || tooLong}
        onClick={async () => { setState({ busy: true, msg: null }); const msg = await downloadHotspots(q, name, 'download'); setState({ busy: false, msg }) }}
        title={`Raw satellite detections (MODIS + VIIRS) from NASA FIRMS, ${q.start} to ${q.end}${q.bbox ? ', your box' : ''} — not harmonized. Up to ${DOWNLOAD_MAX_DAYS} days per download.`}
        className={`rounded-sm px-3 py-1.5 text-xs disabled:opacity-60 ${primary ? 'bg-accent font-semibold text-bg hover:brightness-110' : 'border border-border-strong text-text hover:bg-surface-2'}`}>
        {state.busy ? 'Fetching from NASA FIRMS…' : label}
      </button>
      {tooLong && <span className="max-w-xs text-[11px] text-muted" data-testid="hotspot-toolong">Hotspot CSV: choose at most {DOWNLOAD_MAX_DAYS} days ({days} selected) — NASA FIRMS limits.</span>}
      {state.msg && <span role="status" className="max-w-xs text-[11px] text-warn" data-testid="hotspot-msg">{state.msg}</span>}
    </span>
  )
}
