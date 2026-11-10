import { useState } from 'react'
import { useMeta } from '../lib/api'

const REPO = 'https://github.com/Muru265/fire-rings'
const SITE = 'https://fire-rings.vercel.app'

const FILES = [
  { f: 'dataset/harmonized_monthly_regions_v1.csv', d: 'Harmonized monthly record, all regions, 2001-01 → 2026-11 (one row per region × month). Header comment line with citation.' },
  { f: 'dataset/harmonized_monthly_regions_v1.parquet', d: 'Same table as Parquet (typed columns).' },
  { f: 'dataset/calibration_k_v1.csv', d: 'Calibration ratios k (MODIS÷S-NPP), q (MODIS÷Terra), k′ (S-NPP÷NOAA-20) per region × month with 90% bootstrap intervals and overlap counts.' },
  { f: 'dataset/validation_v1.json', d: 'Full validation results per region and method: V1 leave-one-year-out errors, V3 step test, V4 drift, V9 seasons.' },
  { f: 'meta.json', d: 'Index of regions, data end date, latest-month summaries, citation.' },
]

const DICT: [string, string, string][] = [
  ['region', '—', 'Region id: punjab, madagascar, se_australia, mauritius'],
  ['year, month', '—', 'Calendar month (local solar day = UTC + longitude/15 h)'],
  ['H', 'fire cell-days (MODIS-equivalent)', 'Harmonized monthly value. One fire cell-day = one H3 resolution-6 hexagon (~36 km²) with ≥1 kept detection on one solar day'],
  ['V_native, V_lo, V_hi', 'fire cell-days (VIIRS native)', 'High detail (2012+): VIIRS 375 m fire cell-days as seen, S-NPP-equivalent (NOAA-20 × k′ after S-NPP ended), not converted to MODIS units. V_lo/V_hi = 5th/95th percentile of Poisson counting noise. H = k × V on these months'],
  ['H_lo, H_hi', 'fire cell-days', '5th and 95th percentiles of 500 year-block bootstrap draws (+ Poisson noise)'],
  ['raw_modis_celldays', 'fire cell-days', 'MODIS Terra ∪ Aqua cell-days, coverage-adjusted, no calibration'],
  ['raw_viirs_celldays', 'fire cell-days', 'VIIRS cell-days (S-NPP to Oct 2026, NOAA-20 from Nov 2026), coverage-adjusted, no calibration'],
  ['hotspots_modis, hotspots_viirs', 'detections', 'Raw hotspot counts after filters and masks'],
  ['coverage_modis, coverage_viirs', '0–1', 'Share of days the satellite was operating (outages detected from the data)'],
  ['source', 'T | M | V | V2', 'T = Terra × q (2001 – Jun 2002) · M = MODIS Terra+Aqua · V = S-NPP × k · V2 = NOAA-20 × k × k′'],
  ['flags', '|-separated', 'uncertain (90% interval wider than half the value) · provisional (near-real-time) · insufficient (coverage < 60%) · mtd (month to date)'],
  ['ratio_to_median', '×', 'H ÷ median of the same calendar month in 2003–2022'],
  ['pct_lo, pct_hi', 'percentile', 'Weibull percentile vs 2003–2022, as a range over bootstrap draws'],
  ['method', '—', 'monthly (shrunk monthly ratios) or pooled (single region-wide ratio, fallback 1)'],
  ['calib_version', '—', 'v1 — ratios fitted on Jul 2012 – Dec 2019'],
]

const CFF = `cff-version: 1.2.0
message: "If you use this dataset or software, please cite it as below."
title: "Fire Rings Harmonized Hotspot Record"
version: 1.0.0
date-released: 2026-11-15
authors:
  - name: "Fire Rings team (NASA Space Apps 2026, Port Louis)"
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
  const meta = useMeta()
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <p className="eyebrow">Open data</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">Fire Rings Harmonized Hotspot Record v1.0</h1>
        <p className="mt-4 text-muted">Open, versioned, citable. 25 years of MODIS and VIIRS active-fire detections in one consistent monthly unit, with uncertainty, for anyone to build on.</p>
        {meta.status === 'ready' && (
          <p className="num mt-3 text-xs text-faint">Data through {meta.data.data_end} · generated {meta.data.generated} · {meta.data.regions.length} regions · version {meta.data.version}</p>
        )}
      </header>

      <section aria-labelledby="dl-h">
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

      <section aria-labelledby="dict-h">
        <h2 id="dict-h" className="font-display text-xl font-semibold">Data dictionary</h2>
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Columns of harmonized_monthly_regions_v1</caption>
            <thead className="bg-surface-2"><tr className="text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Column</th><th className="px-4 font-medium">Unit</th><th className="px-4 font-medium">Meaning</th></tr></thead>
            <tbody>
              {DICT.map(([c, u, m]) => (
                <tr key={c} className="border-t border-border align-top"><td className="num px-4 py-2 text-xs text-text">{c}</td><td className="px-4 py-2 text-xs text-muted">{u}</td><td className="px-4 py-2 text-xs text-muted">{m}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="api-h" className="max-w-4xl">
        <h2 id="api-h" className="font-display text-xl font-semibold">Static JSON API</h2>
        <p className="mt-2 text-sm text-muted">No key, no rate limit beyond the CDN. Every file is plain static JSON under <code className="num">/data/v1/</code>.</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[minmax(0,260px)_1fr]">
          {[
            ['GET /data/v1/meta.json', 'regions, data end, latest-month summaries'],
            ['GET /data/v1/regions/{id}.json', 'months[] (H, lo, hi, raw, flags, ratio, pct, rank…), k, validation, climatology, latest, annual, similar_years'],
            ['GET /data/v1/daily/{id}.json', '{"YYYY-MM": {"modis": [...], "viirs": [...]}} daily raw cell-days'],
            ['GET /data/v1/hexes/{id}/{year}.json', 'per-month [cellIndex, cell-days, …] pairs; cell ids in hexes/{id}/cells.json (H3 res 6)'],
            ['GET /data/v1/hotspots/{id}_{YYYY-MM}.csv', 'filtered detections for the latest months'],
          ].map(([e, d]) => (
            <div key={e} className="contents"><dt className="num break-all text-xs text-text">{e}</dt><dd className="text-xs text-muted">{d}</dd></div>
          ))}
        </dl>
        <pre className="num mt-4 overflow-x-auto rounded-sm border border-border bg-surface-2 p-4 text-xs text-text"><code>{`curl -s ${SITE}/data/v1/regions/madagascar.json \\
  | jq '.latest | {y, m, value, ratio, pct}'`}</code></pre>
      </section>

      <section aria-labelledby="cite-h" className="max-w-4xl">
        <h2 id="cite-h" className="font-display text-xl font-semibold">Cite</h2>
        <p className="mt-2 text-sm text-muted">Fire Rings Harmonized Hotspot Record v1.0 (2026). NASA Space Apps 2026, Port Louis. Derived from NASA FIRMS MODIS C6.1 and VIIRS 375 m active fire data. {SITE}</p>
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
        <ul className="mt-3 space-y-1 text-sm text-muted">
          <li><span className="num text-text">v1.0</span> · Nov 2026 · First release: 4 hero regions, calibration window Jul 2012 – Dec 2019, data through {meta.status === 'ready' ? meta.data.data_end : '…'}.</li>
        </ul>
      </section>
    </div>
  )
}
