// P1.2 Hotspots for any search: NASA FIRMS Area API (standard "SP" archive where processed, near-real-time "NRT" after),
// MODIS + VIIRS, with the SAME filters as the Fire Rings record:
//   1. low confidence dropped (MODIS 0–29, VIIRS "l")
//   2. FIRMS type 1/2/3 dropped (volcano, other static land source, offshore) — SP rows only; NRT has no type column
//   3. known-static + persistent H3 res-9 mask (static_r9 in live/{region}.json, written by pipeline/08_export.py)
//   4. region footprint (H3 cells with historical detections; keeps e.g. Pakistani Punjab out of the India-only record)
// Days are assigned by solar date (UTC + lon/15 h), like the record: we fetch one extra UTC day each side and filter.
// FIRMS_MAP_KEY stays on the server. Pure functions + an injectable fetch so tests run offline.
import { latLngToCell } from 'h3-js'

export interface LiveFile { region: string; bbox: [number, number, number, number]; footprint_res: number; footprint: string[]; static_r9: string[] }
export type Satellites = 'record' | 'all'
export interface Query { region: string | null; bbox: [number, number, number, number] | null; start: string; end: string; satellites: Satellites; format: 'csv' | 'json'; layout?: 'compact' | 'download' }
export type Row = [number, number, string, string, string, string, number | null, string, string] // lat, lon, t_utc, solar_date, stream, conf, frp, daynight, product

export const MAX_DAYS = 31
// Round 8: the Explore "Download hotspots (CSV)" button (layout=download) may ask for up to this many days; the server
// splits it into ≤ MAX_DAYS chunks. Longer ranges are refused with a plain message (never silently truncated).
export const DOWNLOAD_MAX_DAYS = 62
// FIRMS Area API day_range limit (checked 11 Nov 2026: "Invalid day range. Expects [1..5]")
export const CALL_DAYS = 5
export const MAX_BOX_SIDE = 12
export const MAX_BOX_AREA = 100 // deg²
export const RECORD_START = '2000-11-01'
// VIIRS stream used by the record (pipeline/config.yaml harmonized_segments): S-NPP to Oct 2026, NOAA-20 after
export const N20_TAKEOVER = '2026-11-01'

/** Fallback only, if /api/data_availability fails (values from FIRMS on 11 Nov 2026). */
export const FALLBACK_AVAIL: Record<string, [string, string]> = {
  MODIS_SP: ['2000-11-01', '2026-08-31'], MODIS_NRT: ['2026-09-01', '2026-11-11'],
  VIIRS_SNPP_SP: ['2012-01-20', '2026-07-31'], VIIRS_SNPP_NRT: ['2026-08-01', '2026-11-02'],
  VIIRS_NOAA20_SP: ['2018-04-01', '2026-07-31'], VIIRS_NOAA20_NRT: ['2026-08-01', '2026-11-11'],
  VIIRS_NOAA21_SP: ['2023-03-01', '2026-07-31'], VIIRS_NOAA21_NRT: ['2024-01-17', '2026-11-11'],
}

const DAY = 86_400_000
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)
const dayT = (s: string) => Date.parse(`${s}T00:00:00Z`)

export class InputError extends Error { constructor(public code: string, msg: string) { super(msg) } }

/** Validate and normalise query parameters. Throws InputError with a plain message. */
export function parseQuery(p: URLSearchParams, regions: string[], today = isoDay(Date.now())): Query {
  const region = p.get('region')
  const bboxS = p.get('bbox')
  if (region && !regions.includes(region)) throw new InputError('bad_region', `Unknown region. Use one of: ${regions.join(', ')}.`)
  let bbox: Query['bbox'] = null
  if (bboxS) {
    const v = bboxS.split(',').map(Number)
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) throw new InputError('bad_bbox', 'bbox must be W,S,E,N in decimal degrees.')
    const [w, s, e, n] = v
    if (w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) throw new InputError('bad_bbox', 'bbox must be W,S,E,N with W<E, S<N, inside ±180/±90.')
    if (!region && (e - w > MAX_BOX_SIDE || n - s > MAX_BOX_SIDE || (e - w) * (n - s) > MAX_BOX_AREA))
      throw new InputError('box_too_large', `Box too large: at most ${MAX_BOX_SIDE}° per side and ${MAX_BOX_AREA} square degrees.`)
    bbox = v.map((x) => Math.round(x * 1e4) / 1e4) as Query['bbox']
  }
  if (!region && !bbox) throw new InputError('missing_area', 'Give region=… or bbox=W,S,E,N.')
  const start = p.get('start') ?? '', end = p.get('end') ?? start
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || Number.isNaN(dayT(start)) || Number.isNaN(dayT(end)))
    throw new InputError('bad_date', 'start and end must be YYYY-MM-DD.')
  if (isoDay(dayT(start)) !== start || isoDay(dayT(end)) !== end) throw new InputError('bad_date', 'start and end must be real calendar dates.')
  if (end < start) throw new InputError('bad_date', 'end is before start.')
  if (start < RECORD_START) throw new InputError('bad_date', `FIRMS MODIS data start on ${RECORD_START}.`)
  if (end > today) throw new InputError('bad_date', 'end is in the future.')
  const days = (dayT(end) - dayT(start)) / DAY + 1
  const layout = p.get('layout') === 'download' ? 'download' : 'compact'
  const maxDays = layout === 'download' ? DOWNLOAD_MAX_DAYS : MAX_DAYS
  if (days > maxDays) throw new InputError('range_too_long', `At most ${maxDays} days per request (NASA FIRMS limits). Choose a shorter range.`)
  const sat = p.get('satellites') ?? 'record'
  if (sat !== 'record' && sat !== 'all') throw new InputError('bad_satellites', 'satellites must be "record" or "all".')
  const fmt = p.get('format') ?? 'csv'
  if (fmt !== 'csv' && fmt !== 'json') throw new InputError('bad_format', 'format must be csv or json.')
  if (layout === 'download' && fmt !== 'csv') throw new InputError('bad_format', 'layout=download is CSV only.')
  return { region, bbox, start, end, satellites: sat, format: fmt, layout }
}

export const cacheKey = (q: Query) => [q.region ?? '-', q.bbox?.join(',') ?? '-', q.start, q.end, q.satellites, q.format, q.layout ?? 'compact'].join('|')

/** Which FIRMS source to use per UTC day, then ≤5-day calls (FIRMS day_range limit). */
export function planCalls(q: Query, avail: Record<string, [string, string]>): { source: string; date: string; days: number }[] {
  const from = dayT(q.start) - DAY, to = dayT(q.end) + DAY // ±1 UTC day so solar dates at the edges are complete
  const within = (src: string, d: string) => !!avail[src] && d >= avail[src][0] && d <= avail[src][1]
  const pick = (family: string, d: string) => (within(`${family}_SP`, d) ? `${family}_SP` : within(`${family}_NRT`, d) ? `${family}_NRT` : null)
  const families = (d: string) => {
    const f = ['MODIS', d < N20_TAKEOVER ? 'VIIRS_SNPP' : 'VIIRS_NOAA20']
    if (q.satellites === 'all') { if (!f.includes('VIIRS_NOAA20')) f.push('VIIRS_NOAA20'); f.push('VIIRS_NOAA21'); if (!f.includes('VIIRS_SNPP')) f.push('VIIRS_SNPP') }
    return f
  }
  const calls: { source: string; date: string; days: number }[] = []
  const open = new Map<string, { source: string; date: string; days: number }>()
  for (let t = from; t <= to; t += DAY) {
    const d = isoDay(t)
    const today = new Set<string>()
    for (const fam of families(d)) {
      const src = pick(fam, d)
      if (!src) continue
      today.add(src)
      const c = open.get(src)
      if (c && c.days < CALL_DAYS && dayT(c.date) + c.days * DAY === t) c.days++
      else { const n = { source: src, date: d, days: 1 }; calls.push(n); open.set(src, n) }
    }
    for (const k of [...open.keys()]) if (!today.has(k)) open.delete(k)
  }
  return calls
}

const SAT: Record<string, string> = { Terra: 'TERRA', T: 'TERRA', Aqua: 'AQUA', A: 'AQUA', N: 'SNPP', NPP: 'SNPP', SNPP: 'SNPP', N20: 'N20', '1': 'N20', N21: 'N21', '2': 'N21' }

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2 || !lines[0].includes('latitude')) return []
  const h = lines[0].split(',')
  return lines.slice(1).map((l) => { const v = l.split(','); const o: Record<string, string> = {}; h.forEach((k, i) => { o[k] = v[i] }); return o })
}

export interface Dropped { low_conf: number; type: number; static: number; outside_footprint: number; outside_box: number; outside_dates: number; unknown_satellite: number }
export interface Result {
  ok: boolean
  query: Query
  fetched_at: string
  sources: Record<string, { calls: number; rows: number; kept: number; error?: string }>
  dropped: Dropped
  filters: string[]
  rows: Row[]
  busy?: boolean
  error?: string
}

/** Apply the record's filters to FIRMS rows of one source. Mutates `dropped`, pushes kept rows to `out`. */
export function filterRows(rows: Record<string, string>[], source: string, q: Query, masks: { footprint: Set<string> | null; res: number; static: Set<string> }, dropped: Dropped, out: Row[]): number {
  const product = source.endsWith('_SP') ? 'SP' : 'NRT'
  const modis = source.startsWith('MODIS')
  let kept = 0
  for (const r of rows) {
    const lat = Number(r.latitude), lon = Number(r.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const stream = SAT[r.satellite ?? '']
    if (!stream) { dropped.unknown_satellite++; continue }
    const c = r.confidence ?? ''
    const conf = modis ? (Number(c) < 30 ? 'L' : Number(c) < 80 ? 'N' : 'H') : c.toUpperCase()
    if (conf === 'L' || !conf) { dropped.low_conf++; continue }
    if (r.type != null && r.type !== '' && ['1', '2', '3'].includes(r.type)) { dropped.type++; continue }
    const hhmm = String(r.acq_time ?? '').padStart(4, '0')
    const tUtc = Date.parse(`${r.acq_date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`)
    const solar = isoDay(tUtc + (lon / 15) * 3_600_000)
    if (solar < q.start || solar > q.end) { dropped.outside_dates++; continue }
    if (q.bbox && (lon < q.bbox[0] || lon > q.bbox[2] || lat < q.bbox[1] || lat > q.bbox[3])) { dropped.outside_box++; continue }
    if (masks.footprint && !masks.footprint.has(latLngToCell(lat, lon, masks.res))) { dropped.outside_footprint++; continue }
    if (masks.static.has(latLngToCell(lat, lon, 9))) { dropped.static++; continue }
    out.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, `${r.acq_date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}Z`, solar, stream, conf,
      r.frp ? Number(r.frp) : null, r.daynight ?? '', product])
    kept++
  }
  return kept
}

/** Fetch + filter. `files` = live/{region}.json for the region (or every region intersecting a free box). */
export async function fetchHotspots(opts: {
  key: string; q: Query; files: LiveFile[]; avail: Record<string, [string, string]>; fetchImpl?: typeof fetch; timeoutMs?: number; concurrency?: number
  onCall?: () => void
}): Promise<Result> {
  const { q } = opts
  const f = opts.fetchImpl ?? fetch
  const regionFile = q.region ? opts.files.find((x) => x.region === q.region) ?? null : null
  const area = (() => {
    if (regionFile && q.bbox) {
      const b = regionFile.bbox
      const w = Math.max(b[0], q.bbox[0]), s = Math.max(b[1], q.bbox[1]), e = Math.min(b[2], q.bbox[2]), n = Math.min(b[3], q.bbox[3])
      return w < e && s < n ? [w, s, e, n] : null
    }
    return regionFile ? regionFile.bbox : q.bbox
  })()
  const filters = ['low confidence dropped (MODIS 0–29, VIIRS l)', 'FIRMS type 1/2/3 dropped (SP rows; NRT has no type)']
  const staticSet = new Set<string>()
  for (const file of regionFile ? [regionFile] : opts.files) for (const c of file.static_r9) staticSet.add(c)
  filters.push(staticSet.size ? `known-static + persistent H3 res-9 mask (${staticSet.size} cells${regionFile ? '' : ' from Fire Rings regions overlapping the box'})` : 'no static mask (box is outside the Fire Rings regions)')
  if (regionFile) filters.push(`region footprint (H3 res ${regionFile.footprint_res} cells with historical detections)`)
  if (q.bbox) filters.push(`box ${q.bbox.join(',')}`)
  filters.push('days by solar date (UTC + lon/15 h)')
  const res: Result = {
    ok: false, query: q, fetched_at: new Date().toISOString(), sources: {}, filters, rows: [],
    dropped: { low_conf: 0, type: 0, static: 0, outside_footprint: 0, outside_box: 0, outside_dates: 0, unknown_satellite: 0 },
  }
  if (!area) { res.ok = true; return res }
  const masks = { footprint: regionFile ? new Set(regionFile.footprint) : null, res: regionFile?.footprint_res ?? 6, static: staticSet }
  const calls = planCalls(q, opts.avail)
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 45_000)
  let i = 0
  const worker = async () => {
    while (i < calls.length) {
      const c = calls[i++]
      const s = (res.sources[c.source] ??= { calls: 0, rows: 0, kept: 0 })
      s.calls++
      opts.onCall?.()
      try {
        const r = await f(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${opts.key}/${c.source}/${area.join(',')}/${c.days}/${c.date}`, { signal })
        const text = await r.text()
        if (r.status === 429 || /exceed|too many/i.test(text.slice(0, 200))) { res.busy = true; throw new Error('busy') }
        if (!r.ok || /invalid|error/i.test(text.slice(0, 80))) throw new Error(`HTTP ${r.status}`)
        const rows = parseCsv(text)
        s.rows += rows.length
        s.kept += filterRows(rows, c.source, q, masks, res.dropped, res.rows)
      } catch (e) {
        const m = (e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message
        if (m === 'timeout') res.busy = true
        s.error = String(m).replace(opts.key, '***')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, calls.length) }, worker))
  res.rows.sort((a, b) => (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))
  const errs = Object.values(res.sources).filter((s) => s.error)
  res.ok = calls.length > 0 && errs.length === 0
  if (!calls.length) res.error = 'No FIRMS source covers these dates yet.'
  else if (errs.length) res.error = res.busy ? 'busy' : 'FIRMS returned an error for part of the request.'
  return res
}

export const CSV_COLS = 'lat,lon,t_utc,solar_date,stream,conf,frp_mw,daynight,product'

export function toCsv(r: Result, regionName: string | null): string {
  const q = r.query
  const src = Object.entries(r.sources).map(([k, v]) => `${k} ${v.calls} call${v.calls > 1 ? 's' : ''}`).join(', ') || 'none'
  const head = `# Fire Rings hotspots · ${regionName ?? 'custom box'}${q.bbox ? ` · box ${q.bbox.join(',')}` : ''} · ${q.start} to ${q.end} · satellites: ${q.satellites === 'record' ? 'as in the record (MODIS Terra+Aqua; VIIRS S-NPP to Oct 2026, NOAA-20 after)' : 'all (MODIS Terra+Aqua; VIIRS S-NPP, NOAA-20, NOAA-21)'} · source: NASA FIRMS Area API (${src}), fetched ${r.fetched_at} · filters: ${r.filters.join('; ')} · dropped: ${Object.entries(r.dropped).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} · SP = standard archive, NRT = near-real-time (provisional) · Data: NASA FIRMS (doi:10.5067/FIRMS/MODIS/MCD14ML, 10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002) via Fire Rings (fire-rings.vercel.app)`
  return [head, CSV_COLS, ...r.rows.map((x) => x.map((v) => (v == null ? '' : String(v))).join(','))].join('\n') + '\n'
}

/** Compact JSON for map dots: [lat, lon, sensor(0=MODIS,1=VIIRS), day-of-month(solar)]. */
export function toJson(r: Result) {
  return {
    ok: r.ok, query: r.query, fetched_at: r.fetched_at, sources: r.sources, dropped: r.dropped, filters: r.filters, count: r.rows.length,
    fields: ['lat', 'lon', 'sensor(0=MODIS,1=VIIRS)', 'solar_day'],
    rows: r.rows.map((x) => [Math.round(x[0] * 1e4) / 1e4, Math.round(x[1] * 1e4) / 1e4, x[4] === 'TERRA' || x[4] === 'AQUA' ? 0 : 1, Number(x[3].slice(8, 10))]),
  }
}


// ---- Round 8: "Download hotspots (CSV)" — readable columns, chunked ranges, explicit truncation ------------------
/** Split [start, end] into consecutive pieces of at most MAX_DAYS days. */
export function chunkRange(start: string, end: string, size = MAX_DAYS): [string, string][] {
  const out: [string, string][] = []
  for (let t = dayT(start); t <= dayT(end); t += size * DAY) out.push([isoDay(t), isoDay(Math.min(dayT(end), t + (size - 1) * DAY))])
  return out
}

const SAT_NAME: Record<string, [string, string]> = { TERRA: ['Terra', 'MODIS'], AQUA: ['Aqua', 'MODIS'], SNPP: ['Suomi NPP', 'VIIRS'], N20: ['NOAA-20', 'VIIRS'], N21: ['NOAA-21', 'VIIRS'] }
const NL = String.fromCharCode(10)
export const DOWNLOAD_COLS ='latitude,longitude,acq_date,acq_time_utc,local_solar_time,satellite,instrument,confidence,frp_mw,daynight,h3_r6'
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16)

export interface Coverage { requested: [string, string]; covered: [string, string] | null; truncated: string | null }

/** Download CSV: one comment line (source, request, retrieval, coverage/truncation), header, one row per detection. */
export function toDownloadCsv(r: Result, regionName: string | null, cov: Coverage, maxBytes = Infinity): { body: string; rows: number; truncated: string | null } {
  const q = r.query
  let truncated = cov.truncated
  const lines: string[] = []
  let bytes = 0
  for (const x of r.rows) {
    const [lat, lon, tUtc, solarDay, stream, conf, frp, dn] = x
    const t = Date.parse(tUtc)
    const solar = t + (lon / 15) * 3_600_000
    const [sat, inst] = SAT_NAME[stream] ?? [stream, '']
    const line = [lat, lon, tUtc.slice(0, 10), hhmm(t), `${solarDay} ${hhmm(solar)}`, sat, inst, conf, frp ?? '', dn, latLngToCell(lat, lon, 6)].join(',')
    if (bytes + line.length + 1 > maxBytes) {
      truncated = `size limit reached after ${lines.length.toLocaleString('en-GB')} detections (up to ${lines.length ? r.rows[lines.length - 1][3] : q.start}); choose a shorter range or a smaller box for the rest`
      break
    }
    lines.push(line)
    bytes += line.length + 1
  }
  const src = Object.entries(r.sources).map(([k, v]) => `${k} ${v.calls} call${v.calls > 1 ? 's' : ''}`).join(', ') || 'none'
  const head = `# Source: NASA FIRMS (MODIS C6.1 / VIIRS 375 m), raw detections — not harmonized; for the harmonized record use the fire-days CSV`
    + ` · request: ${regionName ?? 'custom box'}${q.bbox ? `, box ${q.bbox.join(',')}` : ''}, ${cov.requested[0]} to ${cov.requested[1]} (solar dates), satellites ${q.satellites}`
    + ` · retrieved ${r.fetched_at} via NASA FIRMS Area API (${src})`
    + ` · ${truncated ? `TRUNCATED — ${truncated}` : `complete for ${cov.requested[0]} to ${cov.requested[1]}`}`
    + ` · filters: ${r.filters.join('; ')} · confidence: N nominal, H high (low dropped) · times: acq_time_utc in UTC, local_solar_time = UTC + longitude/15 h`
    + ` · Data: NASA FIRMS (doi:10.5067/FIRMS/MODIS/MCD14ML, 10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002) via Fire Rings (fire-rings.vercel.app)`
  return { body: [head, DOWNLOAD_COLS, ...lines].join(NL) + NL, rows: lines.length, truncated }
}
