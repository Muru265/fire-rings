// Live layer core: last 3 days of VIIRS NOAA-20/21 near-real-time detections for a region from the FIRMS Area API,
// with the same filters as the pipeline (no low confidence; known-static H3 r9 cells masked; region footprint, which
// keeps e.g. Pakistani Punjab out of the India-only Punjab record). Never feeds the harmonized numbers.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { latLngToCell } from 'h3-js'

export interface LiveFile { region: string; bbox: [number, number, number, number]; footprint_res: number; footprint: string[]; static_r9: string[] }
export interface LiveResult {
  ok: boolean
  region: string
  fetched_at: string
  window_days: number
  sources: Record<string, { rows: number; kept: number; error?: string }>
  count: number
  last_acq_utc: string | null
  detections: [number, number, string, string, string, number | null, string][] // lat, lon, sat, t_utc, conf, frp, day/night
  dropped: { low_conf: number; static: number; outside_footprint: number }
  note: string
  error?: string
}

const SOURCES = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT']
const DAYS = 3

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2 || !lines[0].includes('latitude')) return []
  const h = lines[0].split(',')
  return lines.slice(1).map((l) => { const v = l.split(','); const o: Record<string, string> = {}; h.forEach((k, i) => { o[k] = v[i] }); return o })
}

export async function fetchLive(opts: { key: string; region: string; file: LiveFile; timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<LiveResult> {
  const f = opts.fetchImpl ?? fetch
  const area = opts.file.bbox.join(',')
  const fp = new Set(opts.file.footprint)
  const st = new Set(opts.file.static_r9)
  const res: LiveResult = {
    ok: false, region: opts.region, fetched_at: new Date().toISOString(), window_days: DAYS, sources: {}, count: 0, last_acq_utc: null,
    detections: [], dropped: { low_conf: 0, static: 0, outside_footprint: 0 },
    note: 'Near-real-time VIIRS (NOAA-20, NOAA-21), last 72 h, provisional. Same filters as the record; not part of the harmonized numbers.',
  }
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 10_000)
  const settled = await Promise.allSettled(SOURCES.map(async (s) => {
    const r = await f(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${opts.key}/${s}/${area}/${DAYS}`, { signal })
    const text = await r.text()
    if (!r.ok || /invalid|error/i.test(text.slice(0, 80))) throw new Error(`HTTP ${r.status}`)
    return { s, rows: parseCsv(text) }
  }))
  let last = ''
  settled.forEach((p, i) => {
    const s = SOURCES[i]
    if (p.status === 'rejected') { res.sources[s] = { rows: 0, kept: 0, error: String((p.reason as Error)?.message ?? p.reason).replace(opts.key, '***') }; return }
    let kept = 0
    for (const row of p.value.rows) {
      const lat = Number(row.latitude), lon = Number(row.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      if ((row.confidence ?? '').toLowerCase() === 'l') { res.dropped.low_conf++; continue }
      if (!fp.has(latLngToCell(lat, lon, opts.file.footprint_res))) { res.dropped.outside_footprint++; continue }
      if (st.has(latLngToCell(lat, lon, 9))) { res.dropped.static++; continue }
      const t = `${row.acq_date}T${String(row.acq_time ?? '').padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2')}Z`
      if (t > last) last = t
      res.detections.push([Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, row.satellite ?? '', t, (row.confidence ?? '').toUpperCase(),
        row.frp ? Number(row.frp) : null, row.daynight ?? ''])
      kept++
    }
    res.sources[s] = { rows: p.value.rows.length, kept }
  })
  res.count = res.detections.length
  res.last_acq_utc = last || null
  res.ok = Object.values(res.sources).some((s) => !s.error)
  if (!res.ok) res.error = 'FIRMS near-real-time feed unavailable'
  return res
}
