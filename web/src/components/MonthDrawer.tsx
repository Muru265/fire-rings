import { scaleBand, scaleLinear } from 'd3-scale'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useJson } from '../lib/api'
import { pctRange } from '../lib/describe'
import { fmtCompact, fmtInt, fmtRatio } from '../lib/format'
import { factorOf, loadCells, monthCells } from '../lib/hexes'
import type { HexRes } from '../lib/hexes'
import { headline, judgeMonth } from '../lib/headline'
import { MONTHS } from '../lib/series'
import { COUNT_COLORS } from '../lib/scales'
import type { MonthRec, RegionDoc } from '../lib/types'
import { downloadText } from '../lib/exporters'
import { DataTable } from './ChartCard'
import { unitOf } from '../lib/mode'
import Help from './Help'

type Daily = Record<string, { modis?: number[]; viirs?: number[]; off?: number[] }>

function dailyH(doc: RegionDoc, d: Daily, r: MonthRec): number[] | null {
  const key = `${r.y}-${String(r.m).padStart(2, '0')}`
  const rec = d[key]
  const f = factorOf(doc, r)
  if (!rec || f == null) return null
  const arr = r.src === 'T' || r.src === 'M' ? rec.modis : rec.viirs
  return arr ? arr.map((v) => v * f) : null
}

export default function MonthDrawer({ doc, rec, onClose, onAsk }: { doc: RegionDoc; rec: MonthRec; onClose: () => void; onAsk?: () => void }) {
  const daily = useJson<Daily>(`daily/${doc.id}.json`)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [table, setTable] = useState(false)
  useEffect(() => {
    closeRef.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const j = judgeMonth(doc, rec)
  const h = headline(j)
  const key = `${rec.y}-${String(rec.m).padStart(2, '0')}`

  const series = useMemo(() => {
    if (daily.status !== 'ready') return null
    const cur = dailyH(doc, daily.data, rec)
    if (!cur) return null
    const [b0, b1] = doc.baseline
    const base: number[][] = []
    for (let y = b0; y <= b1; y++) {
      const r = doc.months.find((x) => x.y === y && x.m === rec.m)
      const v = r ? dailyH(doc, daily.data, r) : null
      if (v) base.push(v)
    }
    const n = cur.length
    const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] }
    const band = Array.from({ length: n }, (_, i) => {
      const col = base.map((b) => b[i]).filter((v) => v != null)
      return col.length ? { p10: q(col, 0.1), p50: q(col, 0.5), p90: q(col, 0.9) } : null
    })
    const lastDay = rec.flags.includes('mtd') ? Number(doc.data_end.slice(8, 10)) : n
    const off = daily.data[`${rec.y}-${String(rec.m).padStart(2, '0')}`]?.off ?? []
    return { cur: cur.slice(0, lastDay), band, n, off }
  }, [daily, doc, rec])

  const baseVals = doc.months.filter((x) => x.m === rec.m && x.y >= doc.baseline[0] && x.y <= doc.baseline[1] && x.H != null)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-h">
      <button className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Close month details" onClick={onClose} tabIndex={-1} />
      <aside className="fade-up relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l border-border bg-surface shadow-card">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="eyebrow">{doc.name}<Help id="month-drawer" label="Month drawer" /></p>
            <h2 id="drawer-h" className="mt-1 font-display text-2xl font-bold">{MONTHS[rec.m - 1]} {rec.y}</h2>
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded-sm border border-border-strong px-2.5 py-1 text-sm text-muted hover:text-text" aria-label="Close (Esc)">✕</button>
        </header>
        <div className="space-y-6 px-5 py-5">
          <p className="text-base leading-snug"><strong className="text-text">{h.lead}</strong> <span className="text-muted">{h.rest}</span></p>
          <dl className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-sm bg-surface-2 p-3"><dt className="text-faint">Fire-days</dt><dd className="num mt-1 text-lg text-text">{fmtInt(rec.H)}</dd>
              <dd className="text-faint">90% {fmtInt(rec.lo)}–{fmtInt(rec.hi)}</dd></div>
            <div className="rounded-sm bg-surface-2 p-3"><dt className="text-faint">vs typical</dt><dd className="num mt-1 text-lg text-text">{j.guard ? '~' : fmtRatio(j.ratio)}</dd>
              <dd className="text-faint">{j.guard ? 'too little fire' : pctRange(j.pct) ?? ''}</dd></div>
            <div className="rounded-sm bg-surface-2 p-3"><dt className="text-faint">Raw hotspots</dt>
              {rec.y >= 2012 ? (
                <>
                  <dd className="num mt-1 text-lg text-text">VIIRS {fmtInt(rec.hot_viirs)}</dd>
                  <dd className="num text-faint">MODIS {fmtInt(rec.hot_modis)}</dd>
                </>
              ) : (
                <dd className="num mt-1 text-lg text-text">MODIS {fmtInt(rec.hot_modis)}</dd>
              )}
            </div>
          </dl>
          <p className="-mt-3 text-[11px] text-faint">Hotspots are individual satellite pixels flagged as hot; many hotspots can fall in one fire-day.</p>

          <section aria-labelledby="daily-h">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="daily-h" className="font-display text-sm font-semibold">Daily fire-days<Help id="daily-fire-days" /></h3>
              <button onClick={() => setTable((t) => !t)} className="text-xs text-accent-2 hover:underline" aria-pressed={table}>{table ? 'View as chart' : 'View as table'}</button>
            </div>
            {daily.status === 'loading' && <div className="h-[170px] animate-pulse rounded-sm bg-surface-2" />}
            {daily.status === 'error' && <p className="text-xs text-danger">Daily data unavailable: {daily.error}</p>}
            {series && (table
              ? <DataTable spec={{ caption: 'Daily fire-days vs baseline', columns: ['Day', 'Fire-days', 'Baseline P10', 'Median', 'P90'],
                  rows: series.band.map((b, i) => [i + 1, series.cur[i] != null ? fmtInt(series.cur[i]) : null, b ? fmtInt(b.p10) : null, b ? fmtInt(b.p50) : null, b ? fmtInt(b.p90) : null]) }} />
              : <DailyChart cur={series.cur} band={series.band} n={series.n} off={series.off} />)}
            {series && series.off.length > 0 && (
              <p className="mt-1 text-[11px] text-warn">Hatched days ({series.off.join(', ')}): the satellite sent no data for this region — not zero fire.</p>
            )}
            <p className="mt-1 text-[11px] text-faint">Bars: this month ({doc.mode === 'detail' ? 'VIIRS native daily cell-days' : 'MODIS-equivalent, daily cell-days × calibration'}). Band: P10–P90 of the same day in {doc.baseline[0]}–{doc.baseline[1]}; line: median.</p>
          </section>

          <section aria-labelledby="dots-h">
            <h3 id="dots-h" className="mb-2 font-display text-sm font-semibold">Every {MONTHS[rec.m - 1]} in the baseline<Help id="baseline-strip" /></h3>
            <DotPlot vals={baseVals} rec={rec} median={doc.climatology?.median[rec.m - 1] ?? null} unit={unitOf(doc)} />
          </section>

          <section aria-labelledby="mini-h">
            <h3 id="mini-h" className="mb-2 font-display text-sm font-semibold">Where<Help id="where-map" /></h3>
            <MiniHexMap doc={doc} y={rec.y} m={rec.m} />
          </section>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {doc.hotspot_months.includes(key) ? (
              <a href={`/data/v1/hotspots/${doc.id}_${key}.csv`} download className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-bg no-underline hover:brightness-110">
                Download this month's hotspots (CSV)
              </a>
            ) : (
              <span className="rounded-sm border border-border px-3 py-1.5 text-xs text-faint" title="Detection-level CSVs are published for the latest months only">
                Hotspot CSV: latest months only
              </span>
            )}
            {series && (
              <button onClick={() => downloadText(`fire-rings_${doc.id}_${key}_daily.csv`,
                `# Fire Rings v1 · ${doc.name} · ${key} · daily ${unitOf(doc)}\nday,fire_days,baseline_p10,baseline_median,baseline_p90\n` +
                series.band.map((b, i) => [i + 1, series.cur[i]?.toFixed(1) ?? '', b?.p10.toFixed(1) ?? '', b?.p50.toFixed(1) ?? '', b?.p90.toFixed(1) ?? ''].join(',')).join('\n'))}
                className="rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2">Download daily CSV</button>
            )}
            {onAsk ? (
              <button onClick={onAsk} className="rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2">Ask about this month</button>
            ) : (
              <Link to={`/ask?region=${doc.id}&y=${rec.y}&m=${rec.m}`} className="rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text no-underline hover:bg-surface-2">Ask about this month</Link>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function DailyChart({ cur, band, n, off = [] }: { cur: number[]; band: ({ p10: number; p50: number; p90: number } | null)[]; n: number; off?: number[] }) {
  const W = 470
  const H = 170
  const M = { t: 8, r: 6, b: 20, l: 36 }
  const x = scaleBand<number>().domain(Array.from({ length: n }, (_, i) => i)).range([M.l, W - M.r]).padding(0.2)
  const ymax = Math.max(1, ...cur, ...band.map((b) => b?.p90 ?? 0)) * 1.1
  const y = scaleLinear().domain([0, ymax]).nice(3).range([H - M.b, M.t])
  const area = band.map((b, i) => (b ? `${x(i)! + x.bandwidth() / 2},${y(b.p90)}` : '')).filter(Boolean).join(' ')
  const areaB = band.map((b, i) => (b ? `${x(i)! + x.bandwidth() / 2},${y(b.p10)}` : '')).filter(Boolean).reverse().join(' ')
  const med = band.map((b, i) => (b ? `${x(i)! + x.bandwidth() / 2},${y(b.p50)}` : '')).filter(Boolean).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily fire-days with baseline band. Use View as table for values.">
      {y.ticks(3).map((t) => (
        <g key={t}><line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
          <text x={M.l - 5} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--text-faint)] font-mono text-[9px]">{fmtCompact(t)}</text></g>
      ))}
      <defs>
        <pattern id="day-off" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--warn)" strokeWidth="1.2" />
        </pattern>
      </defs>
      <polygon points={`${area} ${areaB}`} fill="var(--surface-3)" />
      {off.map((d) => <rect key={`off${d}`} x={x(d - 1)} y={M.t} width={x.bandwidth()} height={H - M.b - M.t} fill="url(#day-off)" opacity={0.7}><title>{`Day ${d}: no satellite data`}</title></rect>)}
      {cur.map((v, i) => off.includes(i + 1) ? null : <rect key={i} x={x(i)} y={y(v)} width={x.bandwidth()} height={Math.max(0, y(0) - y(v))} rx={1.5} fill="var(--accent)" />)}
      <polyline points={med} fill="none" stroke="var(--text)" strokeWidth={1.2} />
      {[1, 10, 20, n].map((d) => <text key={d} x={x(d - 1)! + x.bandwidth() / 2} y={H - 5} textAnchor="middle" className="fill-[var(--text-faint)] font-mono text-[9px]">{d}</text>)}
    </svg>
  )
}

function DotPlot({ vals, rec, median, unit }: { vals: MonthRec[]; rec: MonthRec; median: number | null; unit: string }) {
  const [hov, setHov] = useState<MonthRec | null>(null)
  const W = 470
  const H = 74
  const Y = 34
  const all = [...vals.map((v) => v.H!), rec.H ?? 0, rec.hi ?? 0]
  const x = scaleLinear().domain([0, Math.max(1, ...all) * 1.05]).range([14, W - 14])
  const mon = MONTHS[rec.m - 1]
  // keep the two top labels apart: the median label goes above, this month's label below the axis
  const anchor = (px: number) => (px < 80 ? 'start' : px > W - 80 ? 'end' : 'middle')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" data-testid="dotplot"
        aria-label={`Dot plot: ${vals.length} baseline values for this month, median ${fmtInt(median)}, this month ${fmtInt(rec.H)}`}>
        <line x1={14} x2={W - 14} y1={Y} y2={Y} stroke="var(--border)" />
        {vals.map((v) => (
          <circle key={v.y} cx={x(v.H!)} cy={Y} r={hov?.y === v.y ? 6 : 4} fill={hov?.y === v.y ? 'var(--text)' : 'var(--text-faint)'} opacity={0.85}
            onMouseEnter={() => setHov(v)} onMouseLeave={() => setHov(null)} className="cursor-default"><title>{`${mon} ${v.y}: ${fmtInt(v.H)} fire-days`}</title></circle>
        ))}
        {median != null && <line x1={x(median)} x2={x(median)} y1={Y - 12} y2={Y + 12} stroke="var(--text)" strokeWidth={2} />}
        {rec.lo != null && rec.hi != null && <line x1={x(rec.lo)} x2={x(rec.hi)} y1={Y} y2={Y} stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />}
        {rec.H != null && <circle cx={x(rec.H)} cy={Y} r={7} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
        {median != null && <text x={x(median)} y={Y - 17} textAnchor={anchor(x(median))} className="fill-[var(--text)] text-[10px]">typical (median {fmtInt(median)})</text>}
        {rec.H != null && <text x={x(rec.H)} y={Y + 24} textAnchor={anchor(x(rec.H))} className="fill-[var(--accent)] text-[10px]">
          {mon} {rec.y} ({fmtInt(rec.H)}{rec.lo != null ? `, 90% ${fmtInt(rec.lo)}–${fmtInt(rec.hi)}` : ''})</text>}
        <text x={14} y={H - 2} className="fill-[var(--text-faint)] font-mono text-[9px]">0</text>
        <text x={W / 2} y={H - 2} textAnchor="middle" className="fill-[var(--text-faint)] text-[9px]">{unit}</text>
        <text x={W - 14} y={H - 2} textAnchor="end" className="fill-[var(--text-faint)] font-mono text-[9px]">{fmtCompact(x.domain()[1])}</text>
      </svg>
      <p className="mt-1 min-h-[1rem] text-[11px] text-muted" aria-live="polite">
        {hov ? <><span className="text-text">{mon} {hov.y}</span>: <span className="num text-text">{fmtInt(hov.H)}</span> fire-days</> : `Grey dots = each ${mon} in ${vals.length ? `${vals[0].y}–${vals[vals.length - 1].y}` : 'the baseline'}. Hover a dot for its year.`}
      </p>
    </div>
  )
}

function MiniHexMap({ doc, y, m }: { doc: RegionDoc; y: number; m: number }) {
  const [pts, setPts] = useState<{ x: number; y: number; v: number }[] | null>(null)
  const [foot, setFoot] = useState<{ x: number; y: number }[]>([])
  const res: HexRes = doc.mode === 'detail' && y >= 2012 ? 7 : 6
  const [err, setErr] = useState<string | null>(null)
  const [w, s, e, n] = doc.bbox
  const W = 470
  const kx = Math.cos(((s + n) / 2) * Math.PI / 180)
  const H = Math.min(360, Math.max(160, (W * (n - s)) / ((e - w) * kx)))
  useEffect(() => {
    let alive = true
    Promise.all([loadCells(doc.id, res), monthCells(doc.id, y, m, res)]).then(([{ ids, ll }, cells]) => {
      if (!alive) return
      const idx = new Map(ids.map((id, i) => [id, i]))
      // every hexagon that ever had fire, drawn faintly: gives the region's shape without a basemap
      setFoot(ll.map(([lat, lng]) => ({ x: ((lng - w) / (e - w)) * W, y: ((n - lat) / (n - s)) * H })))
      setPts(cells.map((c) => { const [lat, lng] = ll[idx.get(c.id)!]; return { x: ((lng - w) / (e - w)) * W, y: ((n - lat) / (n - s)) * H, v: c.v } }))
    }).catch((er: Error) => alive && setErr(er.message))
    return () => { alive = false }
  }, [doc.id, y, m, w, s, e, n, H, res])
  if (err) return <p className="text-xs text-danger">{err}</p>
  if (!pts) return <div className="h-[200px] animate-pulse rounded-sm bg-surface-2" />
  if (!pts.length) return <p className="rounded-sm bg-surface-2 p-4 text-xs text-muted">No vegetation-fire hotspots detected in this month.</p>
  const vals = pts.map((p) => p.v).sort((a, b) => a - b)
  const brk = [1, 2, 3, 4, 5, 6].map((i) => vals[Math.floor((i / 7) * (vals.length - 1))])
  const cls = (v: number) => { let c = 0; while (c < brk.length && v > brk[c]) c++; return c }
  const r = Math.max(1.4, Math.min(4, 900 / Math.sqrt(pts.length + 1) / 40))
  const rf = Math.max(1, Math.min(2.5, 700 / Math.sqrt(foot.length + 1) / 40))
  // scale bar: a round number of km close to a quarter of the width
  const kmW = (e - w) * 111.32 * kx
  const km = [10, 20, 50, 100, 200, 500, 1000].reduce((a, b) => (Math.abs(b - kmW / 4) < Math.abs(a - kmW / 4) ? b : a))
  const kmPx = (km / kmW) * W
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-sm bg-bg" role="img" aria-label={`Mini map: ${pts.length} hexagons with fire in this month`}>
        {foot.map((p, i) => <circle key={`f${i}`} cx={p.x} cy={p.y} r={rf} fill="var(--surface-3)" />)}
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="var(--text-faint)" strokeDasharray="3 3" />
        {[...pts].sort((a, b) => a.v - b.v).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fill={COUNT_COLORS[cls(p.v)]} />)}
        <g transform={`translate(10 ${H - 12})`}>
          <line x1={0} x2={kmPx} y1={0} y2={0} stroke="var(--text-muted)" strokeWidth={2} />
          <text x={kmPx + 5} y={0} dy="0.32em" className="fill-[var(--text-muted)] font-mono text-[9px]">{km} km</text>
        </g>
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">fewer
          <span className="inline-flex">{COUNT_COLORS.map((c) => <span key={c} className="h-2.5 w-3" style={{ background: c }} />)}</span>
          more days with fire in each {res === 7 ? '~5 km²' : '~36 km²'} hexagon ({fmtInt(vals[0])}–{fmtInt(vals[vals.length - 1])} days, raw satellite count)</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-surface-3" />ever had fire (2001–now)</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-3 border border-dashed border-text-faint" />region box</span>
      </div>
    </div>
  )
}
