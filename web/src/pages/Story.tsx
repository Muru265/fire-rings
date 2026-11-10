import scrollama from 'scrollama'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import FireRings from '../components/FireRings'
import Help from '../components/Help'
import MiniRings from '../components/MiniRings'
import { fetchJson } from '../lib/api'
import { makeColorer } from '../lib/colors'
import { fmtInt, fmtRatio } from '../lib/format'
import { REGIONS } from '../lib/regions'
import { MONTHS, toGrid } from '../lib/series'
import type { RegionDoc } from '../lib/types'

// Stories (QA #51): one stepper for every region; every number is read from the published JSON at run time.

interface Step {
  h: string
  p: ReactNode
  /** which region's rings to show (default: the story's region) */
  show?: string
  /** 0 = raw (naive join), 1 = harmonized */
  t?: 0 | 1
  emphasis?: (y: number, m: number) => boolean
}
interface Story { id: string; kicker: string; title: string; blurb: string; steps: (docs: Record<string, RegionDoc>) => Step[] }

const sign = (v: number) => `${v > 0 ? '+' : ''}${v}`
const ranked = (d: RegionDoc) => d.annual.filter((a) => a.complete && a.rankable !== false && a.H != null)
const sumMed = (d: RegionDoc, ms: number[]) => ms.reduce((a, m) => a + d.climatology!.median[m - 1], 0)
const share = (d: RegionDoc, ms: number[]) => Math.round((100 * sumMed(d, ms)) / sumMed(d, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
const rec = (d: RegionDoc, y: number, m: number) => d.months.find((r) => r.y === y && r.m === m)
const explore = (id: string, name: string) => (
  <span className="mt-4 flex flex-wrap gap-2">
    <Link to={`/r/${id}`} className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-bg no-underline">Explore {name} →</Link>
    <Link to={`/ask?region=${id}`} className="rounded-sm border border-border-strong px-4 py-2 text-sm text-text no-underline">Ask Fire Rings</Link>
  </span>
)
function stepRaw(d: RegionDoc): Step {
  const v = d.validation
  return { h: 'The fake jump in 2012', t: 0, p: <>Joined naively, the record jumps <strong className="text-text">{v ? `+${fmtInt(v.step_raw_pct)}%` : '—'}</strong> in 2012 — the year the new VIIRS camera arrived, not a year of more fire. Calibrated on 2012–2019, the change is {v ? `${sign(v.step_harm_pct)}%` : '—'}, in line with the old camera alone ({v ? `${sign(v.step_modis_pct)}%` : '—'}). The rings on the left show the naive join; scroll on for the fixed record.</> }
}

const STORIES: Story[] = [
  { id: 'madagascar', kicker: 'Story · Indian Ocean', title: 'Madagascar’s fire calendar', blurb: 'A dry-season clock that burns on schedule — and why a small island next door can’t be judged the same way.',
    steps: (D) => {
      const mg = D.madagascar
      const mu = D.mauritius
      const c = mg.climatology!
      const peak3 = c.median.map((v, i) => [v, i + 1] as const).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, m]) => m).sort((a, b) => a - b)
      const yrs = [...ranked(mg)].sort((a, b) => b.H! - a.H!)
      const top = yrs.slice(0, 3)
      const low = yrs.at(-1)
      const top3 = new Set(top.map((t) => t.y))
      const lc = mg.latest_complete
      const ml = mu?.latest_complete
      return [
        { h: 'The clock of burning', p: <>Each ring is a year — 2001 at the centre, the newest year at the edge — and the months run clockwise like a clock. Bright cells are months with many fire-days. Madagascar burns on a schedule you can see at a glance.</> },
        { h: 'The peak months', emphasis: (_y, m) => peak3.includes(m), p: <>{peak3.map((m) => MONTHS[m - 1]).join(', ')} carry <strong className="text-text">{share(mg, peak3)}%</strong> of a typical year’s fire-days (median, {mg.baseline[0]}–{mg.baseline[1]}). Burning follows the dry season, when pastures and fields are cleared.</> },
        { h: 'The extreme years', emphasis: (y) => top3.has(y), p: <>The biggest complete years on record were <strong className="text-text">{top.map((t) => t.y).join(', ')}</strong> ({top.map((t) => fmtInt(t.H)).join(' · ')} fire-days). The quietest was {low?.y} ({fmtInt(low?.H)}). Same ruler throughout, so these years can be compared directly.</> },
        stepRaw(mg),
        ...(mu ? [{ h: 'Small islands: too little to judge', show: 'mauritius', p: <>Mauritius (with Rodrigues) is a different story: a typical month has only a handful of fire-days.{ml && <> In {MONTHS[ml.m - 1]} {ml.y} it recorded {fmtInt(ml.value)}.</>} So Fire Rings says honestly when there is too little fire to judge, instead of shouting “+400%”.</> } as Step] : []),
        { h: 'Now explore', p: <>{lc && <>The last full month, {MONTHS[lc.m - 1]} {lc.y}, was {lc.guard ? 'too quiet to judge' : `${fmtRatio(lc.ratio)} a typical ${MONTHS[lc.m - 1]}`} in Madagascar. </>}Open the region, draw a box on the map, or ask the analyst.{explore('madagascar', 'Madagascar')}</> },
      ]
    } },
  { id: 'punjab', kicker: 'Story · North India', title: 'Punjab–Haryana: two harvests, one record', blurb: 'Wheat in spring, rice stubble in autumn — the 2012 camera jump, and a recent decline that comes with a caveat.',
    steps: (D) => {
      const p = D.punjab
      const yrs = ranked(p)
      const peak = [...yrs].sort((a, b) => b.H! - a.H!)[0]
      const last = yrs.at(-1)
      const y2021 = yrs.find((a) => a.y === 2021)
      const recent = yrs.filter((a) => a.y >= 2022)
      return [
        { h: 'Two harvests, two fire seasons', emphasis: (_y, m) => [4, 5, 10, 11].includes(m), p: <>Look for two bright wedges. <strong className="text-text">April–May</strong> is wheat-residue burning; <strong className="text-text">October–November</strong> is rice stubble before the winter crop. Together they hold <strong className="text-text">{share(p, [4, 5, 10, 11])}%</strong> of a typical year’s fire-days ({share(p, [10, 11])}% in Oct–Nov alone).</> },
        stepRaw(p),
        { h: 'Fixed: one ruler for 25 years', t: 1, p: <>After the fix the 2012 ring blends in. The biggest complete year is <strong className="text-text">{peak?.y}</strong> ({fmtInt(peak?.H)} fire-days, MODIS-equivalent) — comparable with every other year.</> },
        { h: 'A decline since 2021…', emphasis: (y, m) => y >= 2022 && (m === 10 || m === 11), p: <>{y2021 && last && <>Detected fire fell from {fmtInt(y2021.H)} fire-days in 2021 to <strong className="text-text">{fmtInt(last.H)}</strong> in {last.y} ({recent.map((a) => `${a.y}: ${fmtInt(a.H)}`).join(' · ')}).</>}</> },
        { h: '…with a detection-time caveat', emphasis: (y, m) => y >= 2022 && (m === 10 || m === 11), p: <>{p.caveats?.overpass_timing ?? ''} The later-passing Aqua satellite now sees relatively more fire than VIIRS — only here, only in Oct–Nov. So part of the drop may be fire the satellites no longer catch. We flag it; we don’t change the numbers. <Link to="/proof">The evidence →</Link></> },
        { h: 'Now explore', p: <>See this month, compare years, or switch to High detail for field-scale fires.{explore('punjab', 'Punjab–Haryana')}</> },
      ]
    } },
  { id: 'se_australia', kicker: 'Story · South-east Australia', title: 'SE Australia: the Black Summer', blurb: 'How the 2019–20 fires stand out against 25 years — and how unusual they were.',
    steps: (D) => {
      const a = D.se_australia
      const c = a.climatology!
      const peak3 = c.median.map((v, i) => [v, i + 1] as const).sort((x, y) => y[0] - x[0]).slice(0, 3).map(([, m]) => m).sort((x, y) => x - y)
      const dec = rec(a, 2019, 12), jan = rec(a, 2020, 1)
      // fire seasons Jul–Jun from the published monthly values (complete, not Terra-only)
      const seasons: { y: number; H: number }[] = []
      for (let y = 2002; y < a.months.at(-1)!.y; y++) {
        const ms = [...[7, 8, 9, 10, 11, 12].map((m) => rec(a, y, m)), ...[1, 2, 3, 4, 5, 6].map((m) => rec(a, y + 1, m))]
        if (ms.every((r) => r?.H != null && r.src !== 'T' && !r.flags.includes('mtd'))) seasons.push({ y, H: ms.reduce((s, r) => s + r!.H!, 0) })
      }
      const bs = seasons.find((s) => s.y === 2019)
      const sorted = [...seasons].sort((x, y) => x.H - y.H)
      const med = sorted.length ? sorted[Math.floor(sorted.length / 2)].H : null
      const rank = bs ? [...seasons].sort((x, y) => y.H - x.H).findIndex((s) => s.y === 2019) + 1 : null
      const bsEmph = (y: number, m: number) => (y === 2019 && m >= 10) || (y === 2020 && m <= 2)
      return [
        { h: 'A typical year’s clock', emphasis: (_y, m) => peak3.includes(m), p: <>Each ring is a year, months run clockwise from January at the top. In a typical year the busiest months are <strong className="text-text">{peak3.map((m) => MONTHS[m - 1]).join(', ')}</strong> (median, {a.baseline[0]}–{a.baseline[1]}){peak3.some((m) => m === 12 || m <= 2) ? '' : ' — not midsummer'}. A big summer season is rare, which is why one can stand out.</> },
        { h: 'The Black Summer ring', emphasis: bsEmph, p: <>{dec?.H != null && jan?.H != null && <>December 2019 had <strong className="text-text">{fmtInt(dec.H)}</strong> fire-days{dec.ratio != null ? ` (${fmtRatio(dec.ratio)} a typical December)` : ''}{dec.rank ? `, the #${dec.rank} December on record` : ''}; January 2020 had <strong className="text-text">{fmtInt(jan.H)}</strong>{jan.ratio != null ? ` (${fmtRatio(jan.ratio)} typical)` : ''}. Those cells stand out across 25 years.</>}</> },
        { h: 'Is it normal? No.', emphasis: bsEmph, p: <>{bs && med != null && rank && <>The July 2019 – June 2020 fire season totalled <strong className="text-text">{fmtInt(bs.H)}</strong> fire-days — the <strong className="text-text">#{rank}</strong> of {seasons.length} complete seasons, about {fmtRatio(bs.H / med)} a middle season ({fmtInt(med)}).</>} The Royal Commission into these fires is the independent reference we check against on the Proof page.</> },
        { h: 'Now explore', p: <>Open the region, pick December 2019 on the rings, or draw a box over the coast.{explore('se_australia', 'SE Australia')}</> },
      ]
    } },
  { id: 'mauritius', kicker: 'Story · Indian Ocean', title: 'Mauritius: an honest small story', blurb: 'Very little fire — and why saying “too little to judge” is the right answer.',
    steps: (D) => {
      const m = D.mauritius
      const c = m.climatology!
      const recent = m.months.filter((r) => !r.flags.includes('mtd')).slice(-24)
      const guarded = recent.filter((r) => r.guard).length
      const yrs = ranked(m)
      const typ = yrs.length ? [...yrs].sort((a, b) => a.H! - b.H!)[Math.floor(yrs.length / 2)].H : null
      return [
        { h: 'Very little fire', p: <>A typical month on Mauritius (with Rodrigues) has about <strong className="text-text">{fmtInt(Math.min(...c.median))}–{fmtInt(Math.max(...c.median))}</strong> fire-days, and a middle year about {fmtInt(typ)}. One extra fire can double a month.</> },
        { h: '“Too little fire to judge”', emphasis: (y) => y >= m.months.at(-1)!.y - 1, p: <>In the last 24 complete months, <strong className="text-text">{guarded}</strong> were labelled “too little fire to judge”. When the typical value is under 5 and the month under 10, percentages like “+400%” are noise — so Fire Rings says so instead. That is the method working, not failing.</> },
        { h: 'Now explore', p: <>The map shows every detection on the main island, with a Rodrigues inset.{explore('mauritius', 'Mauritius')}</> },
      ]
    } },
]

export default function StoryPage() {
  const { regionId } = useParams()
  const [docs, setDocs] = useState<Record<string, RegionDoc> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    Promise.all(REGIONS.map((r) => fetchJson<RegionDoc>(`regions/${r.id}.json`).then((d): [string, RegionDoc] => [r.id, d])))
      .then((xs) => setDocs(Object.fromEntries(xs))).catch((e: Error) => setErr(e.message))
  }, [])
  if (err) return <EmptyState title="Story data unavailable">{err}</EmptyState>
  if (!regionId) return <StoryPicker docs={docs} />
  const story = STORIES.find((s) => s.id === regionId)
  if (!story) return <EmptyState title="No story for this region"><Link to="/story">Pick a story</Link></EmptyState>
  if (!docs) return <div className="card h-[60vh] animate-pulse" />
  return <StoryView key={story.id} story={story} docs={docs} />
}

function StoryPicker({ docs }: { docs: Record<string, RegionDoc> | null }) {
  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <p className="eyebrow">Stories</p>
        <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">Pick a story<Help id="story" /></h1>
        <p className="mt-2 text-muted">Short guided scrolls, 3–6 steps each. Every number comes from the published data.</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2" data-testid="story-picker">
        {STORIES.map((s) => (
          <li key={s.id}>
            <Link to={`/story/${s.id}`} className="card flex h-full items-start gap-4 no-underline hover:border-border-strong hover:bg-surface-2">
              <div className="shrink-0">{docs?.[s.id] ? <MiniRings months={docs[s.id].months} label={`${s.title} mini rings`} /> : <div className="h-[72px] w-[72px] animate-pulse rounded-full bg-surface-3" />}</div>
              <div><p className="eyebrow !text-[10px]">{s.kicker}</p><span className="mt-1 block font-display text-lg font-semibold text-text">{s.title}</span><span className="mt-1 block text-sm text-muted">{s.blurb}</span></div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StoryView({ story, docs }: { story: Story; docs: Record<string, RegionDoc> }) {
  const [step, setStep] = useState(0)
  const steps = useMemo(() => story.steps(docs), [story, docs])
  useEffect(() => {
    const sc = scrollama()
    sc.setup({ step: '[data-step]', offset: 0.5 }).onStepEnter(({ index }: { index: number }) => setStep(index))
    const onResize = () => sc.resize()
    window.addEventListener('resize', onResize)
    return () => { sc.destroy(); window.removeEventListener('resize', onResize) }
  }, [steps.length])
  const st = steps[Math.min(step, steps.length - 1)]
  const doc = docs[st.show ?? story.id]
  const t = st.t ?? 1
  const grid = useMemo(() => toGrid(doc.months), [doc])
  const colorer = useMemo(() => makeColorer(doc, 'counts', t), [doc, t])
  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <nav aria-label="Stories" className="mb-3 flex flex-wrap gap-1.5" data-testid="story-switcher">
          {STORIES.map((s) => (
            <Link key={s.id} to={`/story/${s.id}`} aria-current={s.id === story.id ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-xs no-underline ${s.id === story.id ? 'border-accent bg-accent/15 text-text' : 'border-border-strong text-muted hover:text-text'}`}>{docs[s.id]?.name.split(' (')[0] ?? s.id}</Link>
          ))}
        </nav>
        <p className="eyebrow">{story.kicker}</p>
        <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">{story.title}<Help id="story" /></h1>
      </header>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="top-20 self-start lg:sticky">
          <div className="card">
            <p className="eyebrow mb-2">{doc.name} · {t === 0 ? 'raw (naive join)' : 'harmonized'}</p>
            <FireRings grid={grid} colorOf={colorer.colorOf} mode={t === 0 ? 'raw' : 'harmonized'} active={null} onActive={() => {}} onSelect={() => {}}
              label={`${doc.name} Fire Rings, story step ${step + 1}`} emphasis={st.emphasis} centerLabel={t === 0 ? 'Raw' : 'Harmonized'} />
          </div>
        </div>
        <div className="space-y-[45vh] pb-[30vh] lg:pt-[10vh]">
          {steps.map((s, i) => (
            <section key={s.h} data-step={i} aria-current={step === i ? 'step' : undefined}
              className={`card transition-opacity duration-[var(--dur-slow)] ${step === i ? 'opacity-100' : 'opacity-40'}`}>
              <p className="num text-xs text-faint">{i + 1} / {steps.length}</p>
              <h2 className="mt-1 font-display text-xl font-semibold">{s.h}</h2>
              <div className="mt-2 text-sm leading-relaxed text-muted">{s.p}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
