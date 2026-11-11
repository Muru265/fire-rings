import { useEffect, useState } from 'react'
import { runTool } from '../../api/tools'
import { fetchJson } from '../lib/api'
import type { Answer } from '../lib/ask'
import { toDetail } from '../lib/detail'
import { fmtCompact, fmtInt } from '../lib/format'
import { REGIONS } from '../lib/regions'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'
import Help from './Help'
import { formatNumbersInText } from '../../api/_lib/numfmt'

const TOOL_LABEL: Record<string, string> = {
  list_regions: 'List regions', get_month: 'Month vs typical', get_year_total: 'Year total', get_typical: 'Typical month',
  compare_years: 'Compare years', get_season: 'Seasonal cycle', get_rankings: 'Rankings', get_similar_years: 'Similar years', get_quality: 'Reliability',
}
const SKIP = new Set(['region', 'unit', 'caveats', 'flags', 'note', 'raw_hotspots', 'typical_by_month', 'last_complete_month'])
const label = (k: string) => k.replace(/_/g, ' ').replace(/\b90\b/, '90%')
// QA #62: years and months are never thousands-separated ("2015", not "2,015")
const isYearKey = (k: string) => /(^|_)(year|years|month|months|y|m|year1|year2)($|_)/.test(k)
const val =(v: unknown, key = ''): string | null => {
  if (v == null || v === false) return v === false ? 'no' : null
  if (typeof v === 'number') return isYearKey(key) ? String(v) : Math.abs(v) >= 100 ? fmtInt(v) : String(v)
  if (typeof v === 'string') return v
  if (v === true) return 'yes'
  if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')) return `${val(v[0], key)}–${val(v[1], key)}`
  return null
}

/** Rows "metric · value · source" from a tool result (QA #57). Arrays of years become "year: value" rows. */
function rowsOf(tool: string, region: string, r: Record<string, unknown>): [string, string, string][] {
  const src = `${TOOL_LABEL[tool] ?? tool} · regions/${region}.json`
  const out: [string, string, string][] = []
  for (const [k, v] of Object.entries(r)) {
    if (SKIP.has(k)) continue
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      for (const x of (v as Record<string, unknown>[]).slice(0, 5)) {
        const name = x.year ?? x.y ?? x.month
        const n = x.fire_days ?? x.median ?? x.similarity_pct
        if (name != null && n != null) out.push([`${label(k)}: ${name}`, val(n) ?? '', src])
      }
      continue
    }
    const s = val(v, k)
    if (s != null && s.length < 90) out.push([label(k), s, src])
  }
  return out.slice(0, 14)
}

/** A small chart built from the same published data the answer used (QA #57). */
function MiniVisual({ a, doc }: { a: Answer; doc: RegionDoc }) {
  const tools = a.trace.map((t) => t.tool)
  const years = [...new Set(a.trace.flatMap((t) => [t.args.year, t.args.year1, t.args.year2].map(Number)).filter((y) => Number.isFinite(y) && y > 1990))]
  if (tools.includes('get_rankings') || tools.includes('get_year_total') || tools.includes('compare_years')) {
    const data = doc.annual.filter((x) => x.complete && x.rankable !== false && x.H != null)
    if (!data.length) return null
    const hiYear = years.length ? years : [[...data].sort((p, q) => q.H! - p.H!)[0].y]
    const mx = Math.max(...data.map((d) => d.H!))
    return (
      <figure className="mt-3" data-testid="answer-visual">
        <div className="flex h-16 items-end gap-[2px]" role="img" aria-label={`Annual fire-days, highlighted ${hiYear.join(', ')}`}>
          {data.map((d) => <span key={d.y} title={`${d.y}: ${fmtInt(d.H)}`} className="flex-1 rounded-t-[2px]" style={{ height: `${(100 * d.H!) / mx}%`, background: hiYear.includes(d.y) ? 'var(--accent)' : 'var(--surface-3)' }} />)}
        </div>
        <figcaption className="mt-1 flex justify-between text-[10px] text-faint"><span>{data[0].y}</span><span>Annual fire-days · highlighted {hiYear.join(', ')}</span><span>{data.at(-1)!.y}</span></figcaption>
      </figure>
    )
  }
  if (tools.includes('get_season') || tools.includes('get_typical') || tools.includes('get_month')) {
    const c = doc.climatology
    if (!c) return null
    const mArg = a.trace.map((t) => Number(t.args.month)).find((m) => m >= 1 && m <= 12)
    const peak = c.median.indexOf(Math.max(...c.median)) + 1
    const hi = mArg ?? peak
    const mx = Math.max(...c.p90)
    return (
      <figure className="mt-3" data-testid="answer-visual">
        <div className="flex h-16 items-end gap-1" role="img" aria-label={`Typical fire-days by month, highlighted ${MONTHS[hi - 1]}`}>
          {c.median.map((v, i) => <span key={i} title={`${MONTHS[i]}: typical ${fmtInt(v)}`} className="flex-1 rounded-t-[2px]" style={{ height: `${Math.max(2, (100 * v) / mx)}%`, background: i + 1 === hi ? 'var(--accent)' : 'var(--surface-3)' }} />)}
        </div>
        <figcaption className="mt-1 flex justify-between text-[10px] text-faint"><span>Jan</span><span>Typical month ({doc.baseline[0]}–{doc.baseline[1]}) · {MONTHS[hi - 1]} highlighted · max {fmtCompact(Math.max(...c.median))}</span><span>Dec</span></figcaption>
      </figure>
    )
  }
  return null
}

function followUps(a: Answer): string[] {
  const t = a.trace.map((x) => x.tool)
  if (t.includes('get_rankings')) return ['Which complete year had the fewest fire-days?', 'When does the season peak?', 'How reliable is this?']
  if (t.includes('get_month')) return ['When does the season peak?', 'Worst year on record?', 'Which years look most like this year?']
  if (t.includes('get_season') || t.includes('get_typical')) return ['Is this month unusual?', 'Worst year on record?']
  if (t.includes('get_quality')) return ['Is this month unusual?', 'Worst year on record?']
  if (t.includes('get_year_total') || t.includes('compare_years')) return ['Worst year on record?', 'Is this month unusual?']
  return ['Is this month unusual?', 'When does the season peak?']
}

export default function AnswerCard({ a, onFollow }: { a: Answer; onFollow?: (q: string) => void }) {
  const [open, setOpen] = useState(true)
  const [why, setWhy] = useState(false)
  const [doc, setDoc] = useState<RegionDoc | null>(null)
  const [rows, setRows] = useState<[string, string, string][] | null>(null)
  const region = a.region ?? a.switched_region ?? 'punjab'
  const switched = a.switched_region ? REGIONS.find((r) => r.id === a.switched_region)?.name : null
  useEffect(() => {
    let alive = true
    const load = (p: string) => fetchJson<unknown>(p)
    fetchJson<RegionDoc>(`regions/${region}.json`).then((d) => alive && setDoc(a.mode === 'detail' ? toDetail(d) : d)).catch(() => {})
    // the same deterministic lookups the analyst made, re-run on the published JSON → a clean table for live and saved answers
    Promise.all(a.trace.map((t) => runTool(load, t.tool, t.args).then((r) => rowsOf(t.tool, String(t.args.region ?? region), r as Record<string, unknown>)).catch(() => [])))
      .then((rs) => alive && setRows(rs.flat()))
    return () => { alive = false }
  }, [a, region])
  return (
    <div className="fade-up rounded-sm border border-border bg-surface-2 p-4">
      <p className="text-[17px] leading-relaxed text-text" data-testid="answer-text">{formatNumbersInText(a.answer)}</p>
      {a.caveat && <p className="mt-2 text-xs text-muted" data-testid="answer-caveat"><span className="font-semibold text-warn">Caveat:</span> {a.caveat}</p>}
      {doc && <MiniVisual a={a} doc={doc} />}
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-faint">
        <span className="rounded-full border border-border-strong px-1.5 py-px font-mono text-[10px] capitalize" data-testid="voice-badge">{a.voice}</span>
        <span className="rounded-full border border-border-strong px-1.5 py-px text-[10px]">{a.mode === 'detail' ? 'High detail' : 'Long-term'}</span>
        {a.source === 'cache' && (
          <span className="relative">
            <button onClick={() => setWhy((v) => !v)} aria-expanded={why}
              className="rounded-full bg-accent-2/15 px-2 py-px text-[10px] text-accent-2">⚡ Instant answer{a.generated ? ` (saved ${new Date(a.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : ''} ⓘ</button>
            {why && <span className="absolute top-6 left-0 z-10 w-64 rounded-sm border border-border-strong bg-surface-3 p-2 text-[11px] text-muted shadow-card">
              A precomputed answer built from the same verified numbers, shown instantly because the live AI is busy. Numbers are checked the same way.</span>}
          </span>
        )}
      </p>
      {a.mode === 'detail' && <p className="mt-2 text-xs text-accent-2" data-testid="answer-mode">High detail answer: native VIIRS fire-days (2012–now), not comparable with Long-term numbers.</p>}
      {a.source === 'cache' && a.mode === 'longterm' && <p className="mt-1 text-xs text-muted" data-testid="answer-mode">Long-term answer (MODIS-equivalent fire-days).</p>}
      {switched && <p className="mt-2 text-xs text-accent-2">Switched to {switched} — your question names it.</p>}
      <div className="mt-3 border-t border-border pt-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs text-accent-2 hover:underline">
          {open ? '▾' : '▸'} Numbers used ({a.trace.length} {a.trace.length === 1 ? 'lookup' : 'lookups'}){a.verified ? ' · every number verified against these' : ''}
        </button><Help id="numbers-used" />
        {open && (
          rows && rows.length ? (
            <div className="mt-2 overflow-x-auto"><table className="w-full text-[11px]" data-testid="numbers-table">
              <thead><tr className="text-left text-faint"><th className="py-1 pr-3 font-medium">Metric</th><th className="pr-3 text-right font-medium">Value</th><th className="font-medium">Source</th></tr></thead>
              <tbody>{rows.map(([k, v, s], i) => (
                <tr key={i} className="border-t border-border"><td className="py-1 pr-3 text-muted">{k}</td><td className="num pr-3 text-right text-text">{v}</td><td className="text-faint">{s}</td></tr>
              ))}</tbody>
            </table></div>
          ) : (
            <p className="mt-2 text-[11px] text-faint">{a.trace.length ? 'Loading the lookups…' : 'No data lookups were needed.'}</p>
          )
        )}
      </div>
      {onFollow && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="followups">
          {followUps(a).map((q) => <button key={q} onClick={() => onFollow(q)} className="rounded-full border border-border-strong px-2.5 py-1 text-[11px] text-muted hover:bg-surface-3 hover:text-text">↳ {q}</button>)}
        </div>
      )}
    </div>
  )
}
