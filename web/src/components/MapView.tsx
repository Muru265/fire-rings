import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MlMapCtor, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONSource, LngLat, Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { cellToBoundary } from 'h3-js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtCompact, fmtInt } from '../lib/format'
import { monthCells } from '../lib/hexes'
import type { Box } from '../lib/hexes'
import { REGIONS } from '../lib/regions'
import { COUNT_COLORS } from '../lib/scales'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'

const STYLE = 'https://tiles.openfreemap.org/styles/dark'
// MapLibre 6 resolves its worker next to its own module; after bundling that file doesn't exist, so hand it Vite's.
setWorkerUrl(workerUrl)

function boxFeature(b: Box) {
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const,
    coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } }
}

interface Props {
  doc: RegionDoc
  y: number
  m: number
  box: Box | null
  onBox: (b: Box | null) => void
}

/** MapLibre map: fire-days per H3 cell for the selected month, region presets, rectangle draw + lat/lon box. */
export default function MapView({ doc, y, m, box, onBox }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [stats, setStats] = useState<{ cells: number; max: number; breaks: number[] } | null>(null)
  const [inputs, setInputs] = useState<string[]>(() => (box ?? doc.bbox).map((v) => v.toFixed(2)))
  const navigate = useNavigate()
  const drawRef = useRef(false)
  drawRef.current = drawing

  useEffect(() => {
    if (!el.current) return
    const mp = new MlMapCtor({
      container: el.current, style: STYLE, bounds: doc.bbox as [number, number, number, number],
      fitBoundsOptions: { padding: 24 }, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
    })
    map.current = mp
    mp.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mp.on('error', (e) => {
      if (!mp.isStyleLoaded()) setErr(String((e as unknown as { error?: Error }).error?.message ?? 'Map failed to load'))
    })
    mp.on('load', () => {
      mp.addSource('region', { type: 'geojson', data: boxFeature(doc.bbox) })
      mp.addLayer({ id: 'region', type: 'line', source: 'region', paint: { 'line-color': '#93A1B3', 'line-width': 1, 'line-dasharray': [3, 2] } })
      mp.addSource('hex', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      mp.addLayer({ id: 'hex', type: 'fill', source: 'hex', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.85 } })
      mp.addSource('box', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
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
      if (b[2] - b[0] > 0.02 && b[3] - b[1] > 0.02) {
        setInputs(b.map((v) => v.toFixed(2)))
        onBox(b)
      }
    })
    return () => { mp.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  // month hexes
  useEffect(() => {
    if (!ready || !map.current) return
    let alive = true
    monthCells(doc.id, y, m).then((cells) => {
      if (!alive || !map.current) return
      const vals = cells.map((c) => c.v).sort((a, b) => a - b)
      const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0
      const breaks = [1, 2, 3, 4, 5, 6].map((i) => q(i / 7))
      const cls = (v: number) => { let c = 0; while (c < breaks.length && v > breaks[c]) c++; return c }
      const features = cells.map((c) => ({
        type: 'Feature' as const, properties: { v: c.v, c: COUNT_COLORS[cls(c.v)] },
        geometry: { type: 'Polygon' as const, coordinates: [cellToBoundary(c.id, true)] },
      }))
      ;(map.current.getSource('hex') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features })
      setStats({ cells: cells.length, max: vals[vals.length - 1] ?? 0, breaks })
    }).catch((e: Error) => alive && setErr(e.message))
    return () => { alive = false }
  }, [ready, doc.id, y, m])

  // box outline
  useEffect(() => {
    if (!ready || !map.current) return
    ;(map.current.getSource('box') as GeoJSONSource)?.setData(box ? boxFeature(box) : { type: 'FeatureCollection', features: [] })
  }, [ready, box])

  useEffect(() => { if (map.current) map.current.getCanvas().style.cursor = drawing ? 'crosshair' : '' }, [drawing])

  const apply = () => {
    const v = inputs.map(Number)
    if (v.some((x) => !Number.isFinite(x)) || v[0] >= v[2] || v[1] >= v[3]) { setErr('Box must be W < E and S < N (decimal degrees).'); return }
    setErr(null)
    onBox(v as Box)
    map.current?.fitBounds(v as [number, number, number, number], { padding: 40 })
  }

  return (
    <section className="card" aria-labelledby="map-h">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="map-h" className="font-display text-lg font-semibold">Map · {MONTHS[m - 1]} {y}</h2>
          <p className="mt-0.5 text-xs text-muted">
            Fire-days per ~36 km² hexagon ({y < 2012 ? 'MODIS' : 'VIIRS'} detections, raw cell-days)
            {stats ? ` · ${fmtInt(stats.cells)} hexagons with fire` : ''}
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
        {stats && stats.cells > 0 && (
          <div className="absolute bottom-3 left-3 rounded-sm bg-surface/90 px-2.5 py-2 text-[10px] backdrop-blur">
            <div className="mb-1 text-muted">fire-days per hexagon</div>
            <div className="flex items-center gap-1">
              {COUNT_COLORS.map((c) => <span key={c} className="h-2.5 w-4 rounded-[2px]" style={{ background: c }} />)}
            </div>
            <div className="num mt-0.5 flex justify-between text-faint"><span>1</span><span>{fmtCompact(stats.max)}</span></div>
          </div>
        )}
        {drawing && <div className="absolute top-3 left-3 rounded-sm bg-accent px-2.5 py-1 text-xs font-semibold text-bg">Drag on the map to draw a box</div>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
        <button onClick={() => setDrawing((d) => !d)} aria-pressed={drawing}
          className={`rounded-sm border px-3 py-1.5 ${drawing ? 'border-accent text-accent' : 'border-border-strong text-text hover:bg-surface-2'}`}>
          ▭ Draw box
        </button>
        {['W', 'S', 'E', 'N'].map((lab, i) => (
          <label key={lab} className="flex flex-col gap-0.5">
            <span className="text-faint">{lab}</span>
            <input value={inputs[i]} inputMode="decimal" onChange={(e) => setInputs((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
              className="num w-[72px] rounded-sm border border-border bg-surface-2 px-2 py-1 text-text" aria-label={`${lab} bound (decimal degrees)`} />
          </label>
        ))}
        <button onClick={apply} className="rounded-sm bg-accent px-3 py-1.5 font-semibold text-bg hover:brightness-110">Apply box</button>
        {box && <button onClick={() => { onBox(null); setInputs(doc.bbox.map((v) => v.toFixed(2))) }}
          className="rounded-sm border border-border-strong px-3 py-1.5 text-text hover:bg-surface-2">Clear</button>}
      </div>
      <p className="mt-2 text-xs text-faint">A box recomputes the calendar from hexagons inside it, using this region's calibration. Basemap © OpenFreeMap, © OpenStreetMap contributors.</p>
    </section>
  )
}
