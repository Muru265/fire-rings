const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })

const nf2s = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 2 })

/** #81c: never print negative zero — anything that rounds to 0 at `digits` decimals becomes +0. */
export const noNegZero = (v: number, digits = 0): number => {
  const f = 10 ** digits
  const r = Math.round(v * f) / f
  return r === 0 ? 0 : r
}

/** Integer with thousands separators. */
export const fmtInt = (v: number | null | undefined) => (v == null ? '—' : nf0.format(noNegZero(v)))

/** One decimal max, never "-0". */
export const fmt1 = (v: number | null | undefined) => (v == null ? '—' : nf1.format(noNegZero(v, 1)))

/** #81b: percent difference of a vs b with 2 significant figures (48,666 vs 48,595 → "0.15"). One formatter for Data, paper, slides. */
export function pctDiff2sig(a: number, b: number): string {
  if (!b) return '—'
  const d = (Math.abs(a - b) / b) * 100
  return d === 0 ? '0' : nf2s.format(d)
}

/** Compact: 950 · 1.2k · 34k · 1.3M (one decimal max). */
export function fmtCompact(v: number | null | undefined): string {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a >= 1e6) return `${nf1.format(v / 1e6)}M`
  if (a >= 1e4) return `${nf0.format(v / 1e3)}k`
  if (a >= 1e3) return `${nf1.format(v / 1e3)}k`
  return nf0.format(noNegZero(v))
}

export const fmtRatio = (v: number | null | undefined) => (v == null ? '—' : `${nf1.format(noNegZero(v, 1))}×`)
