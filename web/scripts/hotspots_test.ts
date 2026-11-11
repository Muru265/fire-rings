// Tests for /api/hotspots (P1.2). Offline by default: input validation, call planning, filters, cache hit, demo redirect.
// With --parity (needs FIRMS_MAP_KEY): fetches Punjab Oct 2016 live from NASA FIRMS through the same code path and compares
// per-stream counts with the pre-saved record file → writes ../docs/hotspots_parity.md.
// Usage: npx tsx scripts/hotspots_test.ts            npx tsx --env-file=../.env scripts/hotspots_test.ts --parity
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FALLBACK_AVAIL, InputError, fetchHotspots, filterRows, parseQuery, planCalls } from '../api/_lib/hotspots.js'
import type { Dropped, LiveFile, Row } from '../api/_lib/hotspots.js'

const here = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(here, '../public/data/v1')
const REAL_KEY = process.env.FIRMS_MAP_KEY ?? ''
let failed = 0
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`); if (!ok) failed++ }
const R = ['punjab', 'madagascar', 'se_australia', 'mauritius']
const P = (s: string) => new URLSearchParams(s)
const err = (s: string) => { try { parseQuery(P(s), R, '2026-11-11'); return null } catch (e) { return e instanceof InputError ? e.code : 'other' } }

// ---- input validation ----------------------------------------------------------------------------------------------
check('valid region query', err('region=punjab&start=2016-10-01&end=2016-10-31') === null)
check('31 days max', err('region=punjab&start=2016-10-01&end=2016-11-01') === 'range_too_long')
check('unknown region', err('region=paris&start=2016-10-01') === 'bad_region')
check('missing area', err('start=2016-10-01') === 'missing_area')
check('bad date', err('region=punjab&start=2016-13-01') === 'bad_date')
check('fake calendar date', err('region=punjab&start=2016-02-30') === 'bad_date')
check('end before start', err('region=punjab&start=2016-10-05&end=2016-10-01') === 'bad_date')
check('before FIRMS record', err('region=punjab&start=1999-01-01') === 'bad_date')
check('future end', err('region=punjab&start=2026-11-10&end=2026-11-20') === 'bad_date')
check('box too large', err('bbox=0,0,20,20&start=2020-01-01') === 'box_too_large')
check('box inverted', err('bbox=10,0,5,5&start=2020-01-01') === 'bad_bbox')
check('box with region may be large', err('region=se_australia&bbox=140,-40,154,-28&start=2019-12-01') === null)
check('bad satellites', err('region=punjab&start=2016-10-01&satellites=goes') === 'bad_satellites')

// ---- call planning: SP vs NRT, ≤10 days per call, ±1 day margin, S-NPP → NOAA-20 at Nov 2026 ------------------------
const q1 = parseQuery(P('region=punjab&start=2016-10-01&end=2016-10-31'), R, '2026-11-11')
const c1 = planCalls(q1, FALLBACK_AVAIL)
check('Oct 2016: MODIS_SP + VIIRS_SNPP_SP only', c1.every((c) => c.source === 'MODIS_SP' || c.source === 'VIIRS_SNPP_SP'), c1.map((c) => `${c.source}@${c.date}+${c.days}`).join(' '))
check('every call ≤ 5 days', c1.every((c) => c.days <= 5 && c.days >= 1))
check('33 days covered per source (±1 margin)', ['MODIS_SP', 'VIIRS_SNPP_SP'].every((s) => c1.filter((c) => c.source === s).reduce((a, c) => a + c.days, 0) === 33))
const q2 = parseQuery(P('region=punjab&start=2026-10-20&end=2026-11-09'), R, '2026-11-11')
const c2 = planCalls(q2, FALLBACK_AVAIL)
check('Oct–Nov 2026: NRT, S-NPP then NOAA-20', c2.some((c) => c.source === 'VIIRS_SNPP_NRT') && c2.some((c) => c.source === 'VIIRS_NOAA20_NRT') && c2.every((c) => !c.source.endsWith('_SP')), c2.map((c) => `${c.source}@${c.date}+${c.days}`).join(' '))
const q3 = parseQuery(P('region=punjab&start=2020-01-01&end=2020-01-05&satellites=all'), R, '2026-11-11')
check('satellites=all adds NOAA-20 from 2018', planCalls(q3, FALLBACK_AVAIL).some((c) => c.source === 'VIIRS_NOAA20_SP'))

// ---- filters (same as the record) -----------------------------------------------------------------------------------
const live = JSON.parse(readFileSync(resolve(DATA, 'live/punjab.json'), 'utf-8')) as LiveFile
const masks = { footprint: new Set(live.footprint), res: live.footprint_res, static: new Set(live.static_r9) }
const d0: Dropped = { low_conf: 0, type: 0, static: 0, outside_footprint: 0, outside_box: 0, outside_dates: 0, unknown_satellite: 0 }
const rows: Row[] = []
const mk = (o: Partial<Record<string, string>>) => ({ latitude: '30.2', longitude: '75.5', acq_date: '2016-10-15', acq_time: '0800', satellite: 'Terra', confidence: '60', frp: '5', daynight: 'D', type: '0', ...o })
// a cell that is in the static mask: take its centre
const { cellToLatLng } = await import('h3-js')
const [slat, slon] = cellToLatLng(live.static_r9[0])
const kept = filterRows([
  mk({}), mk({ confidence: '20' }), mk({ type: '2' }), mk({ latitude: String(slat), longitude: String(slon) }),
  mk({ latitude: '31.5', longitude: '74.0' }), // Lahore, Pakistan: outside the India-only footprint
  mk({ acq_date: '2016-09-30', acq_time: '2330' }), // UTC Sep 30 23:30 + 5 h → solar Oct 1 → kept
  mk({ acq_date: '2016-10-31', acq_time: '2000' }), // solar Nov 1 → outside dates
  mk({ satellite: 'X9' }),
], 'MODIS_SP', q1, masks, d0, rows)
check('filters: 2 of 8 rows kept', kept === 2, JSON.stringify(d0))
check('filters: each reason counted once', d0.low_conf === 1 && d0.type === 1 && d0.static === 1 && d0.outside_footprint === 1 && d0.outside_dates === 1 && d0.unknown_satellite === 1)
check('filters: solar date assigned (UTC + lon/15 h)', rows.some((r) => r[3] === '2016-10-01'))
check('filters: MODIS conf binned like the record (60 → N)', rows.every((r) => r[5] === 'N'))

// ---- fetch path with a fake NASA, then the handler's cache + demo redirect -------------------------------------------
let nasaCalls = 0
const fake = (async (u: string) => {
  nasaCalls++
  if (String(u).includes('data_availability')) return new Response('data_id,min_date,max_date\n' + Object.entries(FALLBACK_AVAIL).map(([k, [a, b]]) => `${k},${a},${b}`).join('\n'))
  const head = 'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type'
  return new Response(`${head}\n30.2,75.5,320,1,1,2016-10-15,0800,Terra,MODIS,60,6.03,300,5,D,0\n`)
}) as typeof fetch
const res = await fetchHotspots({ key: 'TESTKEY', q: parseQuery(P('region=punjab&start=2016-10-10&end=2016-10-20'), R, '2026-11-11'), files: [live], avail: FALLBACK_AVAIL, fetchImpl: fake })
check('fetch path: ok with fake NASA', res.ok && res.rows.length >= 1, `${res.rows.length} rows, ${nasaCalls} calls`)
check('fetch path: key never in errors', !JSON.stringify(res).includes('TESTKEY'))

process.env.FIRMS_MAP_KEY = 'TESTKEY'
const realFetch = globalThis.fetch
globalThis.fetch = fake
const { GET } = await import('../api/hotspots.js')
process.chdir(resolve(here, '..'))
nasaCalls = 0
const u = 'http://localhost/api/hotspots?region=punjab&start=2016-10-10&end=2016-10-20'
const r1 = await GET(new Request(u))
const n1 = nasaCalls
const r2 = await GET(new Request(u))
check('handler: first call goes to NASA', r1.status === 200 && r1.headers.get('x-fire-rings-cache') === 'miss' && n1 > 0, `${n1} calls`)
check('cache hit: same query → no new NASA call', r2.headers.get('x-fire-rings-cache') === 'hit' && nasaCalls === n1)
check('CSV starts with a source + filters comment line', (await r2.text()).startsWith('# Fire Rings hotspots · Punjab–Haryana') )
check('CORS header on GET', r1.headers.get('access-control-allow-origin') === '*')
const r3 = await GET(new Request('http://localhost/api/hotspots?region=punjab&start=2016-10-01&end=2016-10-31'))
check('demo month served from the static file', r3.status === 307 && (r3.headers.get('location') ?? '').endsWith('/hotspots/demo/punjab_2016-10.csv'))
const r4 = await GET(new Request('http://localhost/api/hotspots?region=punjab&start=2016-10-01&end=2016-12-31'))
check('400 with a plain message on bad input', r4.status === 400 && (await r4.json()).message.includes('31 days'))
globalThis.fetch = realFetch

// ---- parity with the record (online) ---------------------------------------------------------------------------------
if (process.argv.includes('--parity')) {
  const key = REAL_KEY
  if (!key) { console.log('SKIP  parity: FIRMS_MAP_KEY not set'); }
  else {
    const q = parseQuery(P('region=punjab&start=2016-10-01&end=2016-10-31&format=csv'), R, '2026-11-11')
    const t0 = Date.now()
    const api = await fetchHotspots({ key, q, files: [live], avail: FALLBACK_AVAIL, timeoutMs: 120_000 })
    const rec = readFileSync(resolve(DATA, 'hotspots/demo/punjab_2016-10.csv'), 'utf-8').trim().split(/\r?\n/).slice(2)
    const count = (xs: string[]) => xs.reduce((m, s) => { m[s] = (m[s] ?? 0) + 1; return m }, {} as Record<string, number>)
    const a = count(api.rows.map((r) => r[4])), b = count(rec.map((l) => l.split(',')[4]))
    const lines = Object.keys({ ...a, ...b }).sort().map((s) => `| ${s} | ${(b[s] ?? 0).toLocaleString('en-GB')} | ${(a[s] ?? 0).toLocaleString('en-GB')} | ${(((a[s] ?? 0) - (b[s] ?? 0)) / Math.max(1, b[s] ?? 0) * 100).toFixed(2)}% |`)
    const tot = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0)
    const diff = Math.abs(tot(a) - tot(b)) / Math.max(1, tot(b))
    check(`parity: API vs record, Punjab Oct 2016 (${tot(a)} vs ${tot(b)})`, api.ok && diff < 0.01, `${(diff * 100).toFixed(2)}%`)
    writeFileSync(resolve(here, '../../docs/hotspots_parity.md'), `# /api/hotspots parity check\n\nGenerated by \`web/scripts/hotspots_test.ts --parity\` on ${new Date().toISOString().slice(0, 16)}Z.\n\n` +
      `Punjab–Haryana, 1–31 Oct 2016 (solar dates), satellites as in the record. "Record" = the detections behind the published numbers ` +
      `(FIRMS archive download → pipeline filters). "API" = NASA FIRMS Area API (${Object.entries(api.sources).map(([k, v]) => `${k}: ${v.calls} calls`).join(', ')}) → the same filters in \`web/api/_lib/hotspots.ts\`, ${Math.round((Date.now() - t0) / 1000)} s.\n\n` +
      `| stream | record | API | difference |\n|---|---|---|---|\n${lines.join('\n')}\n| **total** | ${tot(b).toLocaleString('en-GB')} | ${tot(a).toLocaleString('en-GB')} | ${(diff * 100).toFixed(2)}% |\n\n` +
      `Dropped by the API filters: ${Object.entries(api.dropped).map(([k, v]) => `${k} ${v.toLocaleString('en-GB')}`).join(', ')}.\n`)
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall hotspot tests passed')
process.exit(failed ? 1 : 0)
