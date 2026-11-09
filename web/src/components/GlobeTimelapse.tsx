import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MlMap, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtInt } from '../lib/format'
import { agoText } from '../lib/live'
import type { LiveData } from '../lib/live'
import { MONTHS } from '../lib/series'
import type { RegionDoc } from '../lib/types'

setWorkerUrl(workerUrl)

interface Props { docs: RegionDoc[]; live?: Record<string, LiveData | null> }

function LivePanelLine({ docs, live }: { docs: RegionDoc[]; live: Record<string, LiveData | null> }) {
  const ok = docs.map((d) => live[d.id]).filter((l): l is LiveData => !!l?.ok)
  if (!Object.values(live).some(Boolean)) return <div className="mt-1.5 text-[11px] text-faint">LIVE · checking NASA FIRMS…</div>
  if (!ok.length) return <div className="mt-1.5 text-[11px] text-faint">LIVE · feed temporarily unavailable</div>
  const last = ok.map((l) => l.last_acq_utc).filter(Boolean).sort().pop() ?? null
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-accent-2">
      <span><strong>LIVE</strong> · last satellite pass {agoText(last)} · detections in 72 h:</span>
      {docs.map((d) => <span key={d.id}>{d.name.split(' (')[0]} <span className="num">{live[d.id]?.ok ? fmtInt(live[d.id]!.count) : '—'}</span></span>)}
      <span className="text-faint">near-real-time, provisional, not in the record</span>
    </div>
  )
}

/** 3D globe; hero regions glow with their monthly harmonized fire-days, played 2001 → 2026. */
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

  const maxH = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, Math.max(...d.months.map((r) => r.H ?? 0)) || 1])), [docs])

  useEffect(() => {
    if (!el.current) return
    const mp = new MlMap({
      container: el.current, style: 'https://tiles.openfreemap.org/styles/dark', center: [70, -5], zoom: 1.75,
      attributionControl: { compact: true }, interactive: true,
    })
    map.current = mp
    mp.on('style.load', () => {
      mp.setProjection({ type: 'globe' })
    })
    mp.on('load', () => {
      mp.addSource('fire', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      mp.addLayer({ id: 'fire-glow', type: 'circle', source: 'fire', paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 't'], 0, 4, 1, 46], 'circle-color': ['get', 'c'],
        'circle-blur': 1, 'circle-opacity': ['interpolate', ['linear'], ['get', 't'], 0, 0.15, 1, 0.75] } })
      mp.addLayer({ id: 'fire-core', type: 'circle', source: 'fire', paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 't'], 0, 2, 1, 10], 'circle-color': ['get', 'c'], 'circle-opacity': 0.95,
        'circle-stroke-width': 1, 'circle-stroke-color': '#0A0E14' } })
      mp.addLayer({ id: 'fire-label', type: 'symbol', source: 'fire', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.6], 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#E8EEF5', 'text-halo-color': '#0A0E14', 'text-halo-width': 1.5 } })
      setReady(true)
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
  }, [ready, i, frames, docs, maxH])

  // playback
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setI((x) => (x + 1) % frames.length), 260 / speed)
    return () => clearInterval(id)
  }, [playing, speed, frames.length])

  const f = frames[i]
  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" role="region" aria-label="Globe showing monthly fire activity in the four hero regions" />
      {f && (
        <div className="absolute inset-x-3 bottom-9 z-10 mx-auto max-w-[760px] rounded-card border border-border bg-surface/85 px-4 py-3 backdrop-blur">
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
            <span className="text-faint">fire-days (MODIS-equivalent) · glow relative to each region's own maximum · hero regions only</span>
          </div>
          {live && <LivePanelLine docs={docs} live={live} />}
        </div>
      )}
    </div>
  )
}
