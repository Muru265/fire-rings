import type { AnnualRec, MonthRec, RegionDoc } from './types'

const q = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b)
  if (!s.length) return 0
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo)
}

/**
 * For a custom box: climatology (baseline median, P10, P90) and annual totals recomputed from the box's own monthly
 * values, so Seasonality and Annual totals keep working in box view (QA #15). No bootstrap intervals for boxes.
 */
export function boxDerived(doc: RegionDoc, months: MonthRec[]): Pick<RegionDoc, 'climatology' | 'annual'> {
  const [b0, b1] = doc.baseline
  const median: number[] = []
  const p10: number[] = []
  const p90: number[] = []
  const n: number[] = []
  for (let m = 1; m <= 12; m++) {
    const v = months.filter((r) => r.m === m && r.y >= b0 && r.y <= b1 && r.H != null).map((r) => r.H!)
    median.push(Math.round(q(v, 0.5) * 10) / 10)
    p10.push(Math.round(q(v, 0.1) * 10) / 10)
    p90.push(Math.round(q(v, 0.9) * 10) / 10)
    n.push(v.length)
  }
  const annual: AnnualRec[] = [...new Set(months.map((r) => r.y))].map((y) => {
    const ms = months.filter((r) => r.y === y)
    const vals = ms.map((r) => r.H)
    const terra = ms.filter((r) => r.src === 'T').length
    const complete = ms.length === 12 && vals.every((v) => v != null) && !ms.some((r) => r.flags.includes('mtd'))
    return { y, H: vals.some((v) => v == null) ? null : Math.round(vals.reduce((a, b) => a! + b!, 0)! * 10) / 10,
      lo: null, hi: null, complete, terra_only_months: terra, rankable: complete && terra === 0 }
  })
  return { climatology: { median, p10, p90, n }, annual }
}
