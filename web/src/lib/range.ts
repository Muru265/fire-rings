// P1.1 Date range (From / To month). Lives in the URL (?from=2019-07&to=2020-03); no params = the full record.
// Every number in the range summary is a sum/sort over the published monthly values — nothing new is modelled.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MonthRec, RegionDoc } from './types'

export type YM = { y: number; m: number }
export const ymKey = (a: YM) => a.y * 12 + (a.m - 1)
export const fromKey = (k: number): YM => ({ y: Math.floor(k / 12), m: (k % 12) + 1 })
export const ymStr = (a: YM) => `${a.y}-${String(a.m).padStart(2, '0')}`
export function parseYM(s: string | null): YM | null {
  const m = s ? /^(\d{4})-(\d{2})$/.exec(s) : null
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  return mo >= 1 && mo <= 12 ? { y, m: mo } : null
}

export interface Range { from: YM; to: YM }

/** Range from the URL, clamped to the doc's record; null = full record (no filter). */
export function useRange(months: MonthRec[]): [Range | null, (r: Range | null) => void] {
  const [params, setParams] = useSearchParams()
  const first = months[0], last = months[months.length - 1]
  let from = parseYM(params.get('from')), to = parseYM(params.get('to'))
  let range: Range | null = null
  if (from || to) {
    from = from ?? first
    to = to ?? last
    if (ymKey(from) > ymKey(to)) [from, to] = [to, from]
    const lo = Math.max(ymKey(from), ymKey(first)), hi = Math.min(ymKey(to), ymKey(last))
    if (lo <= hi && !(lo === ymKey(first) && hi === ymKey(last))) range = { from: fromKey(lo), to: fromKey(hi) }
  }
  const set = useCallback((r: Range | null) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (r) { n.set('from', ymStr(r.from)); n.set('to', ymStr(r.to)) } else { n.delete('from'); n.delete('to') }
      return n
    }, { replace: true })
  }, [setParams])
  return [range, set]
}

export const inRange = (r: Range | null, y: number, m: number) => !r || (ymKey({ y, m }) >= ymKey(r.from) && ymKey({ y, m }) <= ymKey(r.to))
export const filterRange = (months: MonthRec[], r: Range | null) => (r ? months.filter((x) => inRange(r, x.y, x.m)) : months)
export const rangeLength = (r: Range) => ymKey(r.to) - ymKey(r.from) + 1

export interface RangeSummary {
  months: number
  withData: number
  total: number
  typical: number | null
  ratio: number | null
  busiest: MonthRec | null
  /** rank among the same calendar window in every other year with complete data (only when the range is ≤ 12 months) */
  rank: { rank: number; of: number; firstY: number; lastY: number } | null
  rankNote: string | null
  provisional: boolean
}

const complete = (r: MonthRec | undefined) => !!r && r.H != null && !r.flags.includes('mtd') && !r.flags.includes('insufficient')

export function summarizeRange(doc: RegionDoc, r: Range): RangeSummary {
  const sel = filterRange(doc.months, r)
  const withVal = sel.filter((x) => x.H != null)
  const total = withVal.reduce((a, x) => a + x.H!, 0)
  const med = doc.climatology?.median
  const typical = med && withVal.length ? withVal.reduce((a, x) => a + (med[x.m - 1] ?? 0), 0) : null
  const busiest = withVal.length ? withVal.reduce((a, b) => (b.H! > a.H! ? b : a)) : null
  let rank: RangeSummary['rank'] = null
  let rankNote: string | null = null
  const len = rangeLength(r)
  if (len > 12) rankNote = 'No rank: ranges longer than 12 months have no repeating “same months” to compare.'
  else if (!sel.every(complete) || sel.length !== len) rankNote = 'No rank: the range has a month that is incomplete or has no data.'
  else {
    const by = new Map(doc.months.map((x) => [`${x.y}-${x.m}`, x]))
    const years = [...new Set(doc.months.map((x) => x.y))]
    const sums: { y: number; s: number }[] = []
    for (const y0 of years) {
      const d = y0 - r.from.y
      let s = 0, ok = true
      for (let k = ymKey(r.from); k <= ymKey(r.to); k++) {
        const ym = fromKey(k + d * 12)
        const rec = by.get(`${ym.y}-${ym.m}`)
        // Terra-only months (2001–Jun 2002) are not ranked anywhere in the app
        if (!complete(rec) || rec!.src === 'T') { ok = false; break }
        s += rec!.H!
      }
      if (ok) sums.push({ y: y0, s })
    }
    const mine = sums.find((x) => x.y === r.from.y)
    if (mine && sums.length >= 5) {
      rank = { rank: 1 + sums.filter((x) => x.s > mine.s).length, of: sums.length, firstY: sums[0].y, lastY: sums[sums.length - 1].y }
    } else rankNote = 'No rank: fewer than 5 comparable periods with complete data.'
  }
  return {
    months: len, withData: withVal.length, total, typical, ratio: typical && typical > 0 ? total / typical : null,
    busiest, rank, rankNote, provisional: sel.some((x) => x.flags.includes('provisional') || x.flags.includes('mtd')),
  }
}
