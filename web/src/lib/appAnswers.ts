// #92 The one-line answer each companion app shows for its default region, computed here from the same published JSON
// (same-origin /data/v1) with the same rules as fire-rings-apps/src/pages/*.tsx — used by the phone card list on /use-cases.
import { fetchJson } from './api'

const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const fmt = (v: number) => nf.format(Math.round(v))
const q = (vs: number[], p: number) => { const s = [...vs].sort((a, b) => a - b); const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo) }
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }

/* eslint-disable @typescript-eslint/no-explicit-any */
type M = { y: number; m: number; H: number | null; src: string; flags: string[] }

/** App 1: projection only when it beat "typical" in the backtest; class vs the published P10–P90. */
async function expect(): Promise<string> {
  const p: any = await fetchJson('api/projection/punjab.json')
  const c = p.current
  if (!c) return `Typical next month: ${fmt(p.next_month.typical)} fire-days.`
  if (c.better === 'projection' && c.projection != null) {
    const cls = c.projection < c.p10 ? 'quieter than usual' : c.projection > c.p90 ? 'busier than usual' : 'about usual'
    return `${FULL[c.m - 1]} in Punjab–Haryana: ${cls} (about ${fmt(c.projection)} fire-days expected).`
  }
  return `Typical for ${FULL[c.m - 1]} in Punjab–Haryana: ${fmt(c.typical)} fire-days.`
}

/** App 2: SE Australia, Sep 2019 – Feb 2020, rank among complete 6-month seasons. */
async function factcheck(): Promise<string> {
  const d: any = await fetchJson('regions/se_australia.json')
  const key = (y: number, m: number) => y * 12 + m - 1
  const by = new Map<number, M>(d.months.map((x: M) => [key(x.y, x.m), x]))
  const ok = (k: number) => { const x = by.get(k); return !!x && x.H != null && x.src !== 'T' && !x.flags.includes('mtd') && !x.flags.includes('insufficient') }
  const seasons = [...new Set<number>(d.months.map((x: M) => x.y))].flatMap((y) => { const ks = Array.from({ length: 6 }, (_, i) => key(y, 9) + i); return ks.every(ok) ? [{ y, t: ks.reduce((a, k) => a + by.get(k)!.H!, 0) }] : [] })
  const mine = seasons.find((s) => s.y === 2019)
  if (!mine) return 'No complete data for Sep 2019 – Feb 2020.'
  const rank = 1 + seasons.filter((s) => s.t > mine.t).length
  return `Sep 2019 – Feb 2020, SE Australia’s worst season? ${rank === 1 ? `TRUE — 1st of ${seasons.length} seasons.` : `NOT QUITE — ranked ${rank} of ${seasons.length}.`}`
}

/** App 3: Punjab, 90th-percentile trigger, 2003–2025. */
async function insurance(): Promise<string> {
  const s: any = await fetchJson('api/series/punjab.json')
  const thr = (c: number) => Array.from({ length: 12 }, (_, m) => q(s.months.filter((x: any[]) => x[1] === m + 1 && x[0] >= s.baseline[0] && x[0] <= s.baseline[1] && x[c] != null).map((x: any[]) => x[c]), 0.9))
  const tH = thr(2), tR = thr(5), cells = s.months.filter((x: any[]) => x[0] >= 2003 && x[0] <= 2025)
  const raw = (x: any[]) => x[5] != null && x[5] > tR[x[1] - 1], harm = (x: any[]) => x[2] != null && x[2] > tH[x[1] - 1]
  return `With raw satellite data, ${cells.filter((x: any[]) => raw(x) && !harm(x) && x[0] >= 2012).length} of ${cells.filter(raw).length} payouts would have been triggered by the satellite switch, not by fire.`
}

/** App 4: Punjab Oct–Nov, rank of the latest complete season (* detection-time caveat). */
async function smoke(): Promise<string> {
  const d: any = await fetchJson('regions/punjab.json')
  const full = [...new Set<number>(d.months.map((m: M) => m.y))].flatMap((y) => {
    const o = d.months.find((x: M) => x.y === y && x.m === 10), n = d.months.find((x: M) => x.y === y && x.m === 11)
    return o?.H != null && n?.H != null && !n.flags.includes('mtd') && o.src !== 'T' ? [{ y, t: o.H + n.H }] : []
  })
  const last = full[full.length - 1], rank = 1 + full.filter((s) => s.t > last.t).length
  const phrase = rank === 1 ? 'the biggest' : rank === full.length ? 'the smallest' : `the ${ord(rank)}-biggest`
  return `Oct–Nov ${last.y}: ${phrase} burning season in ${full.length} years* (*recent seasons may be undercounted).`
}

/** App 5: MODIS eruptions seen; timing wording from the per-eruption lags. */
async function volcano(): Promise<string> {
  const r: any = await fetchJson('api/reunion.json')
  const s = r.summary
  const lags = r.eruptions.map((e: any) => e.sensors.modis).filter((m: any) => m?.detected && m.lag_days != null).map((m: any) => m.lag_days as number)
  const first = lags.filter((l: number) => l <= 0).length
  const timing = lags.length && first === lags.length ? 'on the first day' : first * 2 >= lags.length ? 'most on the first day' : `first seen a median ${s.modis.median_lag_days} days after the start`
  return `The satellites saw ${s.modis.detected} of ${s.modis.eruptions_in_period} eruptions — ${timing}. VIIRS: ${s.viirs.detected} of ${s.viirs.eruptions_in_period}.`
}

/** App 6: last 10 complete years ÷ 2003–2022 median year; < 0.8 below, 0.8–1.2 about, > 1.2 above. */
async function land(): Promise<string> {
  const d: any = await fetchJson('regions/punjab.json')
  const yrs = d.annual.filter((a: any) => a.complete && a.rankable !== false && a.H != null), lastY = yrs[yrs.length - 1].y
  const l10 = yrs.filter((a: any) => a.y > lastY - 10), normal = q(yrs.filter((a: any) => a.y >= d.baseline[0] && a.y <= d.baseline[1]).map((a: any) => a.H), 0.5)
  const r = l10.reduce((a: number, x: any) => a + x.H, 0) / l10.length / normal
  return `Fire history: ${r < 0.8 ? 'Below normal' : r > 1.2 ? 'Above normal' : 'About normal'} — last 10 years ${r.toFixed(1)}× normal.`
}

export const APP_ANSWERS: Record<string, () => Promise<string>> = { expect, factcheck, insurance, smoke, volcano, land }
