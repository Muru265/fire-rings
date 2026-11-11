import { fmtInt, fmtRatio } from '../lib/format'
import { fromKey, rangeLength, summarizeRange, ymKey } from '../lib/range'
import type { Range, YM } from '../lib/range'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'
import { unitOf } from '../lib/mode'
import Help from './Help'
import HotspotButton from './HotspotButton'
import { monthRange } from '../lib/hotspots'
import type { Box } from '../lib/hotspots'

const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }
const lab = (a: YM) => `${MONTHS[a.m - 1]} ${a.y}`

/** P1.1: From / To month selector + a summary of the chosen range. Default = the full record (no filter). */
export default function RangeCard({ doc, range, onChange, boxed, box }: { doc: RegionDoc; range: Range | null; onChange: (r: Range | null) => void; boxed: boolean; box?: Box | null }) {
  const first = doc.months[0], last = doc.months[doc.months.length - 1]
  const opts: YM[] = []
  for (let k = ymKey(first); k <= ymKey(last); k++) opts.push(fromKey(k))
  const from = range?.from ?? first, to = range?.to ?? last
  const set = (f: YM, t: YM) => {
    if (ymKey(f) > ymKey(t)) [f, t] = [t, f]
    onChange(ymKey(f) === ymKey(first) && ymKey(t) === ymKey(last) ? null : { from: f, to: t })
  }
  const sel = (id: string, label: string, v: YM, onPick: (x: YM) => void) => (
    <label className="flex items-center gap-2 text-xs text-muted" htmlFor={id}>{label}
      <select id={id} data-testid={id} value={ymKey(v)} onChange={(e) => onPick(fromKey(Number(e.target.value)))}
        className="num rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-xs text-text">
        {opts.map((o) => <option key={ymKey(o)} value={ymKey(o)}>{lab(o)}</option>)}
      </select>
    </label>
  )
  // quick picks from the data: the last 12 months, the latest season-year (Jul–Jun) and the busiest month of the record
  const presets: [string, Range][] = []
  const k12 = Math.max(ymKey(first), ymKey(last) - 11)
  presets.push(['Last 12 months', { from: fromKey(k12), to: last }])
  const ly = last.m >= 6 ? last.y : last.y - 1
  if (ymKey({ y: ly - 1, m: 7 }) >= ymKey(first)) presets.push([`Jul ${ly - 1} – Jun ${ly}`, { from: { y: ly - 1, m: 7 }, to: { y: ly, m: 6 } }])
  if (ymKey({ y: last.y - 1, m: 1 }) >= ymKey(first)) presets.push([`Year ${last.y - 1}`, { from: { y: last.y - 1, m: 1 }, to: { y: last.y - 1, m: 12 } }])

  const s = range ? summarizeRange(doc, range) : null
  const unit = unitOf(doc)
  return (
    <section className="card" aria-labelledby="range-h" data-testid="range-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="range-h" className="font-display text-lg font-semibold">Date range<Help id="date-range" /></h2>
        <div className="flex flex-wrap items-center gap-3">
          {sel('range-from', 'From', from, (f) => set(f, to))}
          {sel('range-to', 'To', to, (t) => set(from, t))}
          {range && <button onClick={() => onChange(null)} data-testid="range-reset" className="rounded-sm border border-border-strong px-3 py-1 text-xs text-text hover:bg-surface-2">Full record</button>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map(([l, r]) => (
          <button key={l} onClick={() => onChange(r)} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted hover:text-text">{l}</button>
        ))}
      </div>
      {!s ? (
        <p className="mt-3 text-sm text-muted">Showing the full record, {lab(first)} – {lab(last)}. Pick a From and To month to total a season, a year or any stretch — the rings, calendar, annual bars and CSV/PNG exports follow the range.</p>
      ) : (
        <div className="mt-4" data-testid="range-summary">
          <p className="text-sm text-muted"><span className="text-text">{lab(range!.from)} – {lab(range!.to)}</span> · {rangeLength(range!)} month{rangeLength(range!) > 1 ? 's' : ''}{boxed ? ' · your box' : ''}{s.provisional ? ' · includes provisional months' : ''}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-sm bg-surface-2 px-3 py-2">
              <dt className="text-[11px] text-faint">Total fire-days</dt>
              <dd className="num text-xl text-text" data-testid="range-total">{fmtInt(s.total)}</dd>
            </div>
            <div className="rounded-sm bg-surface-2 px-3 py-2">
              <dt className="text-[11px] text-faint">Typical for these months</dt>
              <dd className="num text-xl text-text" data-testid="range-typical">{s.typical == null ? '—' : fmtInt(s.typical)}</dd>
              {s.ratio != null && <dd className="text-[11px] text-muted"><span className="num">{fmtRatio(s.ratio)}</span> typical</dd>}
            </div>
            <div className="rounded-sm bg-surface-2 px-3 py-2">
              <dt className="text-[11px] text-faint">Busiest month</dt>
              <dd className="num text-xl text-text" data-testid="range-busiest">{s.busiest ? `${MONTHS[s.busiest.m - 1]} ${s.busiest.y}` : '—'}</dd>
              {s.busiest && <dd className="text-[11px] text-muted"><span className="num">{fmtInt(s.busiest.H)}</span> fire-days</dd>}
            </div>
            <div className="rounded-sm bg-surface-2 px-3 py-2">
              <dt className="text-[11px] text-faint">Rank of these months</dt>
              {s.rank
                ? <><dd className="num text-xl text-text" data-testid="range-rank">{ord(s.rank.rank)} of {s.rank.of}</dd>
                  <dd className="text-[11px] text-muted">same months, {s.rank.firstY}–{s.rank.lastY}, 1st = most fire</dd></>
                : <dd className="text-[11px] text-muted" data-testid="range-rank">{s.rankNote}</dd>}
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-faint">
            {unit}. “Typical” = sum of each month’s {doc.baseline[0]}–{doc.baseline[1]} median{boxed ? ' for this box' : ''}.
            {s.withData < s.months ? ` ${s.months - s.withData} month(s) without data are left out of the totals.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            {rangeLength(range!) === 1
              ? <HotspotButton q={{ region: doc.id, ...monthRange(range!.from.y, range!.from.m), bbox: boxed ? box : null }} />
              : <span className="text-[11px] text-faint">Hotspot CSV (every detection): pick a single month — NASA FIRMS serves up to 31 days per download.</span>}
          </div>
        </div>
      )}
    </section>
  )
}
