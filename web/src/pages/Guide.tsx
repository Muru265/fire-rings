import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AnnualBars from '../components/AnnualBars'
import FireRings from '../components/FireRings'
import Gauge from '../components/Gauge'
import GridCalendar from '../components/GridCalendar'
import SeasonalityChart from '../components/SeasonalityChart'
import { fetchJson } from '../lib/api'
import { makeColorer } from '../lib/colors'
import { fmtInt, fmtRatio } from '../lib/format'
import { ENTRIES, GROUPS, SECTIONS, TERMS, search } from '../lib/glossary'
import type { Entry, Group, Hit } from '../lib/glossary'
import { headline, judgeMonth } from '../lib/headline'
import { plainLevel } from '../lib/plain'
import { REGIONS } from '../lib/regions'
import { MONTHS, toGrid } from '../lib/series'
import { kRangeText } from '../lib/calibration'
import type { RegionDoc } from '../lib/types'
import type { WatchDoc } from '../../api/_lib/watch'

const FULL = (m: number) => new Date(Date.UTC(2000, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })

/** Worked example sentences, computed from the published JSON (never typed). */
function exampleFor(id: string, docs: Record<string, RegionDoc>, watch?: WatchDoc | null): string | null {
  if (id === 'raw-vs-harmonized' && watch) { const t = watch.backtest.totals; return `On raw data the agent would have raised ${t.raw_alerts} alerts since 2012 — ${t.raw_only_alerts} of them only because of the satellite switch; on harmonized data ${t.harmonized_alerts}.` }
  if (id === 'fire-watch' && watch) return Object.values(watch.regions).map((r) => `${r.name.split(' (')[0]}: ${r.status}`).join(' · ') + ` (data through ${watch.data_end}).`
  const p = docs.punjab
  if (!p) return null
  const name = p.name
  const best = p.months.filter((r) => r.H != null).reduce((a, b) => (b.H! > a.H! ? b : a))
  const clim = p.climatology!
  const lc = p.latest_complete!
  const lcRec = p.months.find((r) => r.y === lc.y && r.m === lc.m)!
  const full = p.annual.filter((a) => a.complete && a.rankable !== false && a.H != null)
  switch (id) {
    case 'fire-rings': return `In this example, ${name} ${MONTHS[best.m - 1]} ${best.y} is the brightest cell (${fmtInt(best.H)} fire-days) — the biggest month in the record; the bright band in Oct–Nov is the rice-stubble burning season, and Apr–May is wheat.`
    case 'calendar': {
      const last = full.slice(-4)
      return `${name} yearly totals for ${last.map((a) => a.y).join(', ')}: ${last.map((a) => fmtInt(a.H)).join(' → ')} fire-days (read down the Year column).`
    }
    case 'seasonality': {
      const oct = p.months.find((r) => r.y === lc.y && r.m === 10)
      return `A typical October in ${name} has ${fmtInt(clim.median[9])} fire-days (normal range ${fmtInt(clim.p10[9])}–${fmtInt(clim.p90[9])})${oct?.H != null ? `; October ${lc.y} had ${fmtInt(oct.H)}` : ''}.`
    }
    case 'annual-totals': {
      const hi = [...full].sort((a, b) => b.H! - a.H!)[0]
      return `${name}’s biggest complete year is ${hi.y} (${fmtInt(hi.H)} fire-days)${p.validation ? `; across the 2012 line the harmonized record changes ${p.validation.step_harm_pct > 0 ? '+' : ''}${p.validation.step_harm_pct}% while raw data jumps +${fmtInt(p.validation.step_raw_pct)}%` : ''}.`
    }
    case 'gauge': case 'headline': {
      const h = headline({ ...judgeMonth(p, lcRec), timingCaveat: null })
      return `${name} — ${h.lead} ${h.rest}`
    }
    case 'similar-years': return p.similar_detail?.years.length ? `${name} ${p.months.at(-1)!.y} so far looks most like ${p.similar_detail.years.map((s) => `${s.y} (${Math.round(s.r * 100)}% similar shape)`).join(', ')}.` : null
    case 'kpi-cards': return p.latest ? `${name} this month so far: ${fmtInt(p.latest.value)} fire-days${p.latest.days ? ` (days 1–${p.latest.days})` : ''}, ${p.latest.ratio != null ? `${fmtRatio(p.latest.ratio)} the same days in a typical year` : ''}.` : null
    case 'region-cards': return REGIONS.map((r) => {
      const d = docs[r.id]
      const l = d?.latest_complete
      const rec = l ? d.months.find((x) => x.y === l.y && x.m === l.m) : null
      return rec ? `${d.name.split(' (')[0]}: ${plainLevel(rec.ratio, !!rec.guard).text}` : null
    }).filter(Boolean).join(' · ') + ` (${FULL(lc.m)} ${lc.y}).`
    case 'typical': return `Example: a typical October in ${name} = ${fmtInt(clim.median[9])} fire-days (median of ${p.baseline[0]}–${p.baseline[1]}).`
    case 'before-after': case 'v3-step': return p.validation ? `${name}: raw data jumps +${fmtInt(p.validation.step_raw_pct)}% at 2012; harmonized ${p.validation.step_harm_pct > 0 ? '+' : ''}${p.validation.step_harm_pct}%, MODIS alone ${p.validation.step_modis_pct > 0 ? '+' : ''}${p.validation.step_modis_pct}%.` : null
    case 'calibration-ratio-by-month': case 'exchange-rate': {
      if (p.method === 'pooled') return `${name}: one rate for all months, ${p.k.pool.toFixed(2)} — so 100 VIIRS fire-days ≈ ${Math.round(p.k.pool * 100)} MODIS-equivalent fire-days.`
      return `${name}: monthly rates ${kRangeText(p.k)}, region-wide ${p.k.pool.toFixed(2)} — so 100 VIIRS fire-days ≈ ${Math.round(p.k.pool * 100)} MODIS-equivalent fire-days.`
    }
    case 'v1-error': return p.validation ? `${name}: hiding each year 2012–2019 and predicting it misses the annual total by ${p.validation.loyo_err_pct}% on average (bias ${p.validation.loyo_bias_pct > 0 ? '+' : ''}${p.validation.loyo_bias_pct}%).` : null
    case 'orbit-drift': return p.validation?.drift_post2020_rel_pct != null ? `${name}: after the drift the yearly ratio moved by ${p.validation.drift_post2020_rel_pct}% on average.` : null
    case 'adds-card': case 'viirs-native': return p.detail?.adds.ratio ? `${name}: VIIRS sees about ${p.detail.adds.ratio.toFixed(1)}× more fire-days than the old-camera equivalent (${p.detail.adds.years[0]}–${p.detail.adds.years[1]}).` : null
    case 'static-sources': case 'static-sources-term': return p.quality ? `${name}: ${fmtInt(p.quality.masked_static_total)} detections removed at ${fmtInt(p.quality.known_static_cells)} always-hot places.` : null
    case 'mode-toggle': {
      if (!p.detail) return null
      const r = p.months.find((x) => x.y === lc.y && x.m === lc.m)
      return r?.V != null ? `${name} ${MONTHS[lc.m - 1]} ${lc.y}: ${fmtInt(r.H)} fire-days in Long-term (MODIS-equivalent) vs ${fmtInt(r.V)} in High detail (VIIRS native) — same fires, two cameras.` : null
    }
    case 'percentile': return lcRec.pct ? `Example: ${name} ${MONTHS[lc.m - 1]} ${lc.y} sits at the ${lcRec.pct[0]}–${lcRec.pct[1]} percentile range.` : null
    default: return null
  }
}

function Mark({ n, style }: { n: number; style: CSSProperties }) {
  return <span aria-hidden="true" className="pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full bg-accent-2 text-xs font-bold text-bg shadow-card" style={style}>{n}</span>
}

/** Real components with numbered markers (QA #9: annotated example rendered with the SAME component). */
function Example({ id, doc }: { id: string; doc: RegionDoc }) {
  const colorer = useMemo(() => makeColorer(doc, 'counts', 1), [doc])
  const grid = useMemo(() => toGrid(doc.months), [doc])
  const recent = useMemo(() => toGrid(doc.months.filter((r) => r.y >= doc.months.at(-1)!.y - 7)), [doc])
  const lc = doc.latest_complete!
  const noop = () => {}
  switch (id) {
    case 'fire-rings':
      return (
        <div className="relative mx-auto max-w-[420px]">
          <FireRings grid={grid} colorOf={colorer.colorOf} mode="harmonized" active={null} onActive={noop} onSelect={noop} label={`${doc.name} Fire Rings example`} />
          <Mark n={1} style={{ top: '6%', left: '57%' }} />
          <Mark n={2} style={{ top: '31%', left: '90%' }} />
          <Mark n={3} style={{ top: '18%', left: '36%' }} />
          <Mark n={4} style={{ top: '30%', left: '24%' }} />
        </div>
      )
    case 'calendar':
      return <GridCalendar grid={recent} colorOf={colorer.colorOf} glyphOf={colorer.glyphOf} mode="harmonized" active={null} onActive={noop} onSelect={noop} label={`${doc.name} calendar example`} />
    case 'seasonality': return <SeasonalityChart doc={doc} year={lc.y} />
    case 'annual-totals': return <AnnualBars doc={doc} />
    case 'gauge': {
      const rec = doc.months.find((r) => r.y === lc.y && r.m === lc.m)!
      return (
        <div className="relative mx-auto max-w-[320px]">
          <Gauge j={judgeMonth(doc, rec)} />
          <Mark n={1} style={{ top: '38%', left: '80%' }} />
          <Mark n={2} style={{ top: '38%', left: '50%' }} />
          <Mark n={3} style={{ top: '52%', left: '62%' }} />
        </div>
      )
    }
    default: return null
  }
}
const HAS_EXAMPLE = new Set(['fire-rings', 'calendar', 'seasonality', 'annual-totals', 'gauge'])

function EntryCard({ e, docs, flash, watch }: { e: Entry; docs: Record<string, RegionDoc>; flash: boolean; watch: WatchDoc | null }) {
  const ex = exampleFor(e.id, docs, watch)
  return (
    <article id={e.id} className={`card scroll-mt-[calc(var(--header-h,56px)+4.5rem)] transition-shadow duration-500 ${flash ? 'ring-2 ring-accent-2' : ''}`} data-guide-entry={e.id}>
      <h3 className="font-display text-lg font-semibold"><a href={`#${e.id}`} className="text-text no-underline hover:underline">{e.title}</a></h3>
      <p className="mt-1 text-sm text-text"><span className="eyebrow mr-1 !text-[10px]">What it shows</span>{e.what}</p>
      {HAS_EXAMPLE.has(e.id) && docs.punjab && (
        <div className="mt-3 rounded-sm border border-border bg-bg/40 p-3">
          <p className="eyebrow mb-2 !text-[10px]">Annotated example · {docs.punjab.name} (real data)</p>
          <Example id={e.id} doc={docs.punjab} />
        </div>
      )}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="eyebrow !text-[10px]">How to read it</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted marker:text-faint">{e.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
        <div className="space-y-3">
          {ex && <div><p className="eyebrow !text-[10px]">Example reading</p><p className="mt-1 text-sm text-text" data-testid="example-reading">{ex}</p></div>}
          {e.watch.length > 0 && <div><p className="eyebrow !text-[10px] !text-warn">Watch out for</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{e.watch.map((w) => <li key={w}>{w}</li>)}</ul></div>}
          <Link to={e.where.to} className="inline-block text-sm">{e.where.label}</Link>
        </div>
      </div>
    </article>
  )
}

function Section({ id, title, children, flash }: { id: string; title: string; children: ReactNode; flash: boolean }) {
  return (
    <section id={id} className={`card scroll-mt-[calc(var(--header-h,56px)+4.5rem)] transition-shadow duration-500 ${flash ? 'ring-2 ring-accent-2' : ''}`}>
      <h2 className="font-display text-xl font-semibold"><a href={`#${id}`} className="text-text no-underline hover:underline">{title}</a></h2>
      <div className="mt-2 space-y-2 text-sm text-muted">{children}</div>
    </section>
  )
}

/** "Same fires, two cameras": big pixels light 2 cells, small pixels light 8. */
function TwoCameras() {
  const fires = [[38, 30], [44, 36], [52, 28], [60, 44], [70, 40], [34, 52], [48, 58]]
  const grid = (size: number, ox: number, label: string) => {
    const cells = new Set(fires.map(([x, y]) => `${Math.floor(x / size)},${Math.floor(y / size)}`))
    const n = 100 / size
    return (
      <g transform={`translate(${ox} 0)`}>
        {Array.from({ length: n * n }, (_, i) => {
          const cx = i % n, cy = Math.floor(i / n)
          const lit = cells.has(`${cx},${cy}`)
          return <rect key={i} x={cx * size} y={cy * size} width={size} height={size} fill={lit ? '#E55C30' : 'transparent'} fillOpacity={lit ? 0.75 : 0} stroke="var(--border-strong)" strokeWidth={0.5} />
        })}
        {fires.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.2} fill="#FCFFA4" />)}
        <text x={50} y={114} textAnchor="middle" className="fill-[var(--text)] text-[8px]">{label}</text>
        <text x={50} y={124} textAnchor="middle" className="fill-[var(--text-muted)] text-[7px]">{cells.size} pixels light up</text>
      </g>
    )
  }
  return (
    <svg viewBox="0 0 230 130" className="mx-auto w-full max-w-md" role="img" aria-label="The same seven fires seen by a camera with big pixels (few cells lit) and one with small pixels (many cells lit)">
      {grid(50, 0, 'MODIS · 1 km pixels')}
      {grid(12.5, 130, 'VIIRS · 375 m pixels')}
    </svg>
  )
}

export default function Guide() {
  const [docs, setDocs] = useState<Record<string, RegionDoc>>({})
  const [watch, setWatch] = useState<WatchDoc | null>(null)
  useEffect(() => { fetchJson<WatchDoc>('watch.json').then(setWatch).catch(() => {}) }, [])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const [toc, setToc] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const loc = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all(REGIONS.map((r) => fetchJson<RegionDoc>(`regions/${r.id}.json`).then((d): [string, RegionDoc] => [r.id, d]).catch(() => null)))
      .then((xs) => setDocs(Object.fromEntries(xs.filter((x): x is [string, RegionDoc] => x != null))))
  }, [])

  const reveal = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    setFlash(id)
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 2000)
  }
  const go = (id: string) => {
    setOpen(false)
    // QA #68: scroll + highlight every time, even when the URL hash is already this id
    if (decodeURIComponent(loc.hash.slice(1)) === id) reveal(id)
    else navigate(`/guide#${id}`, { replace: false })
  }
  // scroll + highlight on hash (deep links from ⓘ and from search)
  useEffect(() => {
    const id = decodeURIComponent(loc.hash.slice(1))
    if (!id) return
    const t = setTimeout(() => reveal(id), docs.punjab ? 50 : 400)
    return () => clearTimeout(t)
  }, [loc.hash, docs.punjab])
  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); input.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hits: Hit[] = useMemo(() => (q.trim() ? search(q) : []), [q])
  const groups = GROUPS.filter((g) => g !== 'Basics' && g !== 'Glossary')
  const byGroup = (g: Group) => ENTRIES.filter((e) => e.group === g)
  const p = docs.punjab

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <p className="eyebrow">Guide</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">How to read Fire Rings</h1>
        <p className="mt-2 text-base text-muted">Every chart and number on the site, in plain words, with a worked example from the real data.</p>
      </header>

      {/* sticky search */}
      {/* QA #68: sits just below the site header at any width (header height published by AppShell) */}
      <div className="sticky top-[var(--header-h,56px)] z-20 -mx-4 bg-bg/90 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <div className="relative max-w-2xl">
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setSel(0) }} onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
              else if (e.key === 'Enter' && hits[sel]) go(hits[sel].id)
              else if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="Search the guide — e.g. “calibration ratio by month”, “pie chart”, “percentile”   ( / )"
            className="w-full rounded-sm border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint"
            role="combobox" aria-expanded={open && !!q} aria-controls="guide-results" aria-label="Search the guide" data-testid="guide-search" />
          {open && q.trim() && (
            <ul id="guide-results" role="listbox" className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-auto rounded-sm border border-border-strong bg-surface-3 py-1 text-sm shadow-card">
              {hits.length ? hits.map((h, i) => (
                <li key={`${h.kind}-${h.id}`} role="option" aria-selected={i === sel}>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => go(h.id)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left ${i === sel ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2'}`}>
                    <span>{h.title}</span><span className="text-[10px] text-faint">{h.kind === 'term' ? 'Glossary' : h.group}</span>
                  </button>
                </li>
              )) : (
                <li className="px-3 py-2 text-muted" data-testid="guide-noresults">No results — try: <button className="text-accent-2" onClick={() => setQ('fire-day')}>fire-day</button>, <button className="text-accent-2" onClick={() => setQ('percentile')}>percentile</button>, <button className="text-accent-2" onClick={() => setQ('calibration')}>calibration</button>…</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* table of contents */}
        <nav aria-label="Guide contents" className="lg:sticky lg:top-[calc(var(--header-h,56px)+4.5rem)] lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-auto">
          <button onClick={() => setToc((v) => !v)} aria-expanded={toc} className="mb-2 rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text lg:hidden">{toc ? 'Hide contents' : 'Show contents'}</button>
          <div className={`${toc ? 'block' : 'hidden'} space-y-3 text-xs lg:block`}>
            <div><p className="eyebrow !text-[10px]">Basics</p><ul className="mt-1 space-y-0.5">{SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-muted no-underline hover:text-text">{s.title}</a></li>)}</ul></div>
            {groups.map((g) => (
              <div key={g}><p className="eyebrow !text-[10px]">{g}</p><ul className="mt-1 space-y-0.5">{byGroup(g).map((e) => <li key={e.id}><a href={`#${e.id}`} className="text-muted no-underline hover:text-text">{e.title}</a></li>)}</ul></div>
            ))}
            <div><p className="eyebrow !text-[10px]">Glossary</p><a href="#glossary" className="text-muted no-underline hover:text-text">All terms ({TERMS.length})</a></div>
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          <Section id="problem" title="The problem in 30 seconds" flash={flash === 'problem'}>
            <p>Two generations of satellites watch for fire. The old camera, <strong className="text-text">MODIS</strong> (on Terra and Aqua, since 2000), has 1 km pixels. The new camera, <strong className="text-text">VIIRS</strong> (since 2012), has 375 m pixels. VIIRS sees more: it catches small fires MODIS misses, and it splits a big fire into many dots.</p>
            <TwoCameras />
            <p>Joining the two records naively fakes a jump in 2012{p?.validation ? <> — in {p.name} raw counts jump <strong className="text-text">+{fmtInt(p.validation.step_raw_pct)}%</strong> the year VIIRS arrives</> : ''}. The fire didn’t change; the camera did.</p>
          </Section>
          <Section id="fix" title="How we fix it (3 ideas)" flash={flash === 'fix'}>
            <ol className="list-decimal space-y-1 pl-5">
              <li><strong className="text-text">Count places, not dots</strong>: a fire-day is one ~36 km² tile with at least one fire on one day, so splitting a fire into many dots doesn’t inflate the count.</li>
              <li><strong className="text-text">Find the exchange rate</strong> in the years both cameras flew steadily (Jul 2012 – Dec 2019, before orbit drift).</li>
              <li><strong className="text-text">Convert the new camera into old-camera units</strong>: scale VIIRS down, never MODIS up.</li>
            </ol>
            <p>Bridges: before July 2002 only Terra flew (hatched, not ranked); after Suomi-NPP data delivery ceased (2 Nov 2026), NOAA-20 carries the record using a VIIRS-to-VIIRS rate.</p>
          </Section>
          <Section id="two-views" title="Two views of the same data" flash={flash === 'two-views'}>
            <p>Think of an old blurry photo and a sharp new one. To compare them fairly you blur the new one to match: that is <strong className="text-text">Long-term</strong> (2001–now). To see today in full detail you look at the new photo as it is: that is <strong className="text-text">High detail</strong> (2012–now, VIIRS native). Nothing is thrown away.</p>
            {exampleFor('mode-toggle', docs) && <p className="text-text">{exampleFor('mode-toggle', docs)}</p>}
          </Section>

          {groups.map((g) => (
            <div key={g} className="space-y-4">
              <h2 className="eyebrow pt-2">{g}</h2>
              {byGroup(g).map((e) => <EntryCard key={e.id} e={e} docs={docs} flash={flash === e.id} watch={watch} />)}
            </div>
          ))}

          <Section id="live-vs-record" title="LIVE vs record" flash={flash === 'live-vs-record'}>
            <p><strong className="text-text">LIVE</strong> = raw detections in the last 72 hours from NOAA-20/21, available about 3 hours after the satellite pass. Provisional, and never added to the record.</p>
            <p><strong className="text-text">Record</strong> = harmonized monthly fire-days, the same ruler for every month since 2001.</p>
          </Section>
          <Section id="punjab-caveat" title="The Punjab detection-time caveat, simply" flash={flash === 'punjab-caveat'}>
            <p>Imagine a speed camera that only takes a photo at 1:30 pm, while drivers speed at 4 pm. Polar-orbiting satellites pass over Punjab around 13:30; reports say farmers now burn later in the afternoon. So recent October–November seasons may be undercounted.</p>
            <p>Evidence: Aqua, which drifted to pass later in the day, now sees relatively more fire than VIIRS only in Punjab October–November — not in April–May, Madagascar or SE Australia. We don’t change the numbers; we flag them. <Link to="/proof">See the chart on Proof →</Link></p>
          </Section>
          <Section id="satellites-do" title="What satellites do and don’t do" flash={flash === 'satellites-do'}>
            <p>Satellites detect heat. NASA processes it and publishes it on FIRMS within hours. People and fire services decide what to do. Fire Rings is for planning — “is this season unusual?” — not an emergency alarm.</p>
          </Section>
          <Section id="five-satellites" title="The 5 satellites" flash={flash === 'five-satellites'}>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="text-text">Terra</strong> (MODIS, 1 km): from 2000; orbit drifting since 2020. Alone before July 2002.</li>
              <li><strong className="text-text">Aqua</strong> (MODIS, 1 km): from July 2002; drifting since Dec 2021. Terra + Aqua = the MODIS record.</li>
              <li><strong className="text-text">Suomi-NPP</strong> (VIIRS, 375 m): from 20 Jan 2012; data ended Nov 2026. Calibrated against MODIS.</li>
              <li><strong className="text-text">NOAA-20</strong> (VIIRS, 375 m): from 2018; carries the record after Suomi-NPP via a VIIRS-to-VIIRS rate.</li>
              <li><strong className="text-text">NOAA-21</strong> (VIIRS, 375 m): from 2023; used for the live layer and cross-checks.</li>
            </ul>
          </Section>

          <section id="glossary" className="card scroll-mt-[calc(var(--header-h,56px)+4.5rem)]">
            <h2 className="font-display text-xl font-semibold">Glossary</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
              {TERMS.map((t) => {
                const ex = exampleFor(t.id, docs)
                return (
                  <div key={t.id} id={t.id} className={`scroll-mt-[calc(var(--header-h,56px)+4.5rem)] rounded-sm p-2 transition-shadow duration-500 ${flash === t.id ? 'ring-2 ring-accent-2' : ''}`} data-guide-entry={t.id}>
                    <dt className="font-semibold text-text"><a href={`#${t.id}`} className="text-text no-underline hover:underline">{t.term}</a></dt>
                    <dd className="mt-0.5 text-sm text-muted">{t.short}{t.more ? ` ${t.more}` : ''}{ex ? <span className="mt-1 block text-text">{ex}</span> : null}</dd>
                  </div>
                )
              })}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
