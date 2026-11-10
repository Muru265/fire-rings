import { cellToLatLng } from 'h3-js'
import { fetchJson } from './api'
import type { MonthRec, RegionDoc } from './types'

export type Box = [number, number, number, number] // W, S, E, N

interface YearFile { y: number; m: number[][] }

const centroidCache = new Map<string, [number, number][]>()

/** res 6 (~36 km², all years) or res 7 (~5 km², native VIIRS 2012+, High detail mode — QA #44) */
export type HexRes = 6 | 7
const dir = (res: HexRes) => (res === 7 ? 'hexes7' : 'hexes')

export async function loadCells(region: string, res: HexRes = 6): Promise<{ ids: string[]; ll: [number, number][] }> {
  const ids = await fetchJson<string[]>(`${dir(res)}/${region}/cells.json`)
  const key = `${region}@${res}`
  if (!centroidCache.has(key)) centroidCache.set(key, ids.map((c) => cellToLatLng(c)))
  return { ids, ll: centroidCache.get(key)! }
}

export const loadYear = (region: string, y: number, res: HexRes = 6) => fetchJson<YearFile>(`${dir(res)}/${region}/${y}.json`)

/** Cells with fire-days in one month (raw cell-days of the primary stream). */
export async function monthCells(region: string, y: number, m: number, res: HexRes = 6): Promise<{ id: string; v: number }[]> {
  const [{ ids }, yf] = await Promise.all([loadCells(region, res), loadYear(region, y, res)])
  const arr = yf.m[m - 1] ?? []
  const out: { id: string; v: number }[] = []
  for (let i = 0; i < arr.length; i += 2) out.push({ id: ids[arr[i]], v: arr[i + 1] })
  return out
}

export const inBox = (lat: number, lng: number, b: Box) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]

/** Ratio applied to the primary stream for month r (same segments as the pipeline). */
export function factorOf(doc: RegionDoc, r: MonthRec): number | null {
  const i = r.m - 1
  switch (r.src) {
    case 'T': return doc.q?.month[i] ?? null
    case 'M': return 1
    case 'V': return doc.k.month[i] ?? null
    case 'V2': return doc.k.month[i] != null && doc.kprime ? doc.k.month[i] * doc.kprime.month[i] : null
  }
}

/**
 * Re-compute the monthly record for a lat/lon box inside a hero region from H3 r6 cell-days.
 * Uses the region's own ratios (k, q, k′) and coverage factors; no bootstrap interval (lo/hi = null) and no
 * per-month normal-ness stats — the box view is flagged as such in the UI.
 */
export async function boxRecord(doc: RegionDoc, box: Box): Promise<{ months: MonthRec[]; cells: number }> {
  const { ll } = await loadCells(doc.id)
  const keep = ll.map(([lat, lng]) => inBox(lat, lng, box))
  const years = await Promise.all(doc.hex_years.map((y) => loadYear(doc.id, y).catch(() => ({ y, m: [] as number[][] }))))
  const sums = new Map<string, number>()
  for (const yf of years) {
    yf.m.forEach((arr, mi) => {
      let s = 0
      for (let i = 0; i < arr.length; i += 2) if (keep[arr[i]]) s += arr[i + 1]
      sums.set(`${yf.y}-${mi + 1}`, s)
    })
  }
  const months = doc.months.map((r): MonthRec => {
    const raw = sums.get(`${r.y}-${r.m}`) ?? 0
    const cov = r.src === 'T' || r.src === 'M' ? r.cov_modis : r.cov_viirs
    const f = factorOf(doc, r)
    const ok = !r.flags.includes('insufficient') && cov != null && cov >= 0.6 && f != null
    const adj = ok ? raw / cov! : null
    return {
      ...r,
      H: adj == null ? null : Math.round(adj * f! * 10) / 10, lo: null, hi: null,
      raw_modis: r.y < 2012 ? adj : null, raw_viirs: r.y >= 2012 ? adj : null,
      hot_modis: null, hot_viirs: null, ratio: null, pct: null, rp: null, beyond: null, rank: null, guard: null,
      flags: r.flags.filter((f2) => f2 !== 'uncertain'),
    }
  })
  return { months, cells: keep.filter(Boolean).length }
}
