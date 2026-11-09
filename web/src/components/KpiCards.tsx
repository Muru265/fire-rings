import type { ReactNode } from 'react'
import { fmtInt, fmtRatio } from '../lib/format'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'
import CountUp from './CountUp'

function Card({ label, value, sub, badge }: { label: string; value: ReactNode; sub: string; badge?: string }) {
  return (
    <div className="card flex flex-col gap-1 !p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow !text-[11px]">{label}</span>
        {badge && <span className="rounded-full border border-border-strong px-1.5 py-px font-mono text-[10px] text-muted">{badge}</span>}
      </div>
      <span className="font-display text-2xl font-semibold text-text">{value}</span>
      <span className="text-xs text-muted">{sub}</span>
    </div>
  )
}

/** Four KPIs. Values are read from the region JSON or summed from it; nothing is estimated here. */
export default function KpiCards({ doc }: { doc: RegionDoc }) {
  const lt = doc.latest
  const clim = doc.climatology
  const ly = lt?.y ?? doc.months[doc.months.length - 1].y
  const lastFull = lt?.mtd ? (lt.m - 1) : (lt?.m ?? 12)
  let ytd = 0
  let ytdMed = 0
  let ytdOk = clim != null && lastFull >= 1
  for (let m = 1; m <= lastFull; m++) {
    const r = doc.months.find((x) => x.y === ly && x.m === m)
    if (!r || r.H == null || !clim) { ytdOk = false; break }
    ytd += r.H
    ytdMed += clim.median[m - 1]
  }
  const peakM = clim ? clim.median.indexOf(Math.max(...clim.median)) + 1 : null
  const yearRecs = doc.months.filter((x) => x.y === ly && x.H != null)
  const thisPeak = yearRecs.length ? yearRecs.reduce((a, b) => ((b.H ?? 0) > (a.H ?? 0) ? b : a)) : null
  const q = doc.quality

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card
        label="This month"
        value={lt?.value != null ? <CountUp value={lt.value} format={fmtInt} /> : '—'}
        sub={lt ? `${MONTHS[lt.m - 1]} ${lt.y}${lt.mtd ? ` · days 1–${lt.days}` : ''} · 90% ${fmtInt(lt.lo)}–${fmtInt(lt.hi)} fire-days` : 'no data'}
        badge={lt?.provisional ? 'provisional' : undefined}
      />
      <Card
        label="Year to date"
        value={ytdOk && ytdMed > 0 ? <CountUp value={ytd / ytdMed} format={fmtRatio} /> : '—'}
        sub={ytdOk ? `Jan–${MONTHS[lastFull - 1]} ${ly}: ${fmtInt(ytd)} vs typical ${fmtInt(ytdMed)} fire-days` : 'not enough complete months'}
      />
      <Card
        label="Peak month"
        value={peakM ? MONTHS[peakM - 1] : '—'}
        sub={peakM && clim ? `typical median ${fmtInt(clim.median[peakM - 1])} fire-days${thisPeak ? ` · ${ly} peak: ${MONTHS[thisPeak.m - 1]}` : ''}` : ''}
      />
      <Card
        label="Static sources removed"
        value={q ? <CountUp value={q.masked_static_total} format={fmtInt} /> : '—'}
        sub={q ? `${((100 * q.masked_static_total) / q.rows_unified).toFixed(1)}% of detections (flares, kilns, industry) · ${fmtInt(q.dropped_low_conf)} low-confidence dropped` : ''}
      />
    </div>
  )
}
