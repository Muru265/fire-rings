// High detail view doc (QA #44): the same RegionDoc shape with native VIIRS values swapped in, so every chart,
// the gauge, KPIs, rings, calendar and drawer switch together without their own mode logic.
import type { LatestStats, MonthRec, RegionDoc } from './types'

export function hasDetail(doc: RegionDoc | null | undefined): boolean {
  return !!doc?.detail
}

export function toDetail(doc: RegionDoc): RegionDoc {
  const d = doc.detail
  if (!d) return doc
  const months: MonthRec[] = doc.months.filter((r) => r.y >= 2012).map((r) => ({
    ...r,
    H: r.V ?? null, lo: r.V_lo ?? null, hi: r.V_hi ?? null,
    ratio: r.V_ratio ?? null, pct: r.V_pct ?? null, rp: r.V_rp ?? null, rp_range: r.V_rp_range ?? null,
    beyond: r.V_beyond ?? null, rank: r.V_rank ?? null, guard: r.V_guard ?? null,
    // "uncertain" in Long-term comes from the calibration bootstrap; native values carry counting noise only
    flags: r.flags.filter((f) => f !== 'uncertain' && f !== 'terra_only'),
  }))
  const lat = (x: typeof d.latest): LatestStats => ({
    y: x.y, m: x.m, mtd: x.mtd, value: x.value, lo: x.lo, hi: x.hi, median: x.median, ratio: x.ratio, pct: x.pct,
    return_period: x.rp, beyond_record: x.beyond, rank: x.rank ?? undefined, rank_of: x.rank_of, guard: x.guard,
    provisional: x.provisional, days: x.days, baseline_kind: x.baseline_kind,
  })
  return {
    ...doc,
    mode: 'detail',
    baseline: d.baseline,
    months,
    climatology: d.climatology,
    latest: lat(d.latest),
    latest_complete: lat(d.latest_complete),
    annual: d.annual,
    similar_years: d.similar_years,
    similar_detail: d.similar_detail,
    units: { ...doc.units, H: d.unit },
    // native = no MODIS conversion: ratio 1 for S-NPP months; NOAA-20 months keep the VIIRS↔VIIRS bridge k′ (factorOf)
    k: { ...doc.k, month: doc.k.month.map(() => 1), pool: 1 },
    q: null,
    hex_years: doc.hex_years.filter((y) => y >= 2012),
  }
}
