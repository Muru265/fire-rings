import scrollama from 'scrollama'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import FireRings from '../components/FireRings'
import { useRegion } from '../lib/api'
import { makeColorer } from '../lib/colors'
import { fmtInt, fmtRatio } from '../lib/format'
import { MONTHS, toGrid } from '../lib/series'
import type { RegionDoc } from '../lib/types'

/** Madagascar story mode: sticky rings + 6 scroll steps (master plan §5 S5). All numbers are read from the data. */
export default function Story() {
  const { regionId = 'madagascar' } = useParams()
  const mg = useRegion(regionId)
  const mu = useRegion('mauritius')
  if (mg.status === 'loading' || mu.status === 'loading') return <div className="card h-[60vh] animate-pulse" />
  if (mg.status === 'error') return <EmptyState title="Story data unavailable">{mg.error}</EmptyState>
  if (regionId !== 'madagascar') return <EmptyState title="Story mode is available for Madagascar"><Link to="/story/madagascar">Open the Madagascar story</Link></EmptyState>
  return <StoryView mg={mg.data} mu={mu.status === 'ready' ? mu.data : null} />
}

function StoryView({ mg, mu }: { mg: RegionDoc; mu: RegionDoc | null }) {
  const [step, setStep] = useState(0)
  const stepsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sc = scrollama()
    sc.setup({ step: '[data-step]', offset: 0.5 }).onStepEnter(({ index }: { index: number }) => setStep(index))
    const onResize = () => sc.resize()
    window.addEventListener('resize', onResize)
    return () => { sc.destroy(); window.removeEventListener('resize', onResize) }
  }, [])

  const facts = useMemo(() => {
    const c = mg.climatology!
    const order = c.median.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])
    const peak3 = order.slice(0, 3).map(([, i]) => i + 1).sort((a, b) => a - b)
    const totMed = c.median.reduce((a, b) => a + b, 0)
    const peakShare = Math.round((100 * peak3.reduce((a, m) => a + c.median[m - 1], 0)) / totMed)
    const yrs = mg.annual.filter((a) => a.complete && a.rankable !== false && a.H != null).sort((a, b) => b.H! - a.H!)
    const top = yrs.slice(0, 3)
    const low = yrs.slice(-1)[0]
    const lc = mg.latest_complete
    return { peak3, peakShare, top, low, lc, v: mg.validation }
  }, [mg])

  const doc = step === 4 && mu ? mu : mg
  const grid = useMemo(() => toGrid(doc.months), [doc])
  const mode = step === 3 ? 'raw' : 'harmonized'
  const colorer = useMemo(() => makeColorer(doc, 'counts', step === 3 ? 0 : 1), [doc, step])
  const topYears = new Set(facts.top.map((t) => t.y))
  const emphasis = step === 1 ? (_y: number, m: number) => facts.peak3.includes(m)
    : step === 2 ? (y: number) => topYears.has(y)
    : undefined

  const muLatest = mu?.latest_complete

  const steps = [
    { h: 'The clock of burning', p: <>Each ring is a year — 2001 at the centre, 2026 at the edge — and the months run clockwise like a clock. Bright cells are months with many fire-days. Madagascar burns on a schedule you can see at a glance.</> },
    { h: 'The peak months', p: <>{facts.peak3.map((m) => MONTHS[m - 1]).join(', ')} carry <strong className="text-text">{facts.peakShare}%</strong> of a typical year's fire-days (median, 2003–2022). Burning follows the dry season, when pastures and fields are cleared.</> },
    { h: 'The extreme years', p: <>The biggest complete years on record were <strong className="text-text">{facts.top.map((t) => t.y).join(', ')}</strong> ({facts.top.map((t) => `${fmtInt(t.H)}`).join(' · ')} fire-days). The quietest was {facts.low?.y} ({fmtInt(facts.low?.H)}). Same ruler throughout, so these years can be compared directly.</> },
    { h: 'Why the old record mattered', p: <>Joined naively, the record jumps <strong className="text-text">{facts.v ? `+${fmtInt(facts.v.step_raw_pct)}%` : '—'}</strong> in 2012 — the year VIIRS arrived, not a year of more fire. Calibrated on 2012–2019, the jump is {facts.v ? `${facts.v.step_harm_pct > 0 ? '+' : ''}${facts.v.step_harm_pct}%` : '—'}, matching MODIS alone ({facts.v ? `${facts.v.step_modis_pct > 0 ? '+' : ''}${facts.v.step_modis_pct}%` : '—'}). Scroll on to switch back to harmonized.</> },
    { h: 'Small islands: too little to judge', p: <>{mu ? <>Mauritius (with Rodrigues) is a different story: a typical month has only a handful of fire-days. {muLatest && <>In {MONTHS[muLatest.m - 1]} {muLatest.y} it recorded {fmtInt(muLatest.value)} — </>}so Fire Rings says honestly when there is too little fire to judge, instead of shouting “+400%”.</> : 'Mauritius data unavailable.'}</> },
    { h: 'Now explore your own area', p: <>{facts.lc && <>The last full month, {MONTHS[facts.lc.m - 1]} {facts.lc.y}, was {facts.lc.guard ? 'too quiet to judge' : `${fmtRatio(facts.lc.ratio)} a typical ${MONTHS[facts.lc.m - 1]}`} in Madagascar. </>}Open any region, draw a box on the map, or ask the analyst.
      <span className="mt-4 flex flex-wrap gap-2">
        <Link to="/r/madagascar" className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-bg no-underline">Explore Madagascar</Link>
        <Link to="/ask?region=madagascar" className="rounded-sm border border-border-strong px-4 py-2 text-sm text-text no-underline">Ask Fire Rings</Link>
      </span></> },
  ]

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <p className="eyebrow">Story · Indian Ocean</p>
        <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">Madagascar's fire calendar</h1>
      </header>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="top-20 self-start lg:sticky">
          <div className="card">
            <p className="eyebrow mb-2">{doc.name} · {step === 3 ? 'raw (naive join)' : 'harmonized'}</p>
            <FireRings grid={grid} colorOf={colorer.colorOf} mode={mode} active={null} onActive={() => {}} onSelect={() => {}}
              label={`${doc.name} Fire Rings, story step ${step + 1}`} emphasis={emphasis} centerLabel={step === 3 ? 'Raw' : 'Harmonized'} />
          </div>
        </div>
        <div ref={stepsRef} className="space-y-[45vh] pb-[30vh] lg:pt-[10vh]">
          {steps.map((s, i) => (
            <section key={s.h} data-step={i} aria-current={step === i ? 'step' : undefined}
              className={`card transition-opacity duration-[var(--dur-slow)] ${step === i ? 'opacity-100' : 'opacity-40'}`}>
              <p className="num text-xs text-faint">{i + 1} / {steps.length}</p>
              <h2 className="mt-1 font-display text-xl font-semibold">{s.h}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.p}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
