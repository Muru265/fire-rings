import { useSearchParams } from 'react-router-dom'
import AskPanel from '../components/AskPanel'
import { findRegion } from '../lib/regions'
import Help from '../components/Help'

export default function Ask() {
  const [sp] = useSearchParams()
  const region = findRegion(sp.get('region') ?? undefined)?.id
  const y = sp.get('y')
  const m = sp.get('m')
  const q = sp.get('q') ?? (y && m ? `How unusual was ${new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${y}?` : undefined)
  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <p className="eyebrow">AI analyst</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">Ask Fire Rings<Help id="ask-page" /></h1>
        <p className="mt-2 text-base text-muted">Plain-English answers grounded only in the harmonized record. Every number is looked up, verified, and shown with its source.</p>
      </header>
      <AskPanel initialRegion={region} initialQuestion={q} />
    </div>
  )
}
