import { useEffect, useState } from 'react'
import type { WatchDoc } from '../../api/_lib/watch'
import { fetchJson } from '../lib/api'
import Help from './Help'
import { useFigure } from '../lib/figureCtx'

/** "Why harmonization matters" (Fire Watch Part B #4): the SAME rules on raw vs harmonized data, 2012–2025, from the pipeline. */
export default function WatchProof({ doc: given }: { doc?: WatchDoc | null }) {
  const [doc, setDoc] = useState<WatchDoc | null>(given ?? null)
  const bare = useFigure()
  useEffect(() => { if (!given) fetchJson<WatchDoc>('watch.json').then(setDoc).catch(() => {}) }, [given])
  if (!doc) return <div className="card h-64 animate-pulse" />
  const t = doc.backtest.totals
  const years = Object.keys(doc.backtest.per_year).sort()
  const max = Math.max(1, ...years.map((y) => Math.max(doc.backtest.per_year[y].raw, doc.backtest.per_year[y].harmonized)))
  const [y0, y1] = doc.backtest.period.map((p) => p.slice(0, 4))
  const chart = (
    <div className={bare ? '' : 'mt-4 overflow-x-auto'}>
      <div className={bare ? '' : 'min-w-[520px]'} role="img" aria-label={`Alerts per year, raw vs harmonized, ${y0}–${y1}.${bare ? '' : ' Use the table below for values.'}`}>
        <div className="flex h-36 items-end gap-1.5 border-b border-border">
          {years.map((y) => {
            const r = doc.backtest.per_year[y]
            return (
              <div key={y} className="flex h-full flex-1 items-end justify-center gap-[2px]" title={bare ? undefined : `${y}: raw ${r.raw} · harmonized ${r.harmonized} · raw-only ${r.raw_only}`}>
                <span className="w-1/2 max-w-[14px] rounded-t-[2px]" style={{ height: `${(100 * r.raw) / max}%`, background: 'repeating-linear-gradient(45deg,#E5A23A 0 3px,#B4793A 3px 5px)' }} />
                <span className="w-1/2 max-w-[14px] rounded-t-[2px] bg-[#3BB27A]" style={{ height: `${(100 * r.harmonized) / max}%` }} />
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex gap-1.5 font-mono text-[10px] text-faint">{years.map((y) => <span key={y} className="flex-1 text-center">{y.slice(2)}</span>)}</div>
      </div>
    </div>
  )
  const legend = (
    <ul className="mt-2 flex list-none flex-wrap gap-x-5 gap-y-1 pl-0 text-xs text-muted">
      <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[2px]" style={{ background: 'repeating-linear-gradient(45deg,#E5A23A 0 3px,#B4793A 3px 5px)' }} />raw (unconverted VIIRS from 2012) — striped</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[2px] bg-[#3BB27A]" />harmonized — solid</li>
      <li>alerts = months the rules call “far above normal” or “above every baseline year”</li>
    </ul>
  )
  if (bare) return <div data-figure-chart="watchproof">{chart}{legend}</div>
  return (
    <section className="card" aria-labelledby="wp-h" data-testid="watch-proof">
      <h2 id="wp-h" className="font-display text-xl font-semibold">Why harmonization matters: the same agent on raw vs harmonized data<Help id="raw-vs-harmonized" /></h2>
      <p className="mt-2 max-w-4xl text-base text-text" data-testid="watch-proof-headline">
        On <strong>raw</strong> data the agent would have raised <strong className="num text-warn">{t.raw_alerts}</strong> “far above normal” alerts since {y0} —{' '}
        <strong className="num text-warn">{t.raw_only_alerts}</strong> of them caused only by the satellite switch. On <strong>harmonized</strong> data:{' '}
        <strong className="num text-ok">{t.harmonized_alerts}</strong>.
      </p>
      <p className="mt-1 max-w-4xl text-sm text-muted">
        Raw data also hides real drops: it flags <span className="num text-text">{t.raw_lows}</span> “far below normal” months, the harmonized record <span className="num text-text">{t.harmonized_lows}</span>.
        Same thresholds, same 2003–2022 baseline, every month {y0}–{y1}, all {Object.keys(doc.regions).length} regions.
      </p>
      {chart}
      {legend}
      <table className="mt-4 w-full max-w-2xl text-sm" data-testid="watch-proof-table">
        <thead><tr className="text-left text-xs text-faint"><th className="py-1 font-medium">Region</th><th className="text-right font-medium">Raw alerts</th><th className="text-right font-medium">Only from the switch</th><th className="text-right font-medium">Harmonized alerts</th></tr></thead>
        <tbody>
          {Object.entries(doc.regions).map(([id, r]) => (
            <tr key={id} className="border-t border-border"><td className="py-1.5 text-text">{r.name}</td><td className="num text-right">{r.backtest.raw_alerts}</td>
              <td className="num text-right text-warn">{r.backtest.raw_only_alerts}</td><td className="num text-right text-ok">{r.backtest.harmonized_alerts}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-faint">{doc.backtest.method} Computed in <code>pipeline/09_watch.py</code>, published in <code>/data/v1/watch.json</code>.</p>
    </section>
  )
}
