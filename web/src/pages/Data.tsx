import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useJson, useMeta } from '../lib/api'
import { fmtInt, pctDiff2sig } from '../lib/format'
import Help from '../components/Help'
import { ModelHistory } from '../components/ModelCard'
import Freshness from '../components/Freshness'
import links from '../../content/links.json'

const REPO = 'https://github.com/Muru265/fire-rings'
const SITE = 'https://fire-rings.vercel.app'

const FILES = [
  { f: 'dataset/harmonized_monthly_regions_v1.csv', d: 'Harmonized monthly record, all regions, 2001-01 → current month (one row per region × month). Header comment line with citation.' },
  { f: 'dataset/harmonized_monthly_regions_v1.parquet', d: 'Same table as Parquet (typed columns).' },
  { f: 'dataset/calibration_k_v1.csv', d: 'Calibration ratios k (MODIS÷S-NPP), q (MODIS÷Terra), k′ (S-NPP÷NOAA-20) per region × month with 90% bootstrap intervals and overlap counts.' },
  { f: 'dataset/validation_v1.json', d: 'Full validation results per region and method: V1 leave-one-year-out errors, V3 step test, V4 drift, V9 seasons.' },
  { f: 'meta.json', d: 'Index of regions, data end date, last daily update, latest-month summaries, citation.' },
]

// Round 6: endpoints grouped for beginners. [endpoint, plain-English line, example URL]
type Ep = [string, string, string]
type GroupKind = 'history' | 'month' | 'model' | 'extras'
const API_GROUPS: { id: GroupKind; title: string; eps: Ep[] }[] = [
  { id: 'history', title: 'Regions & history', eps: [
    ['GET /data/v1/meta.json', 'The index: every region, the record span, the data end date and each region’s latest month.', '/data/v1/meta.json'],
    ['GET /data/v1/regions/{id}.json', 'Everything for one region: every month since 2001 (harmonized value + 90% range, raw values, flags, ratio to typical, percentile, rank), calibration ratios, validation, typical months and yearly totals.', '/data/v1/regions/madagascar.json'],
    ['GET /data/v1/api/series/{id}.json', 'A simple monthly table of harmonized vs raw (unconverted) values — for charts and indices that compare the fixed record with the naive one.', '/data/v1/api/series/punjab.json'],
  ] },
  { id: 'month', title: 'This month', eps: [
    ['GET /data/v1/daily/{id}.json', 'Day-by-day raw fire-days per month for both satellite families (the current month is refreshed every day).', '/data/v1/daily/mauritius.json'],
    ['GET /data/v1/watch.json', 'Fire Watch: each region’s status, the fixed rules that set it, and the raw-vs-harmonized alert backtest.', '/data/v1/watch.json'],
    ['GET /data/v1/api/projection/{id}.json', '“What to expect”: an end-of-month projection from the month so far vs the typical month, with how well that worked in past years (days 5/10/15/20/25).', '/data/v1/api/projection/punjab.json'],
    ['GET /data/v1/api/agent_check/{id}.json', 'Agent check of every Fire Watch-flagged month (current + 2013–2025): verdict set by fixed rules, each tool’s signal and numbers (detection times, NASA MCD64A1 burned area, geostationary), the step-by-step trace and sources.', '/data/v1/api/agent_check/punjab.json'],
    ['GET /api/live?region={id}', 'Last 72 hours of near-real-time detections (provisional — not part of the record).', '/api/live?region=punjab'],
    ['GET /api/hotspots?region=&start=&end=', 'The individual NASA FIRMS detections, filtered the same way as the record, for up to 31 days (CSV or JSON) — details below.', '/api/hotspots?region=punjab&start=2016-10-01&end=2016-10-31'],
  ] },
  { id: 'model', title: 'Model', eps: [
    ['GET /data/v1/api/likelihood/{id}.json', 'Fire likelihood for the scored month (target_month), per hexagon: [cell, score 0–1, decile 1–10, climatology score]. A planning aid, not a forecast of individual fires (published only while the model passes its test gate).', '/data/v1/api/likelihood/tanzania.json'],
    ['GET /data/v1/api/model_card.json', 'How the fire-likelihood model works and how well it tested: scored month, target, features, training years, scores vs the usual season, harmonized-vs-raw comparison, version.', '/data/v1/api/model_card.json'],
    ['GET /data/v1/api/model_history.json', 'Every automatic monthly retraining run: date, data end, current model vs challenger vs usual season, and the decision.', '/data/v1/api/model_history.json'],
  ] },
  { id: 'extras', title: 'Extras', eps: [
    ['GET /data/v1/api/power/{id}.json', 'NASA POWER monthly rainfall (mm) and 2 m temperature (°C) for the region, with 2003–2022 medians.', '/data/v1/api/power/se_australia.json'],
    ['GET /data/v1/api/reunion.json', 'Piton de la Fournaise volcano: daily detections per satellite next to Smithsonian GVP eruption dates.', '/data/v1/api/reunion.json'],
    ['GET /data/v1/hexes/{id}/{year}.json', 'Map tiles: fire-days per H3 hexagon for each month of a year (cell ids in hexes/{id}/cells.json).', '/data/v1/hexes/punjab/2016.json'],
    ['GET /api/health?scope=data', 'Service status (data version, FIRMS key present or not) — no AI call.', '/api/health?scope=data'],
  ] },
]

/** Small line icons (stroke = currentColor), one per endpoint group; the group title carries the meaning. */
function GroupIcon({ kind }: { kind: GroupKind }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-accent-2" aria-hidden="true">
      {kind === 'history' && <><circle cx="12" cy="12" r="8.5" {...p} /><circle cx="12" cy="12" r="5" {...p} /><circle cx="12" cy="12" r="1.5" {...p} /></>}
      {kind === 'month' && <><rect x="3.5" y="5" width="17" height="15" rx="2" {...p} /><path d="M3.5 9.5h17M8 3v4M16 3v4" {...p} /><path d="M12 18c-2 0-3-1.3-3-2.7 0-1.6 1.3-2.2 1.6-3.8 1 .8 1 1.8.8 2.4.7-.3 1-1 1-1.6 1.2 1 2.6 2 2.6 3.2 0 1.4-1.3 2.5-3 2.5z" {...p} /></>}
      {kind === 'model' && <><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" {...p} /><path d="M8.5 14.5l2.3-2.6 2 1.6 2.7-3.5" {...p} /></>}
      {kind === 'extras' && <><path d="M4 18l5-9 3 5 2-3 6 7z" {...p} /><circle cx="17" cy="6.5" r="2" {...p} /></>}
    </svg>
  )
}

function CopyUrl({ url }: { url: string }) {
  const [done, setDone] = useState(false)
  const abs = () => (typeof window !== 'undefined' ? window.location.origin : SITE) + url
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(abs()).then(() => { setDone(true); setTimeout(() => setDone(false), 1400) }).catch(() => {}) }}
      className="rounded-sm border border-border-strong px-2 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-text" aria-label={`Copy URL ${url}`}>
      {done ? 'Copied' : 'Copy URL'}
    </button>
  )
}

// Round 6: dictionary grouped, as bullets. [column(s), unit, meaning, glossary id for the ⓘ]
type Col = [string, string, string, string?]
const DICT_GROUPS: { title: string; note?: string; cols: Col[] }[] = [
  { title: 'Identity — which place and month', cols: [
    ['region', '—', 'Region id: punjab, madagascar, se_australia, mauritius, nt_savanna, ne_india, tanzania'],
    ['year, month', '—', 'Calendar month, counted on the local solar day (UTC + longitude/15 h)'],
  ] },
  { title: 'Counts — how much fire', cols: [
    ['H', 'fire-days, MODIS-equivalent', 'The harmonized monthly value. One fire-day = one H3 resolution-6 hexagon (~36 km²) with ≥1 kept detection on one solar day', 'fire-day'],
    ['H_lo, H_hi', 'fire-days', '90% range: 5th and 95th percentiles of 500 year-block bootstrap re-runs of the calibration (+ Poisson counting noise)', 'interval-90'],
    ['V_native, V_lo, V_hi', 'fire-days, VIIRS native', 'High detail (2012+): VIIRS 375 m fire-days as seen, S-NPP-equivalent (NOAA-20 × k′ after S-NPP data delivery ceased on 2 Nov 2026), not converted to MODIS units. H = k × V on these months', 'viirs-native'],
    ['raw_modis_celldays', 'fire-days', 'MODIS Terra ∪ Aqua fire-days, coverage-adjusted, not calibrated'],
    ['raw_viirs_celldays', 'fire-days', 'VIIRS fire-days (S-NPP to Oct 2026, NOAA-20 from Nov 2026), coverage-adjusted, not calibrated'],
    ['hotspots_modis, hotspots_viirs', 'detections', 'Raw hotspot counts after filters and masks (dots, not fire-days)', 'hotspot'],
    ['ratio_to_median', '×', 'H ÷ the typical (median) value of the same calendar month in 2003–2022', 'ratio'],
    ['pct_lo, pct_hi', 'percentile', 'Where the month ranks vs 2003–2022 (Weibull percentile), as a range over the bootstrap draws', 'percentile'],
  ] },
  { title: 'Harmonization — how the number was made', cols: [
    ['source', 'T | M | V | V2', 'T = Terra × q (2001 – Jun 2002) · M = MODIS Terra+Aqua · V = S-NPP × k · V2 = NOAA-20 × k × k′', 'harmonized-vs-raw'],
    ['method', '—', 'monthly (shrunk monthly k ratios) or pooled (one region-wide k ratio, fallback 1)', 'exchange-rate'],
    ['calib_version', '—', 'v1 — ratios fitted on Jul 2012 – Dec 2019 only', 'calibration-window'],
  ] },
  { title: 'Quality flags — how much to trust it', note: 'flags is a |-separated list; empty = nothing to report.', cols: [
    ['coverage_modis, coverage_viirs', '0–1', 'Share of the month’s days the satellite was operating (outages found from the data itself)', 'coverage'],
    ['flags: uncertain', '—', 'The 90% range is wider than half the value', 'uncertain'],
    ['flags: provisional', '—', 'Near-real-time data; may change when NASA reprocesses it', 'provisional'],
    ['flags: mtd', '—', 'Month to date — the month is not over yet', 'month-to-date'],
    ['flags: insufficient', '—', 'Coverage under 60% — no value given', 'insufficient-coverage'],
    ['flags: terra_only', '—', 'Jan 2001 – Jun 2002, before Aqua: Terra × q only, wider uncertainty, not ranked'],
    ['timing_check', 'verdict', 'Agent check of a Fire Watch-flagged month: Real change · Detection issue likely · Unclear · Not checkable yet (empty for months that were not flagged). Details per month in api/agent_check/{id}.json', 'agent-check'],
    ['flags: overpass_timing', '—', 'Punjab, October–November, 2022 onward: Aqua’s orbit drift after Dec 2021 shifts the detection time and burning has reportedly moved later in the day, so these months may be undercounted. A flag only — no number is changed', 'flag-overpass-timing'],
  ] },
  { title: 'Model — fire likelihood (api/likelihood/{id}.json, not in the CSV)', cols: [
    ['target_month, features_through', 'YYYY-MM', 'The month being scored, and the last complete month of data used (e.g. during November: November, using data up to October)'],
    ['cells[]: cell', 'H3 id', 'Resolution-6 hexagon id', 'h3-hexagon'],
    ['cells[]: score', '0–1', 'How likely ≥1 VIIRS fire-day is in the hexagon in the scored month (a ranking aid, not a forecast of individual fires)', 'likelihood-layer'],
    ['cells[]: decile', '1–10', 'Rank of the score within the region (10 = top 10%)'],
    ['cells[]: climatology', '0–1', 'The usual-season baseline: share of past years with fire in that hexagon and calendar month'],
  ] },
]

const JARGON: [string, string][] = [['fire-day', 'fire-day'], ['harmonized', 'harmonized-vs-raw'], ['H3 hexagon', 'h3-hexagon'], ['coverage', 'coverage'],
  ['uncertain', 'uncertain'], ['k ratio', 'exchange-rate'], ['bootstrap range', 'interval-90']]

const CFF = `cff-version: 1.2.0
message: "If you use this dataset or software, please cite it as below."
title: "Fire Rings Harmonized Hotspot Record"
version: 1.1.0
date-released: 2026-11-15
authors:
  - name: "Murugun Sharma Roma Rishi"
license: [MIT, CC-BY-4.0]
repository-code: "${REPO}"
url: "${SITE}"
keywords: [MODIS, VIIRS, active fire, FIRMS, harmonization, hotspots]
references:
  - type: data
    title: "NASA FIRMS MODIS C6.1 and VIIRS 375 m active fire detections"
    publisher: "NASA Fire Information for Resource Management System (FIRMS), ESDIS"
    url: "https://www.earthdata.nasa.gov/firms"`

export default function Data() {
  const par = useJson<{ start: string; end: string; api: number; record: number; diff_pct: number }>('api/hotspots_parity.json')
  const meta = useMeta()
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <p className="eyebrow">Open data</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">Fire Rings Harmonized Hotspot Record v1.1<Help id="data-page" /></h1>
        <p className="mt-2 text-sm" data-testid="doc-links"><Link to={links.paper}>Read the paper</Link> · <Link to={links.slides}>View the slides</Link></p>
        <p className="mt-4 text-muted">Open, versioned, citable. 25 years of MODIS and VIIRS active-fire detections in one consistent monthly unit, with uncertainty, for anyone to build on.</p>
        {meta.status === 'ready' && (
          <p className="num mt-3 text-xs text-faint">Data through {meta.data.data_end} · <Freshness /> · {meta.data.regions.length} regions · version {meta.data.version}</p>
        )}
      </header>

      <section aria-labelledby="start-h" data-testid="start-here">
        <h2 id="start-h" className="font-display text-xl font-semibold">Start here</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ['#downloads', 'I want a CSV', 'Download the harmonized monthly record for all regions — opens in Excel, R or Python.', 'harmonized_monthly_regions_v1.csv'],
            ['#open-api', 'I want the API', 'No key, no sign-up: plain JSON files any website or app can fetch, grouped by what you need.', '“Try it” links + copy buttons'],
            ['#dictionary', 'I want to understand the columns', 'Every column in plain English, grouped, with ⓘ explainers for the jargon.', 'Data dictionary'],
          ].map(([href, t, d, hint]) => (
            <li key={href}>
              <a href={href} className="card flex h-full flex-col gap-1.5 no-underline hover:border-border-strong hover:bg-surface-2">
                <span className="font-display text-base font-semibold text-text">{t} →</span>
                <span className="text-xs text-muted">{d}</span>
                <span className="num mt-auto pt-1 text-[11px] text-faint">{hint}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section id="downloads" aria-labelledby="dl-h" className="scroll-mt-24">
        <h2 id="dl-h" className="font-display text-xl font-semibold">Downloads</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {FILES.map((x) => (
            <li key={x.f} className="card flex flex-col gap-2">
              <a href={`/data/v1/${x.f}`} download className="num break-all text-sm">{x.f.split('/').pop()}</a>
              <span className="text-xs text-muted">{x.d}</span>
            </li>
          ))}
        </ul>
        {meta.status === 'ready' && (
          <div className="card mt-3">
            <h3 className="font-display text-sm font-semibold">Per region</h3>
            <div className="overflow-x-auto"><table className="mt-3 w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Region</th><th className="font-medium">Record</th><th className="font-medium">Method</th><th className="font-medium">Files</th></tr></thead>
              <tbody>
                {meta.data.regions.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-2 pr-2 text-text">{r.name}</td>
                    <td className="num pr-2">{r.first} → {r.last}</td>
                    <td className="pr-2">{r.method === 'pooled' ? 'single ratio' : 'monthly ratios'}</td>
                    <td className="flex flex-col gap-1">
                      <a href={`/data/v1/regions/${r.id}.json`} className="num">regions/{r.id}.json</a>
                      <a href={`/data/v1/daily/${r.id}.json`} className="num">daily/{r.id}.json</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </section>

      <section id="dictionary" aria-labelledby="dict-h" className="max-w-6xl scroll-mt-24" data-testid="dictionary">
        <h2 id="dict-h" className="font-display text-xl font-semibold">Data dictionary</h2>
        <p className="mt-1 text-sm text-muted">Columns of <span className="num">harmonized_monthly_regions_v1</span> (CSV and Parquet), grouped. The calendar CSV you export from Explore uses the same meanings.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {DICT_GROUPS.map((g) => (
            <div key={g.title} className="card">
              <h3 className="font-display text-sm font-semibold">{g.title}</h3>
              {g.note && <p className="mt-0.5 text-[11px] text-faint">{g.note}</p>}
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-muted">
                {g.cols.map(([c, u, m, help]) => (
                  <li key={c} className="leading-relaxed">
                    <span className="num text-text">{c}</span>{u !== '—' && <span className="text-faint"> ({u})</span>}{help && <Help id={help} />} — {m}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="open-api" aria-labelledby="api-h" className="max-w-6xl scroll-mt-24" data-testid="open-api">
        <h2 id="api-h" className="font-display text-xl font-semibold">Open API<Help id="open-api" /></h2>
        <p className="mt-2 text-sm text-muted">No key. Static files under <code className="num">/data/v1/</code> and the read-only GET endpoints below send
          <code className="num"> Access-Control-Allow-Origin: *</code>, so any website or app can call them from the browser. Machine-readable list:
          {' '}<a href="/data/v1/api/index.json" className="num">/data/v1/api/index.json</a>. Example apps built only on these calls: <a href="https://fire-rings-apps.vercel.app" target="_blank" rel="noreferrer">Fire Rings Apps ↗</a>.</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Jargon:</span>
          {JARGON.map(([t, id]) => <span key={id} className="inline-flex items-center">{t}<Help id={id} /></span>)}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {API_GROUPS.map((g) => (
            <div key={g.id} className="card" data-testid={`api-group-${g.id}`}>
              <h3 className="flex items-center gap-2 font-display text-base font-semibold"><GroupIcon kind={g.id} />{g.title}</h3>
              <ul className="mt-3 space-y-3">
                {g.eps.map(([e, d, ex]) => (
                  <li key={e} className="border-t border-border pt-2.5 first:border-0 first:pt-0">
                    <p className="num text-xs break-all text-text">{e}</p>
                    <p className="mt-0.5 text-xs text-muted">{d}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2">
                      <a href={ex} target="_blank" rel="noreferrer" className="rounded-sm bg-accent/15 px-2 py-0.5 text-[11px] font-semibold no-underline">Try it ↗</a>
                      <CopyUrl url={ex} />
                      <span className="num text-[11px] break-all text-faint">{ex}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <h3 className="mt-6 font-display text-base font-semibold">Hotspots for any search</h3>
        <p className="mt-1 text-sm text-muted"><code className="num">GET /api/hotspots</code> fetches NASA FIRMS detections (MODIS + VIIRS; standard archive where processed,
          near-real-time after) for up to <strong>31 days</strong> and applies the record’s filters: low confidence dropped, FIRMS volcano/static/offshore types dropped,
          the known-static H3 mask and the region footprint. Parameters: <code className="num">region</code> and/or <code className="num">bbox=W,S,E,N</code> (free boxes up to 12° a side),
          <code className="num"> start</code>, <code className="num">end</code> (YYYY-MM-DD), <code className="num">satellites=record|all</code>, <code className="num">format=csv|json</code>.
          Same query = no new NASA call (cached). If NASA’s service is busy you get HTTP 503 with a plain message. {par.status === 'ready' && <>Checked against the record: Punjab {par.data.start} to {par.data.end}, {fmtInt(par.data.api)} detections from the API vs {fmtInt(par.data.record)} in the record ({pctDiff2sig(par.data.api, par.data.record)}% difference).</>}</p>
        <pre className="num mt-3 overflow-x-auto rounded-sm border border-border bg-surface-2 p-4 text-xs text-text"><code>{`curl -s "${SITE}/api/hotspots?region=punjab&start=2020-11-01&end=2020-11-05" -o punjab.csv
curl -s ${SITE}/data/v1/api/projection/punjab.json | jq '.current'
curl -s ${SITE}/data/v1/regions/madagascar.json | jq '.latest | {y, m, value, ratio, pct}'`}</code></pre>
        <div className="mt-6"><ModelHistory compact /></div>
      </section>

      <section aria-labelledby="cite-h" className="max-w-4xl">
        <h2 id="cite-h" className="font-display text-xl font-semibold">Cite</h2>
        <p className="mt-2 text-sm text-muted" data-testid="citation-text">Murugun Sharma Roma Rishi (2026). Fire Rings Harmonized Hotspot Record v1.1. NASA Space Apps 2026, Port Louis. Derived from NASA FIRMS MODIS C6.1 and VIIRS 375 m active fire data. {SITE}</p>
        <div className="relative mt-3">
          <pre className="num overflow-x-auto rounded-sm border border-border bg-surface-2 p-4 text-xs text-text"><code>{CFF}</code></pre>
          <button onClick={() => { navigator.clipboard?.writeText(CFF).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
            className="absolute top-2 right-2 rounded-sm border border-border-strong bg-surface px-2 py-1 text-xs text-text hover:bg-surface-3">{copied ? 'Copied' : 'Copy CITATION.cff'}</button>
        </div>
      </section>

      <section aria-labelledby="lic-h" className="grid max-w-5xl gap-4 md:grid-cols-3">
        <h2 id="lic-h" className="sr-only">Licences and acknowledgements</h2>
        <div className="card"><h3 className="font-display text-sm font-semibold">Data licence</h3><p className="mt-2 text-xs text-muted">Derived dataset: <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Please cite Fire Rings and NASA FIRMS.</p></div>
        <div className="card"><h3 className="font-display text-sm font-semibold">Code licence</h3><p className="mt-2 text-xs text-muted">Pipeline and web app: <a href={`${REPO}/blob/main/LICENSE`}>MIT</a>. Libraries and sources in <a href={`${REPO}/blob/main/DATA_SOURCES.md`}>DATA_SOURCES.md</a>.</p></div>
        <div className="card"><h3 className="font-display text-sm font-semibold">NASA FIRMS</h3><p className="mt-2 text-xs text-muted">We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) (<a href="https://www.earthdata.nasa.gov/firms">earthdata.nasa.gov/firms</a>), part of NASA's Earth Science Data and Information System (ESDIS).</p></div>
      </section>

      <section aria-labelledby="log-h" className="max-w-3xl">
        <h2 id="log-h" className="font-display text-xl font-semibold">Changelog</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li data-testid="changelog-v11"><span className="num text-text">v1.1</span> · Nov 2026 · {meta.status === 'ready' ? `${meta.data.regions.length} regions: ${meta.data.regions.map((r) => r.name).join(', ')}` : 'More regions'} · fire-likelihood model (per hexagon, tested on unseen years) with automatic monthly retraining · daily updates of the current month from NASA FIRMS near-real-time data · <span className="num">overpass_timing</span> flag. Historical months unchanged; data through {meta.status === 'ready' ? meta.data.data_end : '…'}.</li>
          <li><span className="num text-text">v1.0</span> · Nov 2026 · First release: Punjab–Haryana, Madagascar, SE Australia and Mauritius; calibration window Jul 2012 – Dec 2019.</li>
        </ul>
      </section>
    </div>
  )
}
