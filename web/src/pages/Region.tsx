import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AnnualBars from '../components/AnnualBars'
import CalendarTable from '../components/CalendarTable'
import EmptyState from '../components/EmptyState'
import FireRings from '../components/FireRings'
import Gauge from '../components/Gauge'
import GridCalendar from '../components/GridCalendar'
import KpiCards from '../components/KpiCards'
import Legend from '../components/Legend'
import SeamSlider from '../components/SeamSlider'
import SeasonalityChart from '../components/SeasonalityChart'
import { useRegion } from '../lib/api'
import { useLive } from '../lib/live'
import LiveBadge from '../components/LiveBadge'
import { makeColorer } from '../lib/colors'
import { calibrationSummary } from '../lib/calibration'
import { boxDerived } from '../lib/boxDerived'
import { calendarCsv, downloadPng, downloadText } from '../lib/exporters'
import { fmtInt } from '../lib/format'
import type { Box } from '../lib/hexes'
import { headline, judgeMonth } from '../lib/headline'
import { REGIONS, findRegion } from '../lib/regions'
import { MONTHS, toGrid } from '../lib/series'
import type { CalMode, RegionDoc } from '../lib/types'
import type { Cell } from '../lib/useCellNav'

const MapView = lazy(() => import('../components/MapView'))
const MonthDrawer = lazy(() => import('../components/MonthDrawer'))
const AskDrawer = lazy(() => import('../components/AskDrawer'))

export default function Region() {
  const { regionId } = useParams()
  const region = findRegion(regionId)
  const doc = useRegion(region ? region.id : null)

  if (!region) {
    return (
      <EmptyState title="Region not found">
        Available regions:{' '}
        {REGIONS.map((r, i) => (
          <span key={r.id}>{i > 0 && ' · '}<Link to={`/r/${r.id}`}>{r.name}</Link></span>
        ))}
      </EmptyState>
    )
  }
  if (doc.status === 'loading') return <RegionSkeleton name={region.name} />
  if (doc.status === 'error')
    return (
      <EmptyState title="Couldn't load this region's data">
        <p className="num text-xs">{doc.error}</p>
        <button onClick={doc.retry} className="mt-3 rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text hover:bg-surface-2">Retry</button>
      </EmptyState>
    )
  return <RegionView key={region.id} doc={doc.data} />
}

function RegionView({ doc: regionDoc }: { doc: RegionDoc }) {
  const [box, setBox] = useState<Box | null>(null)
  const [boxState, setBoxState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; months?: RegionDoc['months']; cells?: number; error?: string }>({ status: 'idle' })
  const [t, setT] = useState(regionDoc.harmonized ? 1 : 0)
  const [mode, setMode] = useState<CalMode>('counts')
  const [active, setActive] = useState<Cell | null>(null)
  const [selected, setSelected] = useState<Cell | null>(null)
  const [focusMonth, setFocusMonth] = useState<Cell | null>(null)
  const [table, setTable] = useState(false)
  const [ask, setAsk] = useState<{ q?: string } | null>(null)
  const [compareYear, setCompareYear] = useState<number | null>(null)
  const live = useLive(regionDoc.id)
  const ringsRef = useRef<HTMLDivElement>(null)

  const applyBox = useCallback((b: Box | null) => {
    setBox(b)
    setBoxState(b ? { status: 'loading' } : { status: 'idle' })
  }, [])

  useEffect(() => {
    if (!box) return
    let alive = true
    import('../lib/hexes').then((h) => h.boxRecord(regionDoc, box))
      .then((r) => alive && setBoxState(r.cells > 0
        ? { status: 'ready', months: r.months, cells: r.cells }
        : { status: 'error', error: `No fire hexagons of ${regionDoc.name} fall inside this box since 2001 — showing the whole region.` }))
      .catch((e: Error) => alive && setBoxState({ status: 'error', error: e.message }))
    return () => { alive = false }
  }, [box, regionDoc])

  const boxed = box && boxState.status === 'ready' && boxState.months
  const doc: RegionDoc = useMemo(() => (boxed
    ? { ...regionDoc, months: boxState.months!, ...boxDerived(regionDoc, boxState.months!) }
    : regionDoc), [boxed, regionDoc, boxState.months])
  const effMode: CalMode = boxed ? 'counts' : mode
  const colorer = useMemo(() => makeColorer(doc, effMode, t), [doc, effMode, t])
  const grid = useMemo(() => toGrid(doc.months), [doc])
  const viewMode = t >= 0.5 ? 'harmonized' : 'raw'
  const scale = t >= 0.5 ? colorer.harmScale : colorer.rawScale
  const unit = viewMode === 'raw' ? 'Fire-days (raw cell-days)' : 'Fire-days (MODIS-equivalent)'
  const label = `${doc.name}${boxed ? ' (box)' : ''}, ${viewMode} monthly fire-days`

  // insight month: selected/focused month, else the last complete month
  const lc = regionDoc.latest_complete
  const insightCell = focusMonth ?? (lc ? { y: lc.y, m: lc.m } : null)
  const insightRec = insightCell ? regionDoc.months.find((r) => r.y === insightCell.y && r.m === insightCell.m) : undefined
  const j = insightRec ? judgeMonth(regionDoc, insightRec) : null
  const lt = regionDoc.latest
  const mtdRec = lt?.mtd ? regionDoc.months.find((r) => r.y === lt.y && r.m === lt.m) : undefined
  // big headline = the claim; the detection-time caveat goes on its own smaller line below
  const head = j ? headline({ ...j, timingCaveat: null }) : null

  const onSelect = useCallback((c: Cell) => { setSelected(c); setFocusMonth(c) }, [])
  const selRec = selected ? doc.months.find((r) => r.y === selected.y && r.m === selected.m) : undefined
  const first = doc.months[0]
  const last = doc.months[doc.months.length - 1]
  const v = regionDoc.validation

  return (
    <div className="space-y-6">
      {/* header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow" title={regionDoc.area_km2 ? 'A rectangle cut from the country file (West/South/East/North edges in the map card).' : 'The whole country file from NASA FIRMS.'}>
            {regionDoc.area_km2 ? `Area covered: ${fmtInt(regionDoc.area_km2)} km²` : 'Area covered: the whole country'} · {MONTHS[first.m - 1]} {first.y} – {MONTHS[last.m - 1]} {last.y}
          </p>
          <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">{regionDoc.name}</h1>
          <RegionSwitcher current={regionDoc.id} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <LiveBadge live={live} />
          {regionDoc.harmonized && <span className="rounded-full border border-ok/40 bg-ok/10 px-3 py-1 text-ok">Harmonized · method: {regionDoc.method === 'pooled' ? 'single ratio' : 'monthly ratios'}</span>}
          {v && <Link to="/proof" className="rounded-full border border-border-strong px-3 py-1 text-muted no-underline hover:text-text">
            Validated: {v.low_activity ? 'low-activity region' : `${v.loyo_err_pct}% out-of-sample error`}
          </Link>}
        </div>
      </header>

      {/* headline */}
      {head && (
        <div className="fade-up max-w-4xl">
          <p className="font-display text-xl leading-snug sm:text-[28px]">
            <span className="mr-2 align-middle font-mono text-xs font-normal tracking-wider text-faint uppercase">
              {focusMonth ? 'Picked month' : j?.mtd ? 'This month so far' : 'Last full month'}
            </span>
            <span className="text-text">{head.lead}</span> <span className="text-muted">{head.rest}</span>
          </p>
          {j?.timingCaveat && (
            <p data-caveat="overpass_timing" className="mt-2 flex gap-2 text-sm text-warn">
              <span aria-hidden="true">⚑</span>
              <span>{j.timingCaveat} <Link to="/proof" className="text-warn underline">Why</Link></span>
            </p>
          )}
        </div>
      )}
      {regionDoc.harmonized && <KpiCards doc={regionDoc} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* centre */}
        <div className="min-w-0 space-y-6">
          {boxed && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-accent-2/40 bg-accent-2/10 px-4 py-2.5 text-sm">
              <span className="text-text">Box view: {fmtInt(boxState.cells ?? 0)} hexagons in [{box!.map((x) => x.toFixed(2)).join(', ')}]. Calibration from {regionDoc.name}; no intervals or percentiles for boxes.</span>
              <button onClick={() => applyBox(null)} className="rounded-sm border border-border-strong px-3 py-1 text-xs text-text hover:bg-surface-2">Back to whole region</button>
            </div>
          )}
          {box && boxState.status === 'loading' && <p className="text-sm text-muted" aria-live="polite">Recomputing 2001–2026 for the box…</p>}
          {box && boxState.status === 'error' && <p className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="status">{boxState.error}</p>}

          <section aria-labelledby="rings-h" className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="rings-h" className="font-display text-lg font-semibold">Fire Rings</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Colour mode" className="flex rounded-sm border border-border p-0.5 text-xs">
                  {(['counts', 'anomaly'] as CalMode[]).map((md) => (
                    <button key={md} onClick={() => { setMode(md); if (md === 'anomaly') setT(1) }} aria-pressed={effMode === md} disabled={!!boxed && md === 'anomaly'}
                      className={`rounded-[6px] px-3 py-1 capitalize ${effMode === md ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'} disabled:opacity-40`}>
                      {md === 'counts' ? 'Fire-days' : 'vs typical'}
                    </button>
                  ))}
                </div>
                <ExportMenu onCsv={() => downloadText(`fire-rings_${doc.id}${boxed ? '_box' : ''}.csv`, calendarCsv(doc.name + (boxed ? ` box ${box!.join(',')}` : ''), doc.months, 'fire-days (MODIS-equivalent) + raw cell-days'))}
                  onPng={() => ringsRef.current && downloadPng(ringsRef.current, `fire-rings_${doc.id}.png`)} />
              </div>
            </div>
            <div ref={ringsRef} className="grid items-center gap-6 bg-surface lg:grid-cols-[minmax(0,1fr)_220px]">
              <FireRings grid={grid} colorOf={colorer.colorOf} mode={viewMode} active={active} onActive={setActive} onSelect={onSelect} label={label} drawIn
                emphasis={compareYear ? (y) => y === compareYear || y === last.y : undefined}
                centerLabel={effMode === 'anomaly' ? 'vs typical' : t <= 0 ? 'Raw' : t >= 1 ? 'Harmonized' : 'Morphing'} />
              <div className="space-y-5">
                <Legend scale={scale} unit={unit} mode={effMode} vertical />
                <p className="text-[10px] text-faint">Fire Rings · {doc.name}{boxed ? ' (box)' : ''} · {MONTHS[first.m - 1]} {first.y}–{MONTHS[last.m - 1]} {last.y} · {effMode === 'anomaly' ? 'ratio to 2003–2022 median' : unit} · NASA FIRMS MODIS + VIIRS · fire-rings.vercel.app</p>
              </div>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <SeamSlider value={t} onChange={setT} disabled={effMode === 'anomaly' || !regionDoc.harmonized} />
              <p className="mt-2 text-xs text-muted">
                {t < 0.5
                  ? 'Raw: MODIS cell-days to 2011, VIIRS after. The jump at the dashed ring is the satellite changing, not the fire.'
                  : 'Harmonized: VIIRS converted to MODIS-equivalent fire-days with ratios fitted on Jul 2012 – Dec 2019 only.'}
              </p>
            </div>
          </section>

          <section aria-labelledby="grid-h" className="card">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="grid-h" className="font-display text-lg font-semibold">Calendar</h2>
              <button onClick={() => setTable((x) => !x)} aria-pressed={table}
                className="rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2">{table ? 'View as chart' : 'View as table'}</button>
            </div>
            {table
              ? <CalendarTable grid={grid} mode={viewMode} caption={`${label}, by year and month (${unit})`} />
              : <GridCalendar grid={grid} colorOf={colorer.colorOf} glyphOf={colorer.glyphOf} mode={viewMode} active={active} onActive={setActive} onSelect={onSelect} label={label} />}
          </section>

          {regionDoc.harmonized && (
            <div className="grid gap-6 2xl:grid-cols-2" data-testid="charts">
              <SeasonalityChart doc={doc} year={insightCell?.y ?? last.y} compareYear={compareYear} />
              <AnnualBars doc={doc} selectedYear={insightCell?.y} />
            </div>
          )}

          <Suspense fallback={<div className="card h-[520px] animate-pulse" aria-label="Loading map" />}>
            <MapView doc={regionDoc} y={(selected ?? insightCell ?? last).y} m={(selected ?? insightCell ?? last).m} box={box} onBox={applyBox} live={live} />
          </Suspense>
        </div>

        {/* insight panel */}
        <aside className="space-y-6" aria-label="Insights">
          {j && (
            <section className="card" aria-labelledby="normal-h">
              <h2 id="normal-h" className="eyebrow">Is this normal?</h2>
              <p className="mt-1 font-display text-lg font-semibold">{MONTHS[j.m - 1]} {j.y}{j.provisional ? <span className="ml-2 rounded-full border border-border-strong px-1.5 py-px align-middle font-mono text-[10px] font-normal text-muted">provisional</span> : null}</p>
              <div className="mt-3"><Gauge j={j} /></div>
              <p className="mt-3 text-center text-xs text-muted">vs {MONTHS[j.m - 1]} in {regionDoc.baseline[0]}–{regionDoc.baseline[1]} (median {fmtInt(j.median)} fire-days)</p>
              {(() => {
                const isMtd = !!mtdRec && insightCell?.y === mtdRec.y && insightCell.m === mtdRec.m
                const isLc = !focusMonth || (!!lc && insightCell?.y === lc.y && insightCell.m === lc.m)
                const picked = !isMtd && !isLc && insightCell
                return (
                  <>
                    <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs" role="group" aria-label="Which month the gauge shows">
                      {mtdRec && <button onClick={() => setFocusMonth({ y: mtdRec.y, m: mtdRec.m })} aria-pressed={isMtd}
                        className={`rounded-sm border px-2.5 py-1 ${isMtd ? 'border-accent bg-accent/15 text-text' : 'border-border-strong text-muted hover:text-text'}`}>
                        {MONTHS[mtdRec.m - 1]} so far</button>}
                      {lc && <button onClick={() => setFocusMonth(null)} aria-pressed={isLc && !isMtd}
                        className={`rounded-sm border px-2.5 py-1 ${isLc && !isMtd ? 'border-accent bg-accent/15 text-text' : 'border-border-strong text-muted hover:text-text'}`}>
                        Last full month</button>}
                      {insightRec && <button onClick={() => setSelected({ y: insightRec.y, m: insightRec.m })}
                        className="rounded-sm border border-border-strong px-2.5 py-1 text-muted hover:text-text">Details →</button>}
                    </div>
                    {picked && (
                      <p className="mt-2 text-center text-xs text-accent-2">Picked month: {MONTHS[picked.m - 1]} {picked.y} ·{' '}
                        <button onClick={() => setFocusMonth(null)} className="underline">✕ back to latest</button></p>
                    )}
                  </>
                )
              })()}
            </section>
          )}

          {regionDoc.similar_years.length > 0 && (
            <section className="card" aria-labelledby="sim-h">
              <h2 id="sim-h" className="eyebrow">Similar years</h2>
              <p className="mt-2 text-sm text-muted">{regionDoc.name.split(' (')[0]} {last.y} so far ({regionDoc.similar_detail?.months.replace(/(\d+)$/, (mm) => MONTHS[Number(mm) - 1]).replace('Jan', 'Jan')}) looks most like:</p>
              <ol className="mt-3 flex flex-wrap gap-2">
                {(regionDoc.similar_detail?.years ?? regionDoc.similar_years.map((y) => ({ y, r: NaN }))).map((s) => (
                  <li key={s.y}><button onClick={() => setCompareYear((c) => (c === s.y ? null : s.y))} aria-pressed={compareYear === s.y}
                    title={Number.isFinite(s.r) ? `shape correlation r = ${s.r.toFixed(2)}` : undefined}
                    className={`rounded-sm px-3 py-2 text-left ${compareYear === s.y ? 'bg-accent-2/20 ring-1 ring-accent-2' : 'bg-surface-2 hover:bg-surface-3'}`}>
                    <span className="num block text-base text-text">{s.y}</span>
                    {Number.isFinite(s.r) && <span className="text-[10px] text-faint">{Math.round(s.r * 100)}% similar shape</span>}
                  </button></li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] text-faint">Click a year to see it on the rings and on Seasonality. Same shape, not same size — a similar year can have more or fewer fires. Analogues, not a forecast.</p>
            </section>
          )}

          <section className="card" aria-labelledby="ask-h">
            <h2 id="ask-h" className="eyebrow">Ask Fire Rings</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?'].map((q) => (
                <button key={q} onClick={() => setAsk({ q })}
                  className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2">{q}</button>
              ))}
            </div>
            <button onClick={() => setAsk({})} className="mt-3 text-xs text-accent-2 hover:underline">Ask your own question →</button>
          </section>

          <section className="card text-xs text-muted" aria-labelledby="prov-h">
            <h2 id="prov-h" className="eyebrow mb-2">Provenance</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-faint">Data</dt><dd>NASA FIRMS MODIS C6.1 (Terra, Aqua), VIIRS 375 m (S-NPP, NOAA-20, NOAA-21)</dd>
              <dt className="text-faint">Through</dt><dd><span className="num">{new Date(regionDoc.data_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span> · Aug–Nov 2026 are NRT = quick-look data, replaced by NASA’s final data about 5 months later</dd>
              <dt className="text-faint">Unit</dt><dd>fire-day = one ~36 km² hexagon with at least one fire on one day (MODIS-equivalent)</dd>
              <dt className="text-faint">Calibration</dt><dd>fitted Jul 2012 – Dec 2019 only · <CalibrationText doc={regionDoc} /></dd>
              <dt className="text-faint">Baseline</dt><dd>“typical” = median of {regionDoc.baseline[0]}–{regionDoc.baseline[1]}</dd>
              <dt className="text-faint">Mode</dt><dd>Long-term (2001–now, MODIS-equivalent)</dd>
              <dt className="text-faint">Updated</dt><dd>{new Date(regionDoc.updated.replace('Z', ':00Z')).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mauritius' })} Mauritius time</dd>
            </dl>
            <Link to="/proof" className="mt-3 inline-block">How we know it works →</Link>
          </section>
        </aside>
      </div>

      {selected && selRec && (
        <Suspense fallback={null}>
          <MonthDrawer doc={doc} rec={selRec} onClose={() => setSelected(null)}
            onAsk={() => { const r = selRec; setSelected(null); setAsk({ q: `How unusual was ${new Date(Date.UTC(r.y, r.m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${r.y}?` }) }} />
        </Suspense>
      )}
      {ask && (
        <Suspense fallback={null}>
          <AskDrawer region={regionDoc.id} question={ask.q} onClose={() => setAsk(null)} />
        </Suspense>
      )}
    </div>
  )
}

function RegionSwitcher({ current }: { current: string }) {
  const navigate = useNavigate()
  useEffect(() => { try { localStorage.setItem('fr.lastRegion', current) } catch { /* private mode */ } }, [current])
  return (
    <div role="tablist" aria-label="Choose a region" className="mt-3 flex flex-wrap gap-1.5" data-testid="region-switcher">
      {REGIONS.map((r) => (
        <button key={r.id} role="tab" aria-selected={r.id === current} onClick={() => navigate(`/r/${r.id}${window.location.search}`)}
          className={`rounded-full border px-3 py-1 text-xs ${r.id === current ? 'border-accent bg-accent/15 text-text' : 'border-border-strong text-muted hover:bg-surface-2 hover:text-text'}`}>
          {r.name}
        </button>
      ))}
    </div>
  )
}

function CalibrationText({ doc }: { doc: RegionDoc }) {
  return <>{calibrationSummary(doc)}</>
}

function ExportMenu({ onCsv, onPng }: { onCsv: () => void; onPng: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex gap-1 text-xs" role="group" aria-label="Export">
      <button onClick={onCsv} className="rounded-sm border border-border-strong px-3 py-1.5 text-text hover:bg-surface-2">CSV</button>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await onPng() } finally { setBusy(false) } }}
        className="rounded-sm border border-border-strong px-3 py-1.5 text-text hover:bg-surface-2 disabled:opacity-50">{busy ? '…' : 'PNG'}</button>
    </div>
  )
}

function RegionSkeleton({ name }: { name: string }) {
  return (
    <div className="space-y-8" aria-busy="true">
      <h1 className="text-[28px] font-bold sm:text-[40px]">{name}</h1>
      <div className="card flex aspect-square max-h-[600px] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted">
          <div className="h-40 w-40 animate-pulse rounded-full border-[18px] border-surface-3" />
          <span className="text-sm">Reading 2001–2026…</span>
        </div>
      </div>
    </div>
  )
}

