import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import links from '../../content/links.json'
import MiniRings from '../components/MiniRings'
import Help from '../components/Help'
import SensorTimeline from '../components/SensorTimeline'
import { fetchJson, useMeta } from '../lib/api'
import { headline, judgeMonth } from '../lib/headline'
import { plainLevel, TONE_CLASS } from '../lib/plain'
import { REGIONS } from '../lib/regions'
import StatusBadge from '../components/StatusBadge'
import type { WatchDoc } from '../../api/_lib/watch'
import { triggerLabel } from '../../api/_lib/watch'
import type { RegionDoc } from '../lib/types'
import { fetchLive } from '../lib/live'
import type { LiveData } from '../lib/live'

const GlobeTimelapse = lazy(() => import('../components/GlobeTimelapse'))

export default function Landing() {
  const meta = useMeta()
  const [docs, setDocs] = useState<RegionDoc[] | null>(null)
  const [live, setLive] = useState<Record<string, LiveData | null>>({})
  const [watch, setWatch] = useState<WatchDoc | null>(null)
  useEffect(() => { fetchJson<WatchDoc>('watch.json').then(setWatch).catch(() => {}) }, [])
  useEffect(() => {
    Promise.all(REGIONS.map((r) => fetchJson<RegionDoc>(`regions/${r.id}.json`))).then(setDocs).catch(() => setDocs([]))
    REGIONS.forEach((r) => fetchLive(r.id).then((l) => setLive((x) => ({ ...x, [r.id]: l }))))
  }, [])

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6">
      {/* QA #69: phones/tablets stack the text above the globe so the globe is clearly visible; large screens overlay it */}
      <section className="starfield relative overflow-hidden border-b border-border lg:h-[78vh] lg:min-h-[520px]">
        <div className="relative z-10 max-w-[560px] px-4 pt-6 pb-3 sm:px-10 sm:pt-10 lg:pointer-events-auto lg:absolute lg:top-14 lg:left-10 lg:p-0" data-testid="hero-text">
          <p className="eyebrow">MODIS + VIIRS · NASA FIRMS · 2001–2026</p>
          <h1 className="mt-3 text-[36px] leading-[1.02] font-bold sm:text-[56px] lg:text-[64px]">25 years of fire.<br /><span className="text-muted">One honest record.</span></h1>
          <p className="mt-4 max-w-md text-base text-muted lg:mt-5">Two generations of satellites see fire differently. Fire Rings converts the new one into the old one's units, so every month since 2001 uses the same ruler — and tells you whether this month is normal.</p>
          <div className="mt-5 flex flex-wrap gap-3 lg:mt-7">
            <Link to="/r/punjab" className="rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-bg no-underline hover:brightness-110">Explore a region</Link>
            <Link to="/story" className="rounded-sm border border-border-strong bg-bg/60 px-5 py-2.5 text-sm font-semibold text-text no-underline hover:bg-surface-2">Watch the stories</Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="hero-docs">
            <Link to={links.paper}>Read the paper →</Link>
            <Link to={links.slides}>View the slides →</Link>
            <Link to="/proof">How it works →</Link>
          </div>
        </div>
        <div className="relative h-[640px] sm:h-[640px] lg:absolute lg:inset-0 lg:left-[620px] lg:h-auto" data-testid="hero-globe">
          <Suspense fallback={null}>{docs && docs.length > 0 && <GlobeTimelapse docs={docs} live={live} />}</Suspense>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-bg via-bg/50 to-transparent lg:block" />
      </section>

      <div className="mx-auto max-w-[1440px] space-y-12 px-4 py-10 sm:px-6">
        <section aria-labelledby="regions-h">
          <h2 id="regions-h" className="eyebrow">Hero regions<Help id="region-cards" /></h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {REGIONS.map((r) => {
              const d = docs?.find((x) => x.id === r.id)
              const lc = d?.latest_complete
              const rec = lc && d ? d.months.find((x) => x.y === lc.y && x.m === lc.m) : undefined
              const j = rec && d ? judgeMonth(d, rec) : null
              // cards stay short: the full detection-time caveat lives on the region page; here a flag
              const h = j ? headline({ ...j, timingCaveat: null }) : null
              const flagged = !!j?.timingCaveat
              // #84: when the card's plain label and the Fire Watch status point different ways, say so on the card
              const ws = watch?.regions[r.id]?.status
              const tone = j && j.value != null ? plainLevel(j.ratio, j.guard).tone : 'unknown'
              const disagree = !!ws && tone !== 'unknown' && ((ws === 'Normal' && tone !== 'usual') || (ws !== 'Normal' && tone === 'usual'))
              return (
                <li key={r.id} className="relative">
                  {watch?.regions[r.id] && (
                    <Link to="/watch" className="absolute right-4 bottom-3 z-10 flex items-center gap-1.5 text-[11px] text-muted no-underline hover:text-text" data-testid="card-watch" title="Fire Watch status — see why">
                      <span>Fire Watch</span><StatusBadge status={watch.regions[r.id].status} small trigger={triggerLabel(watch.regions[r.id].checks, watch.regions[r.id].status)} />
                    </Link>
                  )}
                  {disagree && (
                    <p className="absolute right-4 bottom-10 left-4 z-10 flex items-center text-[11px] text-muted" data-testid="card-watch-note">
                      {ws === 'Normal' ? 'Fire Watch: within normal range (rule not triggered)' : `Fire Watch: ${ws} (rule triggered)`}<Help id="cards-vs-watch" />
                    </p>
                  )}
                  <Link to={`/r/${r.id}`} className={`card flex h-full items-start gap-4 ${disagree ? 'pb-[4.5rem]' : 'pb-12'} no-underline transition-colors duration-[var(--dur-fast)] hover:border-border-strong hover:bg-surface-2`}>
                    <div className="shrink-0">{d ? <MiniRings months={d.months} label={`${r.name} mini Fire Rings`} /> : <div className="h-[72px] w-[72px] animate-pulse rounded-full bg-surface-3" />}</div>
                    <div className="min-w-0">
                      <span className="font-display text-lg font-semibold text-text">{d?.name ?? r.name}</span>
                      {j && j.value != null && (() => {
                        const pl = plainLevel(j.ratio, j.guard)
                        return <span className={`mt-1.5 block w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[pl.tone]}`} data-testid="card-level">{pl.text}</span>
                      })()}
                      <span className="mt-1 block text-xs text-muted">{h ? `${h.lead} ${h.rest}` : r.country}</span>
                      {flagged && <span className="mt-1.5 block text-[11px] text-warn">⚑ Detection-time caveat: may be undercounted</span>}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="sensors-h" className="card">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="sensors-h" className="font-display text-lg font-semibold">Five satellites, one record<Help id="satellite-timeline" /></h2>
              <p className="mt-0.5 text-xs text-muted">MODIS is drifting and ending; Suomi-NPP data delivery ceased on 2 Nov 2026. Fire Rings calibrates VIIRS to MODIS while both were stable, then follows NOAA-20.</p>
            </div>
            <Link to="/proof" className="text-sm">The evidence →</Link>
          </div>
          <SensorTimeline />
        </section>

        {meta.status === 'ready' && (
          <p className="num text-xs text-faint">Data through {meta.data.data_end} · {meta.data.regions.length} regions · harmonized record {meta.data.version} · <Link to="/data">open data</Link></p>
        )}
      </div>
    </div>
  )
}
