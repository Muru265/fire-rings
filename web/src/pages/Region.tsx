import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CalendarTable from '../components/CalendarTable'
import EmptyState from '../components/EmptyState'
import FireRings from '../components/FireRings'
import GridCalendar from '../components/GridCalendar'
import Legend from '../components/Legend'
import { useRegion } from '../lib/api'
import { fmtCompact, fmtInt } from '../lib/format'
import { REGIONS, findRegion } from '../lib/regions'
import { MONTHS, toGrid, valueOf } from '../lib/series'
import { quantileScale } from '../lib/scales'
import type { RegionDoc, ViewMode } from '../lib/types'
import type { Cell } from '../lib/useCellNav'

export default function Region() {
  const { regionId } = useParams()
  const region = findRegion(regionId)
  const doc = useRegion(region ? region.id : null)

  if (!region) {
    return (
      <EmptyState title="Region not found">
        Available regions:{' '}
        {REGIONS.map((r, i) => (
          <span key={r.id}>
            {i > 0 && ' · '}
            <Link to={`/r/${r.id}`}>{r.name}</Link>
          </span>
        ))}
      </EmptyState>
    )
  }
  if (doc.status === 'loading') return <RegionSkeleton name={region.name} />
  if (doc.status === 'error')
    return (
      <EmptyState title="Couldn't load this region's data">
        <p className="num text-xs">{doc.error}</p>
        <button onClick={doc.retry} className="mt-3 rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text hover:bg-surface-2">
          Retry
        </button>
      </EmptyState>
    )
  return <RegionView key={region.id} doc={doc.data} />
}

function RegionView({ doc }: { doc: RegionDoc }) {
  const mode: ViewMode = doc.harmonized ? 'harmonized' : 'raw'
  const grid = useMemo(() => toGrid(doc.months), [doc])
  const scale = useMemo(() => quantileScale(doc.months.map((r) => valueOf(r, mode)), fmtCompact), [doc, mode])
  const [active, setActive] = useState<Cell | null>(null)
  const [selected, setSelected] = useState<Cell | null>(null)
  const [table, setTable] = useState(false)
  const first = doc.months[0]
  const last = doc.months[doc.months.length - 1]
  const unit = mode === 'raw' ? 'Fire-days (raw cell-days)' : 'Fire-days (MODIS-equivalent)'
  const label = `${doc.name}, ${mode === 'raw' ? 'raw' : 'harmonized'} monthly fire-days`

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {doc.area_km2 ? `${fmtInt(doc.area_km2)} km² ${doc.area_note}` : doc.area_note} · {MONTHS[first.m - 1]} {first.y} – {MONTHS[last.m - 1]} {last.y}
          </p>
          <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">{doc.name}</h1>
        </div>
        <span className="rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-xs text-warn">
          {mode === 'raw' ? 'Raw view: not harmonized yet' : 'Harmonized'}
        </span>
      </header>

      {mode === 'raw' && (
        <p className="max-w-3xl text-sm text-muted">
          This is the <strong className="text-text">naive</strong> record: MODIS fire cell-days up to 2011, VIIRS from 2012. VIIRS sees
          smaller fires and splits large ones, so the jump at the dashed ring is the satellite changing, not the fire.
          Harmonization (Phase 3) converts VIIRS into MODIS-equivalent units.
        </p>
      )}

      <section aria-labelledby="rings-h" className="card grid items-center gap-8 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)] lg:justify-center xl:gap-14">
        <h2 id="rings-h" className="sr-only">Fire Rings</h2>
        <FireRings grid={grid} scale={scale} mode={mode} active={active} onActive={setActive} onSelect={setSelected} label={label} />
        <div className="grid gap-8 sm:grid-cols-2 lg:max-w-[460px] lg:grid-cols-1 xl:grid-cols-2">
          <Legend scale={scale} unit={unit} vertical />
          <div className="text-sm text-muted">
            <p className="eyebrow mb-2">How to read</p>
            <ul className="space-y-2">
              <li><span className="text-text">Rings are years:</span> {grid.years[0]} at the centre, {grid.years[grid.years.length - 1]} at the edge.</li>
              <li><span className="text-text">Months run clockwise</span> from January at 12 o'clock.</li>
              <li><span className="text-text">Brighter means more fire-days.</span> One fire-day is one ~36 km² hexagon with at least one detection on one day.</li>
              <li>Hover or use the arrow keys to read any month.</li>
            </ul>
            {selected && (
              <p className="mt-4 text-xs" aria-live="polite">
                Selected {MONTHS[selected.m - 1]} {selected.y}. Month drill-down arrives in Phase 4.
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="grid-h" className="card">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="grid-h" className="font-display text-lg font-semibold">Calendar</h2>
          <button onClick={() => setTable((v) => !v)} aria-pressed={table}
            className="rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2">
            {table ? 'View as chart' : 'View as table'}
          </button>
        </div>
        {table ? (
          <CalendarTable grid={grid} mode={mode} caption={`${label}, by year and month (${unit})`} />
        ) : (
          <GridCalendar grid={grid} scale={scale} mode={mode} active={active} onActive={setActive} onSelect={setSelected} label={label} />
        )}
      </section>

      <p className="text-xs text-faint">
        Data through {doc.data_end} · exported {doc.updated} · units: {doc.units.raw}. Source: NASA FIRMS.
      </p>
    </div>
  )
}

function RegionSkeleton({ name }: { name: string }) {
  return (
    <div className="space-y-8" aria-busy="true">
      <h1 className="text-[28px] font-bold sm:text-[40px]">{name}</h1>
      <div className="card flex aspect-square max-h-[600px] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted">
          <div className="h-40 w-40 animate-pulse rounded-full border-[18px] border-surface-3" />
          <span className="text-sm">Reading 2001–2026…</span>
        </div>
      </div>
    </div>
  )
}
