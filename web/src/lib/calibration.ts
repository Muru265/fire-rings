import { MONTHS } from './series'
import type { RegionDoc } from './types'

/** Plain-words calibration summary (QA #35). Used by Provenance and Proof so they always match METHODS.md. */
export function calibrationSummary(doc: RegionDoc): string {
  const k = doc.k
  if (!k?.month?.length) return 'not calibrated'
  if (doc.method === 'pooled') {
    return `one exchange rate for all months (${k.pool.toFixed(2)}) — it predicted better than monthly rates in our tests (see Proof). 1 VIIRS fire-day ≈ ${k.pool.toFixed(2)} MODIS fire-days.`
  }
  const ok = k.month.filter((_, i) => !k.low_n?.[i])
  const low = k.month.map((v, i) => ({ v, i })).filter(({ i }) => k.low_n?.[i])
  return `monthly exchange rates ${Math.min(...ok).toFixed(2)}–${Math.max(...ok).toFixed(2)}, region-wide ${k.pool.toFixed(3)}`
    + (low.length ? `; ${low.map(({ v, i }) => `${MONTHS[i]} ${v.toFixed(2)}`).join(', ')} based on few fires (low reliability)` : '') + '.'
}
