import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MlMap, Popup, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { loadCells, loadYear } from '../lib/hexes'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtInt } from '../lib/format'
import { agoText } from '../lib/live'
import type { LiveData } from '../lib/live'
import { MONTHS } from '../lib/series'
import { tidyBasemap } from '../lib/mapStyle'
import { fetchJson } from '../lib/api'
import Help from './Help'
import { cellToBoundary, cellToLatLng } from 'h3-js'
import type { RegionDoc } from '../lib/types'

setWorkerUrl(workerUrl)

interface Props { docs: RegionDoc[]; live?: Record<string, LiveData | null> }

function LivePanelLine({ docs, live }: { docs: RegionDoc[]; live: Record<string, LiveData | null> }) {
  const ok = docs.map((d) => live[d.id]).filter((l): l is LiveData => !!l?.ok)
  if (!Object.values(live).some(Boolean)) return <div className="mt-1.5 text-[11px] text-faint">LIVE (raw detections, last 72 h) · checking NASA FIRMS…</div>
  if (!ok.length) return <div className="mt-1.5 text-[11px] text-faint">LIVE (raw detections, last 72 h) · feed temporarily unavailable</div>
  const last = ok.map((l) => l.last_acq_utc).filter(Boolean).sort().pop() ?? null
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-accent-2">
      <span><strong>LIVE</strong> · raw detections, last 72 h (not fire-days) · last satellite pass {agoText(last)}:</span>
      {docs.map((d) => <span key={d.id}>{d.name.split(' (')[0]} <span className="num">{live[d.id]?.ok ? fmtInt(live[d.id]!.count) : '—'}</span></span>)}
      <span className="text-faint">near-real-time, provisional, not in the record<Help id="live-line" /></span>
    </div>
  )
}

type GlobeRegion = { m: Record<string, number[]>; top: number; poly: [number, number][][]; ctr: [number, number][] }
type Globe = { regions: Record<string, GlobeRegion>; globalTop: number }

/** Lazy-load the res-4 globe layer once the map is up; precompute outlines, a per-region top (colour) and one
 *  global top (glow size), so colour breathes per region while size shows the real amount (QA #70). */
function useGlobe(ready: boolean): Globe | null {
  const [g, setG] = useState<Globe | null>(null)
  useEffect(() => {
    if (!ready || g) return
    let alive = true
    fetchJson<{ regions: Record<string, { cells: string[]; m: Record<string, number[]> }> }>('globe.json').then((doc) => {
      if (!alive) return
      const out: Record<string, GlobeRegion> = {}
      const all: number[] = []
      for (const [id, r] of Object.entries(doc.regions)) {
        const vals = Object.values(r.m).flatMap((a) => a.filter((_, j) => j % 2 === 1)).sort((a, b) => a - b)
        all.push(...vals)
        out[id] = { m: r.m, top: vals[Math.floor(0.98 * (vals.length - 1))] || 1,
          poly: r.cells.map((c) => cellToBoundary(c, true) as [number, number][]),
          ctr: r.cells.map((c) => { const [la, lo] = cellToLatLng(c); return [lo, la] as [number, number] }) }
      }
      all.sort((a, b) => a - b)
      setG({ regions: out, globalTop: all[Math.floor(0.98 * (all.length - 1))] || 1 })
    }).catch(() => { /* the globe keeps its region markers */ })
    return () => { alive = false }
  }, [ready, g])
  return g
}

/** Zoom at which the globe switches from res-4 blocks / small-island dots to ~36 km² res-6 hexagons (QA #65). */
const FINE_ZOOM = 3.6
// same Inferno family as the map, started bright so the lowest values never look like holes (QA #65b, like #18)
const RAMP = ['interpolate', ['linear'], ['get', 't'], 0, '#A52C60', 0.3, '#D24A3E', 0.55, '#F07F17', 0.8, '#FBC12E', 1, '#FCFFA4']

/** Res-6 cells for one region-year, scaled per month so they add up to the published H (the same rule as globe.json). */
type Fine = { poly: Map<number, [number, number][]>; ids: string[]; m: number[][]; top: number }
const fineCache = new Map<string, Promise<Fine | null>>()
function loadFine(doc: RegionDoc, y: number): Promise<Fine | null> {
  const key = `${doc.id}@${y}`
  if (!fineCache.has(key)) {
    fineCache.set(key, Promise.all([loadCells(doc.id, 6), loadYear(doc.id, y, 6)]).then(([{ ids }, yf]) => {
      const m = yf.m.map((arr, mi) => {
        const rec = doc.months.find((r) => r.y === y && r.m === mi + 1)
        let tot = 0
        for (let j = 1; j < arr.length; j += 2) tot += arr[j]
        if (!rec?.H || tot <= 0) return []
        const out: number[] = []
        for (let j = 0; j < arr.length; j += 2) out.push(arr[j], (arr[j + 1] * rec.H) / tot)
        return out
      })
      const vals = m.flatMap((a) => a.filter((_, j) => j % 2 === 1)).sort((a, b) => a - b)
      return { poly: new Map(), ids, m, top: vals[Math.floor(0.98 * (vals.length - 1))] || 1 }
    }).catch(() => null))
  }
  return fineCache.get(key)!
}

/** 3D globe; hero regions glow with real fire hexagons (monthly harmonized fire-days), played 2001 → 2026. */
export default function GlobeTimelapse({ docs, live }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const frames = useMemo(() => docs[0]?.months.map((r) => ({ y: r.y, m: r.m })) ?? [], [docs])
  const [i, setI] = useState(() => Math.max(0, frames.findIndex((f) => f.y === 2019 && f.m === 9)))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const interacted = useRef(false)

  const globe = useGlobe(ready)
  const [fine, setFine] = useState(false)
  const maxH = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, Math.max(...d.months.map((r) => r.H ?? 0)) || 1])), [docs])

  useEffect(() => {
    if (!el.current) return
    const mp = new MlMap({
      container: el.current, style: 'https://tiles.openfreemap.org/styles/dark', center: [70, -5],
      zoom: window.innerWidth < 640 ? 0.9 : window.innerWidth < 1024 ? 1.3 : 1.75,
      attributionControl: { compact: true }, interactive: true,
    })
    map.current = mp
    ;(window as unknown as { __frGlobe?: MlMap }).__frGlobe = mp // for screenshot checks (zoom tests)
    mp.on('style.load', () => {
      mp.setProjection({ type: 'globe' })
    })
    mp.on('load', () => {
      tidyBasemap(mp, { borderOpacity: 0.35 })
      // QA #1/#65/#70: real fire hexagons. Colour = relative to the region's own record (seasons breathe);
      // glow size = absolute fire-days on one global scale (tiny places stay tiny).
      mp.addSource('hex', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      mp.addLayer({ id: 'hex-glow', type: 'circle', source: 'hex', maxzoom: FINE_ZOOM, filter: ['==', ['geometry-type'], 'Point'], paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['*', 9, ['get', 'a']], FINE_ZOOM, ['*', 30, ['get', 'a']]],
        'circle-color': RAMP as never, 'circle-blur': 1, 'circle-opacity': ['*', 0.75, ['get', 'a']] } })
      mp.addLayer({ id: 'hex-fill', type: 'fill', source: 'hex', maxzoom: FINE_ZOOM, filter: ['==', ['geometry-type'], 'Polygon'], paint: {
        'fill-color': RAMP as never, 'fill-opacity': ['interpolate', ['linear'], ['get', 't'], 0, 0.6, 1, 0.95] } })
      // zoomed in: ~36 km² hexagons (res 6), loaded lazily
      mp.addSource('hex6', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      mp.addLayer({ id: 'hex6-fill', type: 'fill', source: 'hex6', minzoom: FINE_ZOOM, paint: {
        'fill-color': RAMP as never, 'fill-opacity': ['interpolate', ['linear'], ['get', 't'], 0, 0.6, 1, 0.95] } })
      // small islands at world zoom: one soft dot sized by the real monthly total, not blocky res-4 hexes
      mp.addSource('small', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      mp.addLayer({ id: 'small-dot', type: 'circle', source: 'small', maxzoom: FINE_ZOOM, paint: {
        'circle-radius': ['+', 2, ['*', 22, ['get', 'a']]], 'circle-color': RAMP as never, 'circle-blur': 0.6, 'circle-opacity': 0.85 } })
      mp.addSource('fire', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      mp.addLayer({ id: 'fire-core', type: 'circle', source: 'fire', paint: {
        // the hexagons carry the fire now; the marker just anchors the label
        'circle-radius': 2.5, 'circle-color': '#E8EEF5', 'circle-opacity': 0.8,
        'circle-stroke-width': 1, 'circle-stroke-color': '#0A0E14' } })
      mp.addLayer({ id: 'fire-label', type: 'symbol', source: 'fire', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.6], 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#E8EEF5', 'text-halo-color': '#0A0E14', 'text-halo-width': 1.5 } })
      setReady(true)
    })
    // hover: the absolute numbers (QA #70)
    const pop = new Popup({ closeButton: false, closeOnClick: false, className: 'globe-pop', offset: 8 })
    const onHover = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as { name?: string; total?: number; v?: number; when?: string } | undefined
      if (!p?.name) return
      mp.getCanvas().style.cursor = 'pointer'
      pop.setLngLat(e.lngLat).setHTML(`<strong>${p.name}</strong> · ${p.when}<br>${fmtInt(p.total ?? 0)} fire-days in the region${p.v != null ? `<br>this hexagon ≈ ${p.v < 10 ? Number(p.v).toFixed(1) : fmtInt(p.v)}` : ''}<br><span style="opacity:.7">MODIS-equivalent</span>`).addTo(mp)
    }
    const offHover = () => { mp.getCanvas().style.cursor = ''; pop.remove() }
    for (const id of ['hex-fill', 'hex6-fill', 'small-dot']) { mp.on('mousemove', id, onHover); mp.on('mouseleave', id, offHover) }
    mp.on('zoomend', () => setFine(mp.getZoom() >= FINE_ZOOM))
    const stop = () => { interacted.current = true }
    mp.on('mousedown', stop); mp.on('touchstart', stop); mp.on('wheel', stop)
    let raf = 0
    let last = performance.now()
    const spin = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      if (!interacted.current && !reduced && mp.loaded()) {
        const c = mp.getCenter()
        mp.setCenter([c.lng + 0.6 * dt, c.lat])
      }
      raf = requestAnimationFrame(spin)
    }
    raf = requestAnimationFrame(spin)
    return () => { cancelAnimationFrame(raf); mp.remove(); map.current = null }
  }, [reduced])

  // draw current frame
  useEffect(() => {
    if (!ready || !map.current || !frames[i]) return
    const f = frames[i]
    const features = docs.map((d) => {
      const r = d.months.find((x) => x.y === f.y && x.m === f.m)
      const t = r?.H != null ? Math.sqrt(r.H / maxH[d.id]) : 0
      const [w, s, e, n] = d.bbox
      // marker on the main landmass: median detection position from the pipeline (not the bbox centre, which for
      // Mauritius incl. Rodrigues falls in the ocean)
      const at: [number, number] = d.geo?.anchor ?? [(w + e) / 2, (s + n) / 2]
      const c = t > 0.66 ? '#FCFFA4' : t > 0.4 ? '#FCA50A' : t > 0.2 ? '#DD513A' : '#932667'
      return { type: 'Feature' as const, properties: { t, c, name: d.name.split(' (')[0] }, geometry: { type: 'Point' as const, coordinates: at } }
    })
    ;(map.current.getSource('fire') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features })
    const when = `${MONTHS[f.m - 1]} ${f.y}`
    const totalOf = (d: RegionDoc) => d.months.find((x) => x.y === f.y && x.m === f.m)?.H ?? 0
    // small islands: one soft dot whose size is the real total on the global scale
    const gMax = Math.max(...docs.map((d) => maxH[d.id]))
    const small = docs.filter((d) => d.geo?.small).map((d) => {
      const tot = totalOf(d)
      return { type: 'Feature' as const, properties: { t: Math.sqrt(tot / maxH[d.id]), a: Math.sqrt(tot / gMax), name: d.name.split(' (')[0], total: tot, when },
        geometry: { type: 'Point' as const, coordinates: d.geo!.anchor } }
    })
    ;(map.current.getSource('small') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: small })
    if (globe) {
      const key = `${f.y}-${String(f.m).padStart(2, '0')}`
      type Feat = { type: 'Feature'; properties: Record<string, number | string>; geometry: { type: 'Polygon'; coordinates: [number, number][][] } | { type: 'Point'; coordinates: [number, number] } }
      const hf: Feat[] = []
      for (const d of docs) {
        if (d.geo?.small) continue
        const g = globe.regions[d.id]
        const arr = g?.m[key]
        if (!g || !arr) continue
        const props = { name: d.name.split(' (')[0], total: totalOf(d), when }
        for (let j = 0; j < arr.length; j += 2) {
          const v = arr[j + 1]
          const t = Math.min(1, Math.sqrt(v / g.top))
          const a = Math.min(1, Math.sqrt(v / globe.globalTop))
          hf.push({ type: 'Feature', properties: { t, a, v, ...props }, geometry: { type: 'Polygon', coordinates: [g.poly[arr[j]]] } })
          hf.push({ type: 'Feature', properties: { t, a }, geometry: { type: 'Point', coordinates: g.ctr[arr[j]] } })
        }
      }
      ;(map.current.getSource('hex') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: hf })
    }
    // zoomed in: res-6 hexagons for every region (lazy, per region-year)
    if (fine) {
      let alive = true
      Promise.all(docs.map((d) => loadFine(d, f.y).then((fd) => ({ d, fd })))).then((rs) => {
        if (!alive || !map.current) return
        const out: { type: 'Feature'; properties: Record<string, number | string>; geometry: { type: 'Polygon'; coordinates: [number, number][][] } }[] = []
        for (const { d, fd } of rs) {
          const arr = fd?.m[f.m - 1]
          if (!fd || !arr) continue
          const props = { name: d.name.split(' (')[0], total: totalOf(d), when }
          for (let j = 0; j < arr.length; j += 2) {
            const idx = arr[j]
            if (!fd.poly.has(idx)) fd.poly.set(idx, cellToBoundary(fd.ids[idx], true) as [number, number][])
            out.push({ type: 'Feature', properties: { t: Math.min(1, Math.sqrt(arr[j + 1] / fd.top)), v: arr[j + 1], ...props }, geometry: { type: 'Polygon', coordinates: [fd.poly.get(idx)!] } })
          }
        }
        ;(map.current.getSource('hex6') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: out })
      })
      return () => { alive = false }
    }
  }, [ready, i, frames, docs, maxH, globe, fine])

  // playback
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setI((x) => (x + 1) % frames.length), 260 / speed)
    return () => clearInterval(id)
  }, [playing, speed, frames.length])

  const f = frames[i]
  return (
    <div className="relative flex h-full w-full flex-col">
      <div ref={el} className="min-h-0 w-full flex-1" role="region" aria-label="Globe showing monthly fire activity in the four hero regions" />
      {/* QA #69: below large screens the panel sits under the globe instead of covering it */}
      {f && (
        <div className="z-10 mx-3 mb-3 rounded-card border border-border bg-surface/85 px-4 py-3 backdrop-blur lg:absolute lg:inset-x-3 lg:bottom-9 lg:mx-auto lg:mb-0 lg:max-w-[760px]">
          <div className="flex items-center gap-3">
            <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play 2001 to 2026'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-bg">{playing ? '❚❚' : '▶'}</button>
            <span className="num w-[104px] shrink-0 whitespace-nowrap text-lg font-semibold text-text sm:w-[128px] sm:text-2xl" aria-live="off">{MONTHS[f.m - 1].toUpperCase()} {f.y}</span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Month</span>
              <input type="range" min={0} max={frames.length - 1} value={i} onChange={(e) => { setI(Number(e.target.value)); setPlaying(false) }}
                aria-valuetext={`${MONTHS[f.m - 1]} ${f.y}`} className="seam h-1.5 w-full cursor-pointer appearance-none rounded-full"
                style={{ background: `linear-gradient(90deg, var(--accent) ${(100 * i) / (frames.length - 1)}%, var(--surface-3) ${(100 * i) / (frames.length - 1)}%)` }} />
            </label>
            <button onClick={() => setSpeed((s) => (s === 1 ? 4 : 1))} className="shrink-0 rounded-sm border border-border-strong px-2 py-1 font-mono text-xs text-text" aria-label={`Speed ${speed}×`}>{speed}×</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            {docs.map((d) => {
              const r = d.months.find((x) => x.y === f.y && x.m === f.m)
              return <span key={d.id}>{d.name.split(' (')[0]}: <span className="num text-text">{r?.H != null ? fmtInt(r.H) : '—'}</span></span>
            })}
            <span className="text-faint" data-testid="globe-caption">fire-days (MODIS-equivalent) · colour = busy vs that region’s own record · glow size = real number of fire-days (tiny places stay tiny) · hover for counts · zoom in for ~36 km² hexagons · hero regions only</span>
          </div>
          {live && <LivePanelLine docs={docs} live={live} />}
        </div>
      )}
    </div>
  )
}
