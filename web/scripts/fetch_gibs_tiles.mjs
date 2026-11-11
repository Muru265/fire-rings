// #76 One-off: download zoom levels 0–3 (1+4+16+64 = 85 tiles per layer) of exactly the NASA GIBS layers the home-globe
// switcher uses, so the default views never wait on GIBS (no grey squares). Polite: one request at a time, ≤ 4 req/s.
// Output: web/public/tiles/{layer}/{z}/{x}/{y}.{ext}. Re-running skips tiles already on disk.
// Usage: node scripts/fetch_gibs_tiles.mjs [maxZoom=3]
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../public/tiles')
const MAXZ = Number(process.argv[2] ?? 3)
// Same layer ids, dates and Web-Mercator endpoint as src/components/GlobeTimelapse.tsx (GIBS WMTS, GoogleMapsCompatible_Level8)
export const LAYERS = [
  { id: 'night', layer: 'VIIRS_Black_Marble', date: '2016-01-01', ext: 'png',
    url: (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png` },
  { id: 'day', layer: 'BlueMarble_NextGeneration', date: 'default (static)', ext: 'jpeg',
    url: (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg` },
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let bytes = 0, got = 0, skipped = 0
for (const L of LAYERS) {
  for (let z = 0; z <= MAXZ; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) {
        const f = resolve(OUT, L.id, String(z), String(x), `${y}.${L.ext}`)
        if (existsSync(f)) { bytes += statSync(f).size; skipped++; continue }
        const t0 = Date.now()
        let ok = false
        for (let a = 0; a < 3 && !ok; a++) {
          try {
            const r = await fetch(L.url(z, x, y), { headers: { 'user-agent': 'fire-rings-tile-cache/1.0' } })
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            const buf = Buffer.from(await r.arrayBuffer())
            mkdirSync(dirname(f), { recursive: true })
            writeFileSync(f, buf)
            bytes += buf.length; got++; ok = true
          } catch (e) { console.log(`retry ${L.id} ${z}/${x}/${y}: ${e.message}`); await sleep(2000 * (a + 1)) }
        }
        if (!ok) throw new Error(`failed ${L.id} ${z}/${x}/${y}`)
        await sleep(Math.max(0, 250 - (Date.now() - t0))) // ≤ 4 requests per second
      }
    }
  }
}
console.log(`tiles: ${got} downloaded, ${skipped} already present · total ${(bytes / 1e6).toFixed(1)} MB in public/tiles`)
