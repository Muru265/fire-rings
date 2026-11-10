import { MONTHS } from './series'
import type { RegionDoc } from './types'

/** Plain-words calibration summary (QA #35). Used by Provenance and Proof so they always match METHODS.md. */
export function calibrationSummary(doc: RegionDoc): string {
  const k = doc.k
  if (!k?.month?.length) return 'not calibrated'
  if (doc.method === 'pooled') {
    return `one exchange rate for all months (${k.pool.toFixed(2)}) — it predicted better than monthly rates in our tests (see Proof). 1 VIIRS fire-day ≈ ${k.pool.toFixed(2)} MODIS fire-days.`
  }
  // QA #67: the range covers every month, and every month is listed; * = based on few fires (low reliability)
  const anyLow = k.month.some((_, i) => k.low_n?.[i])
  const list = k.month.map((v, i) => `${MONTHS[i]} ${v.toFixed(2)}${k.low_n?.[i] ? '*' : ''}`).join(', ')
  return `monthly exchange rates ${Math.min(...k.month).toFixed(2)}–${Math.max(...k.month).toFixed(2)}, region-wide ${k.pool.toFixed(3)}: ${list}`
    + (anyLow ? ' (* = based on few fires, low reliability)' : '') + '.'
}
