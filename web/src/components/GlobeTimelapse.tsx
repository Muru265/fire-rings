import { Link } from 'react-router-dom'
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

// P1.5 basemaps from NASA GIBS (no key). Layer names + tile templates checked in the GIBS WMTS GetCapabilities (11 Nov 2026):
// VIIRS_Black_Marble (2016 composite) and BlueMarble_NextGeneration, EPSG:3857 GoogleMapsCompatible_Level8.
type GlobeStyle = 'dark' | 'night' | 'day'
const GIBS: Record<Exclude<GlobeStyle, 'dark'>, string> = {
  night: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
  day: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
}
const STYLE_LABEL: Record<GlobeStyle, string> = { dark: 'Dark', night: 'Night lights', day: 'Day' }
function storedStyle(): GlobeStyle {
  try { const v = localStorage.getItem('fr.globeStyle'); return v === 'night' || v === 'day' ? v : 'dark' } catch { return 'dark' }
}
/** Zoom at which the globe fills ~88% of the smaller side of its box (globe diameter ≈ 512·2^z/π px). */
const fitZoom = (w: number, h: number) => Math.max(0.3, Math.min(2.2, Math.log2((0.88 * Math.min(w, h) * Math.PI) / 512)))

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
/** #78: the home globe stays a globe / country view; deeper zoom belongs to the region page (chip at the cap). */
const GLOBE_MAX_ZOOM = 6
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
  const [near, setNear] = useState<{ id: string; name: string } | null>(null)
  const docsRef = useRef(docs)
  useEffect(() => { docsRef.current = docs }, [docs])
  const [gstyle, setGstyle] = useState<GlobeStyle>(storedStyle)
  const maxH = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, Math.max(...d.months.map((r) => r.H ?? 0)) || 1])), [docs])

  useEffect(() => {
    if (!el.current) return
    const mp = new MlMap({
      container: el.current, style: 'https://tiles.openfreemap.org/styles/dark', center: [70, -5],
      // P1.5: zoom fitted to the map box, so the globe never runs under the playback panel
      zoom: fitZoom(el.current.clientWidth, el.current.clientHeight),
      attributionControl: { compact: true }, interactive: true, maxZoom: GLOBE_MAX_ZOOM,
    })
    map.current = mp
    ;(window as unknown as { __frGlobe?: MlMap }).__frGlobe = mp // for screenshot checks (zoom tests)
    mp.on('style.load', () => {
      mp.setProjection({ type: 'globe' })
      // P1.5: soft atmosphere glow at the globe's edge
      try {
        mp.setSky({ 'sky-color': '#0A0E14', 'horizon-color': '#1E3A5F', 'fog-color': '#0A0E14', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.9,
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.9, 6, 0] as never })
      } catch { /* older renderer: no glow */ }
    })
    mp.on('load', () => {
      tidyBasemap(mp, { borderOpacity: 0.35 })
      // NASA GIBS rasters above the style's land/water fills, below borders, labels and the fire layers
      const firstLine = mp.getStyle().layers.find((l) => l.type === 'line' || l.type === 'symbol')?.id
      for (const k of ['night', 'day'] as const) {
        mp.addSource(`gibs-${k}`, { type: 'raster', tiles: [GIBS[k]], tileSize: 256, maxzoom: 8, attribution: 'Imagery: NASA GIBS (VIIRS Black Marble · Blue Marble)' })
        mp.addLayer({ id: `gibs-${k}`, type: 'raster', source: `gibs-${k}`, layout: { visibility: 'none' },
          // night lights in grey so city lights never look like fire; day imagery dimmed so the hexagons keep contrast
          paint: k === 'night' ? { 'raster-saturation': -1, 'raster-brightness-max': 0.7, 'raster-contrast': 0.1 } : { 'raster-brightness-max': 0.62, 'raster-saturation': -0.25 } }, firstLine)
      }
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
    // #78: at the zoom cap near a hero region, offer its page instead of zooming further
    mp.on('moveend', () => {
      const c = mp.getCenter()
      const hit = mp.getZoom() >= GLOBE_MAX_ZOOM - 0.25
        ? docsRef.current.find((d) => { const [w, s, e, n] = d.bbox; return c.lng >= w - 1.5 && c.lng <= e + 1.5 && c.lat >= s - 1.5 && c.lat <= n + 1.5 }) : undefined
      setNear(hit ? { id: hit.id, name: hit.name.split(' (')[0] } : null)
    })
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

  // P1.5 style switcher (remembered per visitor)
  useEffect(() => {
    const mp = map.current
    if (!ready || !mp) return
    for (const k of ['night', 'day'] as const) if (mp.getLayer(`gibs-${k}`)) mp.setLayoutProperty(`gibs-${k}`, 'visibility', gstyle === k ? 'visible' : 'none')
    for (const id of ['hex-fill', 'hex6-fill']) if (mp.getLayer(id)) {
      mp.setPaintProperty(id, 'fill-outline-color', gstyle === 'day' ? '#0A0E14' : 'rgba(0,0,0,0)')
    }
    try { localStorage.setItem('fr.globeStyle', gstyle) } catch { /* private mode */ }
  }, [ready, gstyle])

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
      <div ref={el} className="min-h-0 w-full flex-1" role="region" aria-label="Globe showing monthly fire activity in the four hero regions"
        data-testid="globe-map" />
      {near && (
        <Link to={`/r/${near.id}`} className="absolute top-3 left-3 z-10 rounded-full border border-accent/60 bg-surface/90 px-3 py-1 text-xs font-semibold text-text no-underline backdrop-blur hover:bg-surface-2" data-testid="globe-explore-chip">
          Explore {near.name} →</Link>
      )}
        <div role="group" aria-label="Globe style" className="absolute top-3 right-3 z-10 flex rounded-sm border border-border bg-surface/85 p-0.5 text-[11px] backdrop-blur" data-testid="globe-style">
          {(['dark', 'night', 'day'] as GlobeStyle[]).map((k) => (
            <button key={k} onClick={() => setGstyle(k)} aria-pressed={gstyle === k}
              className={`rounded-[6px] px-2.5 py-1 ${gstyle === k ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}>{STYLE_LABEL[k]}</button>
          ))}
        </div>
      {/* QA #69 + P1.5: the panel always sits under the globe's box (never over it) */}
      {f && (
        <div className="z-10 mx-3 mb-3 rounded-card border border-border bg-surface/85 px-4 py-3 backdrop-blur lg:mx-auto lg:w-[calc(100%-24px)] lg:max-w-[760px]" data-testid="globe-panel">
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
            <span className="text-faint" data-testid="globe-caption">fire-days (MODIS-equivalent) · colour = busy vs that region’s own record · glow size = real number of fire-days (tiny places stay tiny) · hover for counts · zoom in for ~36 km² hexagons · hero regions only{gstyle !== 'dark' ? ' · basemap: NASA GIBS' : ''}</span>
          </div>
          {live && <LivePanelLine docs={docs} live={live} />}
        </div>
      )}
    </div>
  )
}
