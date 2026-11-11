import { useState } from 'react'
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
  const years: number[] = []
  for (let y = first.y; y <= last.y; y++) years.push(y)
  const from = range?.from ?? first, to = range?.to ?? last
  const [note, setNote] = useState<string | null>(null)
  // #80: keep From ≤ To (swap) and inside the record (clamp), with a short note saying what happened
  const set = (f: YM, t: YM) => {
    const notes: string[] = []
    const clamp = (a: YM) => {
      if (ymKey(a) < ymKey(first)) { notes.push(`the record starts ${lab(first)}`); return first }
      if (ymKey(a) > ymKey(last)) { notes.push(`the record ends ${lab(last)}`); return last }
      return a
    }
    f = clamp(f); t = clamp(t)
    if (ymKey(f) > ymKey(t)) { [f, t] = [t, f]; notes.push('From was after To, so they were swapped') }
    setNote(notes.length ? `${notes.join('; ')}.` : null)
    onChange(ymKey(f) === ymKey(first) && ymKey(t) === ymKey(last) ? null : { from: f, to: t })
  }
  const cls = 'num rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-xs text-text'
  const sel = (id: string, label: string, v: YM, onPick: (x: YM) => void) => (
    <fieldset className="flex items-center gap-1.5 text-xs text-muted" data-testid={id}>
      <legend className="float-left mr-1">{label}</legend>
      <select aria-label={`${label} month`} data-testid={`${id}-month`} value={v.m} onChange={(e) => onPick({ y: v.y, m: Number(e.target.value) })} className={cls}>
        {MONTHS.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
      </select>
      <select aria-label={`${label} year`} data-testid={`${id}-year`} value={v.y} onChange={(e) => onPick({ y: Number(e.target.value), m: v.m })} className={cls}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </fieldset>
  )
  // quick picks from the data: the last 12 months, the latest season-year (Jul–Jun) and the busiest month of the record
  const presets: [string, Range][] = []
  const k12 = Math.max(ymKey(first), ymKey(last) - 11)
  presets.push(['Last 12 months', { from: fromKey(k12), to: last }])
  const ly = last.m >= 6 ? last.y : last.y - 1
  if (ymKey({ y: ly - 1, m: 7 }) >= ymKey(first)) presets.push([`Jul ${ly - 1} – Jun ${ly}`, { from: { y: ly - 1, m: 7 }, to: { y: ly, m: 6 } }])
  if (ymKey({ y: last.y - 1, m: 1 }) >= ymKey(first)) presets.push([`Year ${last.y - 1}`, { from: { y: last.y - 1, m: 1 }, to: { y: last.y - 1, m: 12 } }])
  // #80: the region's top-ranked Jul–Jun season in the published validation (V9); named only when the app already sources the name
  const v9 = doc.validation?.v9 as { top3_harmonized?: string[]; known_event?: { event: string; season_start: number } } | undefined
  const top = v9?.top3_harmonized?.[0] ? Number(v9.top3_harmonized[0].slice(0, 4)) : null
  if (top != null && ymKey({ y: top, m: 7 }) >= ymKey(first) && ymKey({ y: top + 1, m: 6 }) <= ymKey(last)) {
    // #91: "2019–20 season (Black Summer)" + the Jul–Jun range in small text ('|' separates label and small text)
    const named = v9?.known_event?.season_start === top ? ` (${v9.known_event.event.split(',')[0].replace(/ bushfires$/, '')})` : ''
    presets.push([`Biggest season on record: ${top}–${String(top + 1).slice(2)} season${named}|Jul ${top} – Jun ${top + 1}`, { from: { y: top, m: 7 }, to: { y: top + 1, m: 6 } }])
  }

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
          <button key={l} onClick={() => { setNote(null); onChange(r) }} data-testid={l.startsWith('Biggest') ? 'preset-biggest' : undefined} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted hover:text-text">
            {l.split('|')[0]}{l.includes('|') && <span className="ml-1 text-[10px] text-faint">{l.split('|')[1]}</span>}</button>
        ))}
      </div>
      {note && <p className="mt-2 text-[11px] text-accent-2" data-testid="range-note" role="status">{note}</p>}
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
