// P1.2/P1.3 client: hotspot detections for any month (≤31 days). Static files first (latest months + pre-saved demo
// months, so the demo never depends on NASA), otherwise GET /api/hotspots (server-side FIRMS call, cached).
export const BUSY = 'NASA’s data service is busy — try again in a few minutes; hexagons still work.'
export type Box = [number, number, number, number]
export interface HotQuery { region: string; start: string; end: string; bbox?: Box | null }

interface DemoIndex { files: { region: string; start: string; end: string; csv: string; json: string; rows: number }[] }
let demo: Promise<DemoIndex | null> | null = null
type DemoFile = DemoIndex['files'][number]
const demoIndex = () => (demo ??= fetch('/data/v1/hotspots/demo/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null))

export const monthRange = (y: number, m: number) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

export async function staticUrl(q: HotQuery, format: 'csv' | 'json'): Promise<string | null> {
  if (q.bbox) return null
  const d = (await demoIndex())?.files.find((f: DemoFile) => f.region === q.region && f.start === q.start && f.end === q.end)
  return d ? `/data/v1/hotspots/demo/${format === 'csv' ? d.csv : d.json}` : null
}

export const apiUrl = (q: HotQuery, format: 'csv' | 'json') =>
  `/api/hotspots?region=${q.region}${q.bbox ? `&bbox=${q.bbox.map((x) => x.toFixed(4)).join(',')}` : ''}&start=${q.start}&end=${q.end}&format=${format}`

async function errorText(r: Response): Promise<string> {
  if (r.status === 503 || r.status === 429 || r.status === 504) return BUSY
  try { const j = await r.json(); return j.message ?? `Error ${r.status}` } catch { return r.status === 404 ? 'The hotspot service is not available on this server.' : `Error ${r.status}` }
}

/** Fetch the CSV (static or API) and save it. Returns null on success, or a calm message. */
export async function downloadHotspots(q: HotQuery, filename: string): Promise<string | null> {
  const url = (await staticUrl(q, 'csv')) ?? apiUrl(q, 'csv')
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) return errorText(r)
    const type = r.headers.get('content-type') ?? ''
    if (!type.includes('csv') && !type.includes('text/plain')) return 'The hotspot service is not available on this server.'
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    return null
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
