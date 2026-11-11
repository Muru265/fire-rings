import AnnualBars from '../components/AnnualBars'
import MiniRings from '../components/MiniRings'
import Qr from '../components/Qr'
import SeasonalityChart from '../components/SeasonalityChart'
import WatchProof from '../components/WatchProof'
import VolcanoCard from '../components/VolcanoCard'
import { BeforeAfter, DetectionTiming } from '../pages/Proof'
import type { ContentData } from './content'
import { FigureCtx } from './figureCtx'

/** The app's real charts, used as figures in the paper and slides (P1.8). */
export function renderFigure(c: ContentData, name: string, arg: string | undefined, compact = false) {
  return <FigureCtx.Provider value={true}><div className="figure-bare" data-figure={name}>{figureBody(c, name, arg, compact)}</div></FigureCtx.Provider>
}

function figureBody(c: ContentData, name: string, arg: string | undefined, compact: boolean) {
  const doc = arg ? c.docs[arg] : undefined
  if (name === 'qr') return <Qr />
  if (name === 'watchproof') return <WatchProof doc={c.watch} />
  if (name === 'timing') return <DetectionTiming />
  if (name === 'volcano') return <VolcanoCard />
  if (name === 'img' && arg) return <img src={arg} alt="The Use Cases control room: six example apps, each calling the Fire Rings open API" className="w-full rounded-sm border border-border" />
  if (!doc) return <p className="text-sm text-warn">⟨missing figure: {name} {arg}⟩</p>
  const lastFull = doc.annual.filter((a) => a.complete).at(-1)?.y ?? doc.months[doc.months.length - 1].y
  if (name === 'annual') return <AnnualBars doc={doc} />
  if (name === 'beforeafter') {
    const v = c.val?.[doc.id]
    const v3 = v?.results?.[v?.summary?.method]?.V3
    return v3 ? <BeforeAfter v3={v3} doc={doc} /> : <p className="text-sm text-warn">⟨missing figure: {name} {arg}⟩</p>
  }
  if (name === 'seasonality') return <SeasonalityChart doc={doc} year={lastFull} />
  if (name === 'rings') return <div className="flex justify-center"><MiniRings months={doc.months} size={compact ? 200 : 260} label={`Fire Rings, ${doc.name}, 2001–now`} /></div>
  return <p className="text-sm text-warn">⟨unknown figure: {name}⟩</p>
}
