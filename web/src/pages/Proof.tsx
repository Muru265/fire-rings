import { scaleBand, scaleLinear } from 'd3-scale'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ChartCard from '../components/ChartCard'
import EmptyState from '../components/EmptyState'
import LineChart from '../components/LineChart'
import type { Series } from '../components/LineChart'
import { useJson, useRegion } from '../lib/api'
import { fmtCompact, fmtInt } from '../lib/format'
import { REGIONS } from '../lib/regions'
import { MONTHS, VIIRS_START } from '../lib/series'
import type { RegionDoc } from '../lib/types'
import { useWidth } from '../lib/useWidth'

const C_HARM = '#D97706'
const C_MODIS = '#3B8FCC'
const C_RAW = '#B45A93'
const REPO = 'https://github.com/Muru265/fire-rings'

interface V3 { years: number[]; raw: number[]; harmonized: number[]; modis_only: number[]; step_raw_pct: number; step_harm_pct: number; step_modis_pct: number; step_harm_ci: [number, number]; pettitt_p_raw: number; pettitt_p_harm: number; pass: boolean }
interface V1 { bias_pct: number; mape_pct: number; max_abs_pct: number; shape_r: number; pass: boolean; years: { y: number; err_pct: number | null; modis: number; pred: number }[] }
interface V4 { drift: { y: number; ratio: number | null; terra: number | null; aqua: number | null; rel_pct: number | null }[]; window_mean_ratio: number; post2020_mean_rel_pct: number | null }
interface MethodRes { method: string; tau: number; V1: V1; V3: V3; V4: V4; V9: Record<string, unknown> }
interface ValDoc { regions: Record<string, { summary: RegionDoc['validation']; results: Record<string, MethodRes> }> }

export default function Proof() {
  const val = useJson<ValDoc>('dataset/validation_v1.json')
  const [rid, setRid] = useState<string>('punjab')
  const doc = useRegion(rid)

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow">Validation</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">How we know it works</h1>
        <p className="mt-4 text-muted">
          VIIRS is converted into MODIS-equivalent fire-days using ratios fitted only on <strong className="text-text">July 2012 – December 2019</strong>,
          when both satellite families flew stable orbits. Every number below comes from <code className="num text-xs">pipeline/06_validate.py</code> and is tested out of sample.
        </p>
      </header>

      <div role="tablist" aria-label="Region" className="flex flex-wrap gap-1.5">
        {REGIONS.map((r) => (
          <button key={r.id} role="tab" aria-selected={rid === r.id} onClick={() => setRid(r.id)}
            className={`rounded-sm px-3 py-1.5 text-sm ${rid === r.id ? 'bg-surface-3 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'}`}>{r.name}</button>
        ))}
      </div>

      {val.status === 'loading' && <div className="card h-[320px] animate-pulse" />}
      {val.status === 'error' && <EmptyState title="Validation data unavailable"><p className="num text-xs">{val.error}</p></EmptyState>}
      {val.status === 'ready' && <ProofBody val={val.data} rid={rid} doc={doc.status === 'ready' ? doc.data : null} />}

      <DetectionTiming />

      <section aria-labelledby="lim-h">
        <h2 id="lim-h" className="font-display text-xl font-semibold">Limitations and what we do about them</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {LIMITS.map((l) => (
            <article key={l.t} className="card">
              <h3 className="font-display text-base font-semibold text-text">{l.t}</h3>
              <p className="mt-2 text-sm text-muted">{l.p}</p>
              <p className="mt-3 text-sm"><span className="eyebrow mr-1 !text-ok">Mitigation</span> <span className="text-muted">{l.m}</span></p>
            </article>
          ))}
        </div>
      </section>

      <section className="card max-w-4xl" aria-labelledby="method-h">
        <h2 id="method-h" className="font-display text-xl font-semibold">Method in six steps</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted marker:text-faint">
          <li><span className="text-text">Unify</span> 5 satellite streams from NASA FIRMS (Terra, Aqua, S-NPP, NOAA-20, NOAA-21): standard archive plus near-real-time, one schema, local solar day.</li>
          <li><span className="text-text">Filter identically</span>: drop low confidence; drop FIRMS volcano/static/offshore flags; mask H3 cells ever flagged static (incl. for NRT rows) and persistent non-seasonal cells.</li>
          <li><span className="text-text">Count fire cell-days</span>: one H3 res-6 hexagon (~36 km²) with ≥1 detection on one day. Robust to VIIRS splitting a big fire into many pixels.</li>
          <li><span className="text-text">Adjust coverage</span> for satellite outages (detected from the data, incl. regional gaps).</li>
          <li><span className="text-text">Calibrate</span> MODIS/VIIRS ratio of sums per calendar month on Jul 2012 – Dec 2019, shrunk to the region-wide ratio (τ by leave-one-year-out); Terra→Terra+Aqua before July 2002; NOAA-20→S-NPP after S-NPP ended.</li>
          <li><span className="text-text">Quantify uncertainty</span> with a year-block bootstrap ×500 plus Poisson noise; judge "normal" against 2003–2022.</li>
        </ol>
        <a href={`${REPO}/blob/main/METHODS.md`} className="mt-4 inline-block text-sm">Full method (METHODS.md) →</a>
      </section>
    </div>
  )
}

function ProofBody({ val, rid, doc }: { val: ValDoc; rid: string; doc: RegionDoc | null }) {
  const reg = val.regions[rid]
  if (!reg?.summary) return <EmptyState title="No validation for this region" />
  const s = reg.summary
  const res = reg.results[s.method]
  const low = s.low_activity
  return (
    <div className="space-y-6">
      {/* validation cards */}
      {low && (
        <div className="rounded-sm border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn" role="note">
          <strong>Too little fire to validate reliably.</strong> This region has only a handful of fire-days most months, so one or two fires can swing
          the test errors a lot. We show the numbers for transparency, but don't mark them pass or fail; on Explore the app says
          “too little fire to judge” instead of quoting ratios.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Out-of-sample annual error (V1)" value={`${res.V1.mape_pct}%`} status={low ? 'low' : res.V1.pass ? 'pass' : 'fail'}
          plain={low ? 'Too few fires for this test to mean much here.' : `We hid one year at a time (2012–2019), predicted it from the other years and compared with what the old satellite saw: off by ${res.V1.mape_pct}% on average.`}
          sub={`goal: error under 20% and bias within ±10% · bias ${res.V1.bias_pct}% (not always too high or too low)`} />
        <Stat label="Step at 2012 (V3)" value={`${s.step_raw_pct > 0 ? '+' : ''}${fmtInt(s.step_raw_pct)}% → ${s.step_harm_pct > 0 ? '+' : ''}${s.step_harm_pct}%`} status={low ? 'low' : res.V3.pass ? 'pass' : 'fail'}
          plain={low ? 'Too few fires for a reliable jump test.' : `Raw data says fire jumped ${fmtInt(s.step_raw_pct)}% when VIIRS arrived in 2012. After the fix: ${s.step_harm_pct > 0 ? '+' : ''}${s.step_harm_pct}%, close to the old satellite alone (${s.step_modis_pct > 0 ? '+' : ''}${s.step_modis_pct}%) — the fake jump is gone.`}
          sub={`jump test: before the fix p ${res.V3.pettitt_p_raw} (jump found); after p ${res.V3.pettitt_p_harm} (${res.V3.pettitt_p_harm > 0.05 ? 'no jump' : 'jump remains'})`} />
        <Stat label="Seasonal shape (r)" value={s.shape_r.toFixed(2)} status="info"
          plain={`Our predicted months follow the real seasonal pattern${s.shape_r >= 0.95 ? ' almost perfectly' : s.shape_r >= 0.85 ? ' closely' : ' only loosely'} (1.00 = perfect).`}
          sub="correlation of out-of-sample monthly predictions with MODIS, 2012–2019 · information, no fixed target" />
        <V9Card v9={res.V9} rid={rid} />
      </div>
      <p className="text-xs text-muted">
        Method used: <strong className="text-text">{s.method === 'pooled' ? 'single region-wide ratio (fallback 1)' : 'monthly ratios with shrinkage'}</strong> — {s.method_reason}.
        {low && ' Low-activity region: targets are reported but not judged; the app applies the "too little fire to judge" guard.'}
      </p>

      <BeforeAfter v3={res.V3} doc={doc} />
      <Drift v4={res.V4} />
      {doc && <KChart doc={doc} />}
      {doc && <Outages doc={doc} />}
    </div>
  )
}

type Status = 'pass' | 'fail' | 'info' | 'low'
const STATUS: Record<Status, [string, string]> = {
  pass: ['✓ pass', 'bg-ok/15 text-ok'],
  fail: ['✗ fail', 'bg-danger/15 text-danger'],
  info: ['ⓘ info', 'bg-accent-2/15 text-accent-2'],
  low: ['~ too little fire', 'bg-warn/15 text-warn'],
}

function Stat({ label, value, sub, plain, status, children }: { label: string; value: string; sub: string; plain?: string; status: Status; children?: React.ReactNode }) {
  const [txt, cls] = STATUS[status]
  return (
    <div className="card flex flex-col gap-1" data-status={status}>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow !text-[11px]">{label}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{txt}</span>
      </div>
      <span className="font-display text-[28px] font-semibold text-text">{value}</span>
      {plain && <span className="text-sm text-text">{plain}</span>}
      <span className="text-xs text-muted">{sub}</span>
      {children}
    </div>
  )
}

function V9Card({ v9, rid }: { v9: Record<string, unknown>; rid: string }) {
  const top = (v9.top3_harmonized as string[]) ?? []
  const status = (v9.status as Status) ?? 'info'
  const ev = v9.known_event as { event: string; source: { name: string; url: string } } | undefined
  const reason = v9.status_reason as string | undefined
  if (rid === 'se_australia' && ev) {
    const r = v9.black_summer_rank_harmonized as number
    return (
      <Stat label="Famous season (V9)" value={`#${r}`} status={status}
        plain={`The ${ev.event} ranks #${r} of ${v9.n_seasons} Jul–Jun seasons in our record — it matches the documented event.`}
        sub={`raw rank #${v9.black_summer_rank_raw} · seasons before Jul 2002 (Terra only) not ranked`}>
        <a href={ev.source.url} className="text-[11px]" target="_blank" rel="noreferrer">Source: {ev.source.name} ↗</a>
      </Stat>
    )
  }
  if (rid === 'punjab') {
    return <Stat label="Crop-burning peaks (V9)" value={((v9.octnov_top3_harmonized as number[]) ?? []).join(' · ')} status={status}
      plain="The three biggest October–November burning seasons in the harmonized record." sub={reason ?? ''} />
  }
  return <Stat label="Biggest seasons (V9)" value={top.slice(0, 2).join(' · ')} status={status}
    plain={`Biggest Jul–Jun seasons in the record (3rd: ${top[2] ?? '—'}).`} sub={reason ?? ''} />
}

function BeforeAfter({ v3, doc }: { v3: V3; doc: RegionDoc | null }) {
  // full record from the region file (complete years only); falls back to the V3 series
  const series: Series[] = useMemo(() => {
    if (!doc) {
      return [
        { id: 'raw', label: 'Raw (MODIS → VIIRS)', color: C_RAW, dashed: true, points: v3.years.map((y, i) => ({ x: y, y: v3.raw[i] })) },
        { id: 'modis', label: 'MODIS only', color: C_MODIS, width: 1.5, points: v3.years.map((y, i) => ({ x: y, y: v3.modis_only[i] })) },
        { id: 'harm', label: 'Harmonized', color: C_HARM, width: 2.5, points: v3.years.map((y, i) => ({ x: y, y: v3.harmonized[i] })) },
      ]
    }
    const years = [...new Set(doc.months.map((r) => r.y))].filter((y) => y < 2026)
    const agg = (f: (r: RegionDoc['months'][number]) => number | null) => years.map((y) => {
      const ms = doc.months.filter((r) => r.y === y)
      const v = ms.map(f)
      return { x: y, y: v.some((q) => q == null) || ms.length < 12 ? null : v.reduce((a, b) => a! + b!, 0)! }
    })
    return [
      { id: 'raw', label: 'Raw (MODIS → VIIRS)', color: C_RAW, dashed: true, points: agg((r) => (r.flags.includes('insufficient') ? null : r.y < VIIRS_START ? r.raw_modis : r.raw_viirs)) },
      { id: 'modis', label: 'MODIS only (drifts after 2020)', color: C_MODIS, width: 1.5, points: agg((r) => r.raw_modis) },
      { id: 'harm', label: 'Harmonized', color: C_HARM, width: 2.5, points: agg((r) => r.H) },
    ]
  }, [doc, v3])
  const table = {
    caption: 'Annual fire-days: raw concatenation, MODIS only, harmonized',
    columns: ['Year', 'Raw', 'MODIS only', 'Harmonized'],
    rows: series[0].points.map((p, i) => [p.x, p.y == null ? null : fmtInt(p.y), series[1].points[i].y == null ? null : fmtInt(series[1].points[i].y!), series[2].points[i].y == null ? null : fmtInt(series[2].points[i].y!)]),
  }
  return (
    <ChartCard id="ba" title="Before / after: the 2012 step disappears" table={table}
      subtitle={<>Annual fire-days (complete years). Raw jumps <strong className="text-text">{v3.step_raw_pct > 0 ? '+' : ''}{fmtInt(v3.step_raw_pct)}%</strong> when VIIRS arrives; harmonized changes {v3.step_harm_pct > 0 ? '+' : ''}{v3.step_harm_pct}% (90% CI {v3.step_harm_ci[0]} to {v3.step_harm_ci[1]}), in line with MODIS alone ({v3.step_modis_pct > 0 ? '+' : ''}{v3.step_modis_pct}%). Step = mean 2012–19 vs 2003–11.</>}>
      <LineChart series={series} yFormat={fmtCompact} annotations={[{ x: 2012, label: `VIIRS arrives · raw +${fmtInt(v3.step_raw_pct)}%` }]} yLabel="fire-days per year" />
    </ChartCard>
  )
}

function Drift({ v4 }: { v4: V4 }) {
  const pts = (k: 'ratio' | 'terra' | 'aqua') => v4.drift.map((d) => ({ x: d.y, y: d[k] }))
  const series: Series[] = [
    { id: 'modis', label: 'MODIS (Terra+Aqua) ÷ S-NPP', color: C_HARM, width: 2.5, points: pts('ratio') },
    { id: 'aqua', label: 'Aqua ÷ S-NPP', color: C_RAW, points: pts('aqua') },
    { id: 'terra', label: 'Terra ÷ S-NPP', color: C_MODIS, points: pts('terra') },
  ]
  const table = {
    caption: 'Yearly MODIS / VIIRS S-NPP fire cell-day ratio',
    columns: ['Year', 'MODIS ÷ S-NPP', 'vs 2013–19 mean', 'Terra ÷ S-NPP', 'Aqua ÷ S-NPP'],
    rows: v4.drift.map((d) => [d.y, d.ratio?.toFixed(3) ?? null, d.rel_pct != null ? `${d.rel_pct}%` : null, d.terra?.toFixed(3) ?? null, d.aqua?.toFixed(3) ?? null]),
  }
  return (
    <ChartCard id="drift" title="Why calibration stops at 2019: orbit drift" table={table}
      subtitle={<>Yearly ratio of MODIS to VIIRS S-NPP fire-days. Terra's orbit began drifting in 2020 and Aqua's in December 2021, changing the time of day they see fire.
        Mean change after 2020 vs the calibration window: <strong className="text-text">{v4.post2020_mean_rel_pct}%</strong>.</>}>
      <LineChart series={series} yFormat={(v) => v.toFixed(2)} xBand={[2012.5, 2019.5, 'calibration window']} height={300}
        annotations={[{ x: 2020, label: 'Terra drift' }, { x: 2021.95, label: 'Aqua drift' }, { x: 2023, label: 'MODIS 6.03 → 61.03' }]} yLabel="ratio" />
    </ChartCard>
  )
}

function KChart({ doc }: { doc: RegionDoc }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const k = doc.k
  if (!k?.month?.length) return null
  const H = 230
  const M = { t: 12, r: 12, b: 40, l: 44 }
  const x = scaleBand<number>().domain(MONTHS.map((_, i) => i)).range([M.l, w - M.r]).padding(0.35)
  const y = scaleLinear().domain([0, Math.max(...k.hi, ...(k.raw_month ?? [0])) * 1.1]).nice(4).range([H - M.b, M.t])
  const table = {
    caption: `Calibration ratio k (MODIS ÷ S-NPP) by month, ${doc.name}`,
    columns: ['Month', 'k (used)', '90% low', '90% high', 'unshrunk k', 'S-NPP cell-days in window', 'MODIS cell-days in window'],
    rows: MONTHS.map((mn, i) => [mn, k.month[i].toFixed(3), k.lo[i].toFixed(3), k.hi[i].toFixed(3), k.raw_month?.[i]?.toFixed(3) ?? null, fmtInt(k.B?.[i] ?? null), fmtInt(k.A?.[i] ?? null)]),
  }
  return (
    <ChartCard id="k" title="Calibration ratio by month" table={table}
      subtitle={<>k = MODIS ÷ VIIRS S-NPP fire-days, Jul 2012 – Dec 2019, with 90% bootstrap interval. {doc.method === 'pooled' ? `This region uses one ratio (${k.pool}) — see method note above.` : `Shrinkage τ = ${k.tau} toward the region-wide ratio ${k.pool}.`} Grey numbers: S-NPP fire-days behind each ratio.</>}>
      <div ref={ref}>
        <svg width={w} height={H} role="img" aria-label="Calibration ratio by month with intervals. Use View as table for values.">
          {y.ticks(4).map((t) => (
            <g key={t}><line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--text-faint)] font-mono text-[10px]">{t.toFixed(2)}</text></g>
          ))}
          <line x1={M.l} x2={w - M.r} y1={y(k.pool)} y2={y(k.pool)} stroke="var(--text-muted)" strokeDasharray="4 3" />
          <text x={w - M.r} y={y(k.pool) - 4} textAnchor="end" className="fill-[var(--text-muted)] font-mono text-[10px]">region-wide {k.pool}</text>
          {MONTHS.map((mn, i) => {
            const cx = x(i)! + x.bandwidth() / 2
            return (
              <g key={mn}>
                <line x1={cx} x2={cx} y1={y(k.lo[i])} y2={y(k.hi[i])} stroke={C_HARM} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
                {k.raw_month && <circle cx={cx} cy={y(k.raw_month[i])} r={3} fill="none" stroke="var(--text-faint)" />}
                <circle cx={cx} cy={y(k.month[i])} r={5} fill={k.low_n?.[i] ? 'var(--surface)' : C_HARM} stroke={k.low_n?.[i] ? C_HARM : 'var(--surface)'} strokeWidth={2}>
                  <title>{`${mn}: rate ${k.month[i].toFixed(2)} (90% ${k.lo[i].toFixed(2)}–${k.hi[i].toFixed(2)}), based on ${fmtInt(k.B?.[i] ?? null)} S-NPP fire-days${k.low_n?.[i] ? ' — few fires, low reliability' : ''}`}</title>
                </circle>
                {k.low_n?.[i] && <text x={cx} y={y(k.hi[i]) - 6} textAnchor="middle" className="fill-[var(--warn)] text-[9px]">few fires</text>}
                <text x={cx} y={H - 24} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10px]">{mn[0]}</text>
                <text x={cx} y={H - 10} textAnchor="middle" className="fill-[var(--text-faint)] font-mono text-[9px]">{fmtCompact(k.B?.[i] ?? null)}</text>
              </g>
            )
          })}
        </svg>
        <p className="text-xs text-muted">
          <strong className="text-text">How to read it:</strong> filled dot = the rate we use · small hollow ring = the raw monthly rate before shrinking ·
          bar = 90% range · dashed line = region-wide rate · grey numbers = how many S-NPP fire-days the rate rests on (more = more reliable) ·
          hollow orange dot + “few fires” = fewer than {k.low_n_threshold ?? 200} fire-days, low reliability.
          {doc.method !== 'pooled' && ` Shrinkage τ = ${k.tau} means months with few fires are pulled toward the region-wide rate.`}
        </p>
        {k.low_n?.some(Boolean) && doc.method !== 'pooled' && (
          <p className="mt-1 text-xs text-warn">
            {k.low_n.map((l, i) => (l ? `${MONTHS[i]} (${k.month[i].toFixed(2)})` : null)).filter(Boolean).join(', ')}: very few fires that month, so the rate is noisy.
            These months hold almost no fire, so they barely change any total (details: docs/validation_report.md).
          </p>
        )}
      </div>
    </ChartCard>
  )
}

function Outages({ doc }: { doc: RegionDoc }) {
  const q = doc.quality
  if (!q) return null
  const names: Record<string, string> = { TERRA: 'Terra (MODIS)', AQUA: 'Aqua (MODIS)', SNPP: 'Suomi-NPP (VIIRS)', N20: 'NOAA-20 (VIIRS)', N21: 'NOAA-21 (VIIRS)' }
  const rows: [string, string, string, number, string][] = []
  for (const [s, runs] of Object.entries(q.global_outages ?? {})) for (const [a, b, n] of runs) rows.push([names[s] ?? s, a, b, n, 'no detections anywhere (all regions)'])
  for (const [s, runs] of Object.entries(q.regional_gaps ?? {})) for (const [a, b, n] of runs) rows.push([names[s] ?? s, a, b, n, `no detections over ${doc.name} while its sibling satellite saw fire`])
  rows.sort((r1, r2) => r1[1].localeCompare(r2[1]))
  return (
    <section className="card" aria-labelledby="out-h">
      <h2 id="out-h" className="font-display text-lg font-semibold">Known outages detected and handled</h2>
      <p className="mt-1 text-xs text-muted">Found in the data (runs of ≥5 days for whole-system outages; ≥7 days for regional gaps). Months with ≥60% coverage are scaled up by days covered ÷ days operating; below 60% they are shown as "insufficient coverage", never guessed.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1.5 pr-3 font-medium">Satellite</th><th className="pr-3 font-medium">From</th><th className="pr-3 font-medium">To</th><th className="pr-3 text-right font-medium">Days</th><th className="font-medium">Kind</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.join()} className="border-t border-border">
                <td className="py-1.5 pr-3 text-text">{r[0]}</td><td className="num pr-3">{r[1]}</td><td className="num pr-3">{r[2]}</td><td className="num pr-3 text-right">{r[3]}</td><td className="text-muted">{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Static sources removed in {doc.name}: <span className="num text-text">{fmtInt(q.masked_static_total)}</span> detections in {fmtInt(q.known_static_cells)} flagged hexagons
        (incl. <span className="num text-text">{fmtInt(q.nrt_removed_known_static)}</span> near-real-time rows that carry no FIRMS static flag). <Link to="/data">Pipeline row counts →</Link></p>
    </section>
  )
}

interface TimingSeries { y: number; snpp_day: number; aqua_snpp: number | null; aqua_snpp_rel: number | null; aqua_n20_rel: number | null; terra_snpp_rel: number | null; night_share_rel: number | null }
interface TimingDoc { caveat: string; sources: { name: string; url: string }[]; checks: Record<string, { region: string; season: string; series: TimingSeries[]; aqua_rel_2022_2026: number; terra_rel_2022_2026: number; night_rel_2022_2026: number; aqua_n20_rel_2022_2026: number }> }

function DetectionTiming() {
  const t = useJson<TimingDoc>('dataset/punjab_timing_v1.json')
  if (t.status !== 'ready') return t.status === 'loading' ? <div className="card h-[300px] animate-pulse" /> : null
  const c = t.data.checks
  const p = c['punjab|Oct–Nov (rice residue)']
  const style: Record<string, Pick<Series, 'color' | 'dashed' | 'width'>> = {
    'punjab|Oct–Nov (rice residue)': { color: C_HARM, width: 3 },
    'punjab|Apr–May (wheat residue)': { color: C_RAW, dashed: true },
    'madagascar|Sep–Oct': { color: C_MODIS },
    'se_australia|Oct–Dec': { color: '#8492A6', dashed: true, width: 1.5 },
  }
  const names: Record<string, string> = { punjab: 'Punjab', madagascar: 'Madagascar', se_australia: 'SE Australia' }
  const series: Series[] = Object.entries(c).map(([k, v]) => ({
    id: k, label: `${names[v.region]} ${v.season.split(' (')[0]}`, ...style[k],
    points: v.series.map((s) => ({ x: s.y, y: s.aqua_snpp_rel })),
  }))
  const years = p.series.map((s) => s.y)
  const table = {
    caption: 'Daytime Aqua ÷ S-NPP fire cell-day ratio relative to 2013–2019, by season',
    columns: ['Year', ...series.map((s) => s.label), 'Punjab Oct–Nov S-NPP day cell-days'],
    rows: years.map((y, i) => [y, ...series.map((s) => s.points[i]?.y?.toFixed(2) ?? null), fmtInt(p.series[i].snpp_day)]),
  }
  const last = p.series.filter((s) => s.aqua_snpp_rel != null)
  return (
    <ChartCard id="timing" title="Detection-time caveat: Punjab's late-afternoon burning" table={table}
      subtitle={<>Polar-orbiting satellites only see fires burning at their overpass (~13:30 for VIIRS). Since Dec 2021 Aqua passes later in the afternoon. In Punjab's Oct–Nov season, Aqua now sees
        <strong className="text-text"> ×{p.aqua_rel_2022_2026.toFixed(1)}</strong> as much relative to VIIRS as in 2013–2019 (×{p.aqua_n20_rel_2022_2026.toFixed(1)} vs NOAA-20), rising to ×{last[last.length - 1].aqua_snpp_rel?.toFixed(1)} in {last[last.length - 1].y};
        other seasons stay flat. Fires seen at the ~1:30 am VIIRS pass rose ×{p.night_rel_2022_2026.toFixed(1)}. Together this supports independent reports (below) that burning moved after ~3 pm.</>}>
      <LineChart series={series} yFormat={(v) => `×${v.toFixed(1)}`} height={280} xBand={[2012.5, 2019.5, '2013–19 = ×1.0']}
        annotations={[{ x: 2021.95, label: 'Aqua drifts later' }]} yLabel="Aqua ÷ S-NPP vs 2013–19" />
      <p className="mt-3 rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
        Shown on Punjab Oct–Nov from 2022: “{t.data.caveat}” Harmonized numbers are <strong>not</strong> adjusted — we can't measure burning between overpasses.
        Recent years rest on few fires (S-NPP day cell-days: {p.series.filter((s) => s.y >= 2024).map((s) => `${s.y} ${fmtInt(s.snpp_day)}`).join(', ')}). Details: docs/punjab_timing.md.
      </p>
      {t.data.sources?.length > 0 && (
        <div className="mt-3 text-xs text-muted">
          <p className="font-semibold text-text">Independent reports of the later burning:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {t.data.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a></li>)}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}

const LIMITS = [
  { t: 'Fires lit after the overpass are missed', p: 'Polar orbiters see a place about twice a day. In Punjab, burning has shifted to late afternoon since 2022, after the ~13:30 VIIRS overpass, so recent Oct–Nov seasons are likely undercounted.',
    m: 'Measured from the data (Aqua÷VIIRS rise after Aqua drifted later), shown as a caveat on every affected month and in AI answers; numbers are not adjusted.' },
  { t: 'MODIS is ending and drifting', p: 'Terra (from 2020) and Aqua (from Dec 2021) drift to different overpass times, so MODIS counts after 2020 are not comparable with earlier years.',
    m: 'Calibration uses Jul 2012 – Dec 2019 only. After 2012 the record is VIIRS-based, so MODIS drift never enters it; the drift chart shows the evidence.' },
  { t: "You can't add detail to old data", p: 'VIIRS sees fires MODIS never could. Harmonized values are in MODIS-equivalent units, so small fires seen only by VIIRS are scaled away.',
    m: 'The unit is stated everywhere ("fire-days, MODIS-equivalent"); raw VIIRS detail stays available for 2012+ (seam slider, hotspot downloads).' },
  { t: 'Ratios vary with fire type', p: 'The MODIS/VIIRS ratio depends on fire size and season (e.g. small crop fires vs large forest fires), so one number per region can be biased in some months.',
    m: 'Monthly ratios with shrinkage, chosen by out-of-sample tests; regions fall back to a single ratio only when it validates better (recorded per region).' },
  { t: 'Before July 2002 there is only Terra', p: 'Aqua launched in mid-2002. Earlier months are Terra scaled by a Terra→Terra+Aqua ratio, so 2001–Jun 2002 rankings are less certain.',
    m: 'The ratio is fitted on 2002–2019 and its uncertainty is in the bootstrap interval. These months are shown hatched and labelled "Terra only", and are excluded from rankings, return periods, season ranks and similar years.' },
  { t: 'Recent months are provisional', p: 'Aug–Nov 2026 come from near-real-time files, which lack FIRMS static-source flags and may be revised.',
    m: 'Marked "provisional" everywhere; static locations learned from the archive are masked in NRT rows too.' },
  { t: 'Little fire, big percentages', p: 'In low-fire places (e.g. Mauritius) a handful of detections can swing a ratio wildly.',
    m: 'A low-activity guard (typical < 5 and value < 10 fire-days) replaces ratios with "too little fire to judge"; wide intervals are hatched.' },
]
