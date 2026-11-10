import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MlMapCtor, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONSource, LngLat, Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { cellToBoundary } from 'h3-js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchJson } from '../lib/api'
import { fmtCompact, fmtInt } from '../lib/format'
import { factorOf, monthCells } from '../lib/hexes'
import type { Box, HexRes } from '../lib/hexes'
import type { LiveData } from '../lib/live'
import { REGIONS } from '../lib/regions'
import { MAP_COLORS } from '../lib/scales'
import { tidyBasemap } from '../lib/mapStyle'
import Help from './Help'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'

const STYLE = 'https://tiles.openfreemap.org/styles/dark'
// MapLibre 6 resolves its worker next to its own module; after bundling that file doesn't exist, so hand it Vite's.
setWorkerUrl(workerUrl)

const C_MODIS = '#3B8FCC'
const C_VIIRS = '#D97706'
const C_LIVE = '#5AC8FA'
const POINT_ZOOM = 9
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

function boxFeature(b: Box) {
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const,
    coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } }
}

function triangleIcon(color: string, size = 18): { width: number; height: number; data: Uint8ClampedArray } {
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const g = c.getContext('2d')!
  g.beginPath(); g.moveTo(size / 2, 2); g.lineTo(size - 2, size - 3); g.lineTo(2, size - 3); g.closePath()
  g.fillStyle = color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#0A0E14'; g.stroke()
  return { width: size, height: size, data: g.getImageData(0, 0, size, size).data }
}

type Pt = { lat: number; lon: number; s: 0 | 1 }

async function monthPoints(doc: RegionDoc, y: number, m: number): Promise<Pt[] | null> {
  if (doc.geo?.small && doc.geo.points_years?.includes(y)) {
    const f = await fetchJson<{ m: [number, number, number, number][][] }>(`points/${doc.id}/${y}.json`)
    return (f.m[m - 1] ?? []).map(([lat, lon, s]) => ({ lat, lon, s: s as 0 | 1 }))
  }
  const key = `${y}-${String(m).padStart(2, '0')}`
  if (!doc.hotspot_months.includes(key)) return null
  const text = await fetch(`/data/v1/hotspots/${doc.id}_${key}.csv`).then((r) => r.text())
  return text.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('lat')).map((l) => {
    const v = l.split(',')
    return { lat: Number(v[0]), lon: Number(v[1]), s: v[4] === 'TERRA' || v[4] === 'AQUA' ? 0 : 1 }
  })
}

interface Props {
  doc: RegionDoc
  y: number
  m: number
  box: Box | null
  onBox: (b: Box | null) => void
  live?: LiveData | null
}

/** MapLibre map: fire-days per H3 cell for the selected month, detection points when zoomed in / small regions,
 *  optional live NRT layer, region presets, rectangle draw + lat/lon box. */
export default function MapView({ doc, y, m, box, onBox, live }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [stats, setStats] = useState<{ cells: number; min: number; max: number } | null>(null)
  const [pts, setPts] = useState<{ n: number; available: boolean } | null>(null)
  const [zoom, setZoom] = useState(0)
  // QA #17: live layer off by default on the map (the badge still shows the count); hexagons stay the main visual
  const [showLive, setShowLive] = useState(false)
  const [inInset, setInInset] = useState(false)
  const view = (doc.geo?.view_bbox ?? doc.bbox) as [number, number, number, number]
  const small = !!doc.geo?.small
  const clipped = doc.area_km2 != null
  const [inputs, setInputs] = useState<string[]>(() => (box ?? view).map((v) => v.toFixed(2)))
  const navigate = useNavigate()
  const drawRef = useRef(false)
  drawRef.current = drawing
  const [note, setNote] = useState<string | null>(null)
  const submitRef = useRef<(b: Box) => void>(() => {})

  useEffect(() => {
    if (!el.current) return
    const mp = new MlMapCtor({
      container: el.current, style: STYLE, bounds: view, fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
    })
    map.current = mp
    mp.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mp.on('error', (e) => {
      if (!mp.isStyleLoaded()) setErr(String((e as unknown as { error?: Error }).error?.message ?? 'Map failed to load'))
    })
    mp.on('zoomend', () => setZoom(mp.getZoom()))
    mp.on('load', () => {
      tidyBasemap(mp)
      setZoom(mp.getZoom())
      mp.addImage('tri-viirs', triangleIcon(C_VIIRS))
      // QA #20: outline only where the data really is a rectangle (a clip box); whole-country files follow the coastline
      mp.addSource('region', { type: 'geojson', data: clipped ? boxFeature(doc.bbox) : EMPTY })
      mp.addLayer({ id: 'region', type: 'line', source: 'region', paint: { 'line-color': '#93A1B3', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.7 } })
      mp.addSource('hex', { type: 'geojson', data: EMPTY })
      // softer hexagons so place names stay readable
      mp.addLayer({ id: 'hex', type: 'fill', source: 'hex', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 9, 0.5, 12, 0.3] } })
      mp.addLayer({ id: 'hex-line', type: 'line', source: 'hex', paint: { 'line-color': ['get', 'c'], 'line-width': 0.9, 'line-opacity': 0.9 } })
      mp.addSource('pts', { type: 'geojson', data: EMPTY })
      const pz = small ? 0 : POINT_ZOOM
      mp.addLayer({ id: 'pts-modis', type: 'circle', source: 'pts', minzoom: pz, filter: ['==', ['get', 's'], 0],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 13, 6], 'circle-color': C_MODIS, 'circle-stroke-color': '#0A0E14', 'circle-stroke-width': 1 } })
      mp.addLayer({ id: 'pts-viirs', type: 'symbol', source: 'pts', minzoom: pz, filter: ['==', ['get', 's'], 1],
        layout: { 'icon-image': 'tri-viirs', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 0.9], 'icon-allow-overlap': true } })
      mp.addSource('live', { type: 'geojson', data: EMPTY })
      // small, faint, filled dots drawn beneath the hexagons (QA #17)
      mp.addLayer({ id: 'live', type: 'circle', source: 'live', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 8, 2, 12, 4], 'circle-color': C_LIVE, 'circle-opacity': 0.55,
        'circle-stroke-width': 0 } }, 'hex')
      mp.addSource('box', { type: 'geojson', data: EMPTY })
      mp.addLayer({ id: 'box-fill', type: 'fill', source: 'box', paint: { 'fill-color': '#5AC8FA', 'fill-opacity': 0.06 } })
      mp.addLayer({ id: 'box-line', type: 'line', source: 'box', paint: { 'line-color': '#5AC8FA', 'line-width': 2 } })
      setReady(true)
    })
    // rectangle drawing
    let start: LngLat | null = null
    const toBox = (a: LngLat, b: LngLat): Box =>
      [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)]
    mp.on('mousedown', (e: MapMouseEvent) => {
      if (!drawRef.current) return
      e.preventDefault()
      mp.dragPan.disable()
      start = e.lngLat
    })
    mp.on('mousemove', (e: MapMouseEvent) => {
      if (!start) return
      ;(mp.getSource('box') as GeoJSONSource)?.setData(boxFeature(toBox(start, e.lngLat)))
    })
    mp.on('mouseup', (e: MapMouseEvent) => {
      if (!start) return
      const b = toBox(start, e.lngLat)
      start = null
      mp.dragPan.enable()
      setDrawing(false)
      if (b[2] - b[0] > 0.02 && b[3] - b[1] > 0.02) submitRef.current(b)
    })
    return () => { mp.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  // month hexes — High detail mode uses finer res-7 hexagons (~5 km², native VIIRS) so the 375 m detail shows (QA #44)
  const res: HexRes = doc.mode === 'detail' && y >= 2012 ? 7 : 6
  useEffect(() => {
    if (!ready || !map.current) return
    let alive = true
    // QA #19: same unit as the rest of the page — Long-term multiplies raw cell-days by the month's ratio (k, q or k·k′)
    // → MODIS-equivalent; High detail is native VIIRS (factor 1, or k′ for NOAA-20 months)
    const rec = doc.months.find((r) => r.y === y && r.m === m)
    const f = (rec && factorOf(doc, rec)) ?? 1
    monthCells(doc.id, y, m, res).then((raw) => {
      if (!alive || !map.current) return
      const cells = raw.map((c) => ({ id: c.id, v: c.v * f }))
      const vals = cells.map((c) => c.v).sort((a, b) => a - b)
      const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0
      const breaks = [1, 2, 3, 4, 5, 6].map((i) => q(i / 7))
      const cls = (v: number) => { let c = 0; while (c < breaks.length && v > breaks[c]) c++; return c }
      const features = cells.map((c) => ({
        type: 'Feature' as const, properties: { v: c.v, c: MAP_COLORS[cls(c.v)] },
        geometry: { type: 'Polygon' as const, coordinates: [cellToBoundary(c.id, true)] },
      }))
      ;(map.current.getSource('hex') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features })
      setStats({ cells: cells.length, min: vals[0] ?? 0, max: vals[vals.length - 1] ?? 0 })
    }).catch((e: Error) => alive && setErr(e.message))
    return () => { alive = false }
  }, [ready, doc, y, m, res])

  // detection points (small regions: always; large regions: latest months, drawn from zoom 9)
  useEffect(() => {
    if (!ready || !map.current) return
    let alive = true
    monthPoints(doc, y, m).then((p) => {
      if (!alive || !map.current) return
      ;(map.current.getSource('pts') as GeoJSONSource)?.setData(p ? { type: 'FeatureCollection', features: p.map((q) => ({
        type: 'Feature' as const, properties: { s: q.s }, geometry: { type: 'Point' as const, coordinates: [q.lon, q.lat] } })) } : EMPTY)
      setPts({ n: p?.length ?? 0, available: p != null })
    }).catch(() => alive && setPts({ n: 0, available: false }))
    return () => { alive = false }
  }, [ready, doc, y, m])

  // live NRT layer (provisional, separate from the record)
  useEffect(() => {
    if (!ready || !map.current) return
    const feats = showLive && live?.ok ? live.detections.map((d) => ({ type: 'Feature' as const, properties: {},
      geometry: { type: 'Point' as const, coordinates: [d[1], d[0]] } })) : []
    ;(map.current.getSource('live') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: feats })
  }, [ready, live, showLive])

  // box outline
  useEffect(() => {
    if (!ready || !map.current) return
    ;(map.current.getSource('box') as GeoJSONSource)?.setData(box ? boxFeature(box) : EMPTY)
  }, [ready, box])

  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = drawing ? 'crosshair' : '' }, [drawing])

  // QA #16: a box can only cover data that exists → clip it to the region's data area; refuse boxes outside it
  const clip = (b: Box): Box | null => {
    const r = doc.bbox
    const c: Box = [Math.max(b[0], r[0]), Math.max(b[1], r[1]), Math.min(b[2], r[2]), Math.min(b[3], r[3])]
    return c[0] < c[2] && c[1] < c[3] ? c : null
  }
  const submit = (b: Box) => {
    const c = clip(b)
    if (!c) { setErr(`This box is outside ${doc.name}. Only data inside the dotted data area is available.`); setNote(null); return }
    const changed = c.some((v, i) => Math.abs(v - b[i]) > 1e-6)
    setErr(null)
    setNote(changed ? `Only data inside ${doc.name} is available — box clipped to ${c.map((v) => v.toFixed(2)).join(', ')}.` : null)
    setInputs(c.map((v) => v.toFixed(2)))
    onBox(c)
    map.current?.fitBounds(c as [number, number, number, number], { padding: 40 })
  }
  const apply = () => {
    const v = inputs.map(Number)
    if (v.some((x) => !Number.isFinite(x)) || v[0] >= v[2] || v[1] >= v[3]) { setErr('Box must be West < East and South < North (decimal degrees).'); return }
    submit(v as Box)
  }
  submitRef.current = submit
  const inset = doc.geo?.inset
  const toggleInset = () => {
    if (!inset || !map.current) return
    map.current.fitBounds((inInset ? view : inset.bbox) as [number, number, number, number], { padding: 30, duration: 600 })
    setInInset((v) => !v)
  }
  const pointsVisible = pts?.available && (small || zoom >= POINT_ZOOM)

  return (
    <section className="card" aria-labelledby="map-h">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="map-h" className="font-display text-lg font-semibold">Map · {MONTHS[m - 1]} {y}<Help id="map" /></h2>
          <p className="mt-0.5 text-xs text-muted">
            Each hexagon ({res === 7 ? '~5 km², High detail' : '~36 km²'}) is coloured by its fire-days this month ({doc.mode === 'detail' ? 'VIIRS native' : 'MODIS-equivalent'})
            {stats ? <> · <strong className="text-text">{fmtInt(stats.cells)}</strong> hexagons had fire</> : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Region presets">
          {REGIONS.map((r) => (
            <button key={r.id} onClick={() => navigate(`/r/${r.id}`)} aria-current={r.id === doc.id}
              className={`rounded-sm px-2.5 py-1 text-xs ${r.id === doc.id ? 'bg-surface-3 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'}`}>
              {r.name}
            </button>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-sm border border-border">
        <div ref={el} className="h-[380px] w-full bg-bg sm:h-[440px]" role="region" aria-label={`Map of ${doc.name} fire hexagons for ${MONTHS[m - 1]} ${y}`} />
        {err && <div className="absolute inset-x-3 top-3 rounded-sm border border-danger/40 bg-surface-2 px-3 py-2 text-xs text-danger">{err}</div>}
        {inset && (
          <button onClick={toggleInset} className="absolute top-3 left-3 rounded-sm border border-border-strong bg-surface/90 px-2.5 py-1 text-xs text-text backdrop-blur hover:bg-surface-2">
            {inInset ? `← ${doc.name.split(' (')[0]}` : `${inset.name} →`}
          </button>
        )}
        {drawing && <div className="absolute top-12 left-3 rounded-sm bg-accent px-2.5 py-1 text-xs font-semibold text-bg">Drag on the map to draw a box</div>}
      </div>
      {/* QA #21: legend below the map, never over the fires */}
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted" data-testid="map-legend">
        {stats && stats.cells > 0 && (
          <span className="flex items-center gap-1.5">
            <span>{doc.mode === 'detail' ? 'VIIRS native' : 'MODIS-equivalent'} fire-days per {res === 7 ? '~5 km²' : '~36 km²'} hexagon, {MONTHS[m - 1]} {y}:</span>
            <span className="num text-faint">{stats.min < 10 ? stats.min.toFixed(1) : fmtCompact(stats.min)}</span>
            <span className="inline-flex">{MAP_COLORS.map((c) => <span key={c} className="h-2.5 w-4" style={{ background: c }} />)}</span>
            <span className="num text-faint">{stats.max < 10 ? stats.max.toFixed(1) : fmtCompact(stats.max)}</span>
          </span>
        )}
        {pointsVisible && (
          <span className="flex items-center gap-2">
            <span><span style={{ color: C_MODIS }}>●</span> MODIS detection</span>
            <span><span style={{ color: C_VIIRS }}>▲</span> VIIRS detection</span>
            <span className="text-faint">({fmtInt(pts?.n ?? 0)})</span>
          </span>
        )}
        {live?.ok && showLive && <span><span style={{ color: C_LIVE }}>●</span> live 72 h — raw, provisional, not in the record</span>}
        {clipped && <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t border-dashed border-[#93A1B3]" />data area (clip box)</span>}
        {box && <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-[#5AC8FA]" />your box</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
        <button onClick={() => setDrawing((d) => !d)} aria-pressed={drawing}
          className={`rounded-sm border px-3 py-1.5 ${drawing ? 'border-accent text-accent' : 'border-border-strong text-text hover:bg-surface-2'}`}>
          ▭ Draw box
        </button>
        {['West', 'South', 'East', 'North'].map((lab, i) => (
          <label key={lab} className="flex flex-col gap-0.5">
            <span className="text-faint">{lab} (°)</span>
            <input value={inputs[i]} inputMode="decimal" onChange={(e) => setInputs((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
              className="num w-[72px] rounded-sm border border-border bg-surface-2 px-2 py-1 text-text" aria-label={`${lab} edge (decimal degrees)`} />
          </label>
        ))}
        <button onClick={apply} className="rounded-sm bg-accent px-3 py-1.5 font-semibold text-bg hover:brightness-110">Apply box</button>
        {box && <button onClick={() => { onBox(null); setNote(null); setInputs(view.map((v) => v.toFixed(2))) }}
          className="rounded-sm border border-border-strong px-3 py-1.5 text-text hover:bg-surface-2">Clear</button>}
        {live?.ok && (
          <label className="ml-auto flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} className="accent-[var(--accent-2)]" />
            Live 72 h (provisional)
          </label>
        )}
      </div>
      {note && <p className="mt-2 rounded-sm border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn" role="status">{note}</p>}
      <p className="mt-2 text-xs text-muted">Hexagons are ~36 km² on purpose: counting presence per hexagon lets old and new satellites be compared fairly. Zoom in to see individual detections.</p>
      <p className="mt-1 text-xs text-faint">
        {small ? 'Detections are shown for every month in this small region.' : pts?.available ? `Individual detections appear from zoom ${POINT_ZOOM}.` : `Individual detections are published for the latest months (${doc.hotspot_months.join(', ')}); older months show hexagons only.`}
        {' '}A box recomputes the calendar from hexagons inside it, using this region's calibration. Basemap © OpenFreeMap, © OpenStreetMap contributors.
      </p>
    </section>
  )
}
