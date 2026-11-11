// GET /api/live?region=punjab → last 72 h of near-real-time VIIRS detections (provisional), filtered like the record.
// FIRMS_MAP_KEY only on the server. Cached 45 min in memory + CDN; 10 s hard timeout; graceful empty state.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchLive } from './_lib/live.js'
import type { LiveFile, LiveResult } from './_lib/live.js'

const TTL = 45 * 60_000
const cache = new Map<string, { t: number; data: LiveResult }>()
const HEADERS = { 'cache-control': 'public, max-age=300, s-maxage=2700, stale-while-revalidate=900', 'access-control-allow-origin': '*' }

async function liveFile(region: string, origin: string): Promise<LiveFile | null> {
  for (const base of [join(process.cwd(), 'public', 'data', 'v1'), join(process.cwd(), 'web', 'public', 'data', 'v1')]) {
    try { return JSON.parse(await readFile(join(base, 'live', `${region}.json`), 'utf-8')) } catch { /* next */ }
  }
  try {
    const r = await fetch(`${origin}/data/v1/live/${region}.json`, { signal: AbortSignal.timeout(4000) })
    return r.ok ? r.json() : null
  } catch { return null }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const region = url.searchParams.get('region') ?? ''
  if (!/^[a-z_]{2,32}$/.test(region)) return Response.json({ ok: false, error: 'bad_region' }, { status: 400 })
  const hit = cache.get(region)
  if (hit && Date.now() - hit.t < TTL) return Response.json({ ...hit.data, cached: true }, { headers: HEADERS })
  const empty = (error: string): LiveResult => ({ ok: false, region, fetched_at: new Date().toISOString(), window_days: 3, sources: {}, count: 0,
    last_acq_utc: null, detections: [], dropped: { low_conf: 0, static: 0, outside_footprint: 0 }, note: 'Live feed unavailable', error })
  const key = process.env.FIRMS_MAP_KEY
  if (!key) return Response.json(empty('not_configured'), { status: 200 })
  const file = await liveFile(region, url.origin)
  if (!file) return Response.json(empty('unknown_region'), { status: 404 })
  try {
    const data = await Promise.race([
      fetchLive({ key, region, file, timeoutMs: 9_000 }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000)),
    ])
    if (data.ok) cache.set(region, { t: Date.now(), data })
    return Response.json(data, { headers: data.ok ? HEADERS : { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } })
  } catch (e) {
    return Response.json(empty(`FIRMS unavailable (${(e as Error).message})`), { headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } })
  }
}
