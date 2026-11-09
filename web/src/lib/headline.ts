import { fmtInt, fmtRatio } from './format'
import { MONTHS } from './series'
import { ordinal } from './describe'
import type { MonthRec, RegionDoc } from './types'

export interface Judgement {
  y: number
  m: number
  value: number | null
  lo: number | null
  hi: number | null
  ratio: number | null
  median: number | null
  pct: [number, number] | null
  rp: number | null
  beyond: boolean
  rank: number | null
  rankOf: number | null
  guard: boolean
  mtd: boolean
  days?: number
  provisional: boolean
  uncertain: boolean
  terraOnly: boolean
  /** Punjab Oct–Nov 2022+: detection-time caveat text (docs/punjab_timing.md) */
  timingCaveat: string | null
}

/** Judgement for a month record (uses the per-month stats exported by 07_stats). */
export function judgeMonth(doc: RegionDoc, r: MonthRec): Judgement {
  const lt = doc.latest
  const isLatestMtd = !!lt?.mtd && lt.y === r.y && lt.m === r.m
  const sameMonth = doc.months.filter((x) => x.m === r.m && x.H != null && !x.flags.includes('mtd') && x.src !== 'T')
  return {
    y: r.y, m: r.m, value: r.H, lo: r.lo, hi: r.hi, ratio: r.ratio ?? null,
    median: isLatestMtd ? lt?.median ?? null : doc.climatology?.median[r.m - 1] ?? null,
    pct: r.pct ?? null, rp: r.rp ?? null, beyond: !!r.beyond, rank: r.rank ?? null,
    rankOf: isLatestMtd ? lt?.rank_of ?? null : sameMonth.length,
    guard: !!r.guard, mtd: r.flags.includes('mtd'), days: isLatestMtd ? lt?.days : undefined,
    provisional: r.flags.includes('provisional'), uncertain: r.flags.includes('uncertain'),
    terraOnly: r.flags.includes('terra_only'),
    timingCaveat: r.flags.includes('overpass_timing') ? doc.caveats?.overpass_timing ?? null : null,
  }
}

export function headline(j: Judgement): { lead: string; rest: string } {
  const mon = MONTHS[j.m - 1]
  const full = new Date(Date.UTC(j.y, j.m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  const when = j.mtd ? `${full} ${j.y} so far (1–${j.days ?? '?'} ${mon})` : `${full} ${j.y}`
  if (j.value == null) return { lead: `${when}:`, rest: 'no harmonized value (insufficient satellite coverage).' }
  if (j.guard) {
    return { lead: `${when}:`, rest: `too little fire to judge. A typical ${full} has about ${fmtInt(j.median)} fire-days.` }
  }
  const parts: string[] = []
  const r = j.ratio
  if (r != null) parts.push(`${fmtRatio(r)} a typical ${full}${j.mtd ? ' (same days)' : ''}`)
  if (j.rank != null && j.rankOf != null && j.rank === 1) parts.push(`the highest ${full} on record`)
  else if (j.rank != null && j.rankOf != null && j.rank === j.rankOf) parts.push(`the lowest ${full} on record`)
  else if (j.pct) parts.push(j.pct[0] === j.pct[1] ? `${ordinal(j.pct[0])} percentile` : `${ordinal(j.pct[0])}–${ordinal(j.pct[1])} percentile`)
  if (j.beyond) parts.push('beyond anything in the 2003–2022 baseline')
  else if (j.rp != null && r != null && r > 1) parts.push(`about a 1-in-${Math.round(j.rp)}-year ${full}`)
  const tail = [j.provisional ? 'Provisional.' : '', j.uncertain ? 'Uncertain.' : '',
    j.terraOnly ? 'Terra only — wider uncertainty; not ranked.' : '', j.timingCaveat ?? ''].filter(Boolean).join(' ')
  return { lead: `${when}:`, rest: `${parts.join(', ')}.${tail ? ` ${tail}` : ''}` }
}
