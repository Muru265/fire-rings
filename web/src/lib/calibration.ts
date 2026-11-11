import { MONTHS } from './series'
import type { RegionDoc } from './types'

/** #82: the monthly range over reliable months only (≥ low_n_threshold fire-days); low-reliability months named separately,
 * e.g. "0.14–0.40 (Aug 1.20 rests on few fires, low reliability)". All values from the region JSON. */
export function kRangeText(k: { month: number[]; low_n?: boolean[] }): string {
  const ok = k.month.filter((_, i) => !k.low_n?.[i])
  const low = k.month.map((v, i) => [v, i] as const).filter(([, i]) => k.low_n?.[i])
  const rng = ok.length ? `${Math.min(...ok).toFixed(2)}–${Math.max(...ok).toFixed(2)}` : 'no reliable month'
  return rng + (low.length ? ` (${low.map(([v, i]) => `${MONTHS[i]} ${v.toFixed(2)}`).join(', ')} ${low.length === 1 ? 'rests' : 'rest'} on few fires, low reliability)` : '')
}

/** Plain-words calibration summary (QA #35). Used by Provenance and Proof so they always match METHODS.md. */
export function calibrationSummary(doc: RegionDoc): string {
  const k = doc.k
  if (!k?.month?.length) return 'not calibrated'
  if (doc.method === 'pooled') {
    return `one exchange rate for all months (${k.pool.toFixed(2)}) — it predicted better than monthly rates in our tests (see Proof). 1 VIIRS fire-day ≈ ${k.pool.toFixed(2)} MODIS fire-days.`
  }
  // QA #67 / #82: range over reliable months, low-reliability months named; every month is listed; * = few fires
  const anyLow = k.month.some((_, i) => k.low_n?.[i])
  const list = k.month.map((v, i) => `${MONTHS[i]} ${v.toFixed(2)}${k.low_n?.[i] ? '*' : ''}`).join(', ')
  return `monthly exchange rates ${kRangeText(k)}, region-wide ${k.pool.toFixed(3)}: ${list}`
    + (anyLow ? ' (* = based on few fires, low reliability)' : '') + '.'
}
