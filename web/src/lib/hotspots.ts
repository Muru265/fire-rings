// P1.2/P1.3 client: hotspot detections for any month (≤31 days). Static files first (latest months + pre-saved demo
// months, so the demo never depends on NASA), otherwise GET /api/hotspots (server-side FIRMS call, cached).
export const BUSY = 'NASA’s data service is busy — try again in a few minutes; hexagons still work.'
export type Box = [number, number, number, number]
export interface HotQuery { region: string; start: string; end: string; bbox?: Box | null }

interface DemoIndex { files: { region: string; start: string; end: string; csv: string; csv_download?: string; json: string; rows: number }[] }
let demo: Promise<DemoIndex | null> | null = null
type DemoFile = DemoIndex['files'][number]
const demoIndex = () => (demo ??= fetch('/data/v1/hotspots/demo/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null))

export const monthRange = (y: number, m: number) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

export async function staticUrl(q: HotQuery, format: 'csv' | 'json', layout?: 'download'): Promise<string | null> {
  if (q.bbox) return null
  const d = (await demoIndex())?.files.find((f: DemoFile) => f.region === q.region && f.start === q.start && f.end === q.end)
  if (!d) return null
  if (layout) return d.csv_download ? `/data/v1/hotspots/demo/${d.csv_download}` : null   // demo months never depend on NASA
  return `/data/v1/hotspots/demo/${format === 'csv' ? d.csv : d.json}`
}

export const apiUrl = (q: HotQuery, format: 'csv' | 'json', layout?: 'download') =>
  `/api/hotspots?region=${q.region}${q.bbox ? `&bbox=${q.bbox.map((x) => x.toFixed(4)).join(',')}` : ''}&start=${q.start}&end=${q.end}&format=${format}${layout ? `&layout=${layout}` : ''}`

/** Round 8: the server splits download requests into ≤31-day chunks up to this many days (api/_lib/hotspots.ts DOWNLOAD_MAX_DAYS). */
export const DOWNLOAD_MAX_DAYS = 62
export const daysIn = (q: HotQuery) => Math.round((Date.parse(`${q.end}T00:00:00Z`) - Date.parse(`${q.start}T00:00:00Z`)) / 86_400_000) + 1

async function errorText(r: Response): Promise<string> {
  if (r.status === 503 || r.status === 429 || r.status === 504) return BUSY
  try { const j = await r.json(); return j.message ?? `Error ${r.status}` } catch { return r.status === 404 ? 'The hotspot service is not available on this server.' : `Error ${r.status}` }
}

/** Fetch the CSV (static or API) and save it. Returns null on success, or a calm message (incl. a truncation notice). */
export async function downloadHotspots(q: HotQuery, filename: string, layout?: 'download'): Promise<string | null> {
  const url = (await staticUrl(q, 'csv', layout)) ?? apiUrl(q, 'csv', layout)
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) return errorText(r)
    const type = r.headers.get('content-type') ?? ''
    if (!type.includes('csv') && !type.includes('text/plain')) return 'The hotspot service is not available on this server.'
    const truncated = r.headers.get('x-fire-rings-truncated') === 'yes'
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    return truncated ? 'Downloaded, but NOT complete: the first line of the file says which dates are missing — download the rest separately.' : null
  } catch {
    return BUSY
  }
}

export interface Dots { rows: [number, number, number, number][]; count: number; source: 'static' | 'api' }
const dotCache = new Map<string, Promise<Dots>>()

/** Map dots [lat, lon, sensor 0=MODIS 1=VIIRS, solar day]; cached per query for the session. Throws Error(message). */
export function loadDots(q: HotQuery): Promise<Dots> {
  const k = JSON.stringify(q)
  let p = dotCache.get(k)
  if (!p) {
    p = (async () => {
      const s = await staticUrl(q, 'json')
      const r = await fetch(s ?? apiUrl(q, 'json'), { signal: AbortSignal.timeout(60_000) }).catch(() => null)
      if (!r) throw new Error(BUSY)
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(r.ok ? 'The hotspot service is not available on this server.' : await errorText(r))
      const j = await r.json()
      if (!j.ok) throw new Error(j.message ?? BUSY)
      return { rows: j.rows, count: j.count ?? j.rows.length, source: s ? 'static' : 'api' } as Dots
    })()
    p.catch(() => dotCache.delete(k))
    dotCache.set(k, p)
  }
  return p
}
