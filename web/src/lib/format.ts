const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })

/** Integer with thousands separators. */
export const fmtInt = (v: number | null | undefined) => (v == null ? '—' : nf0.format(Math.round(v)))

/** Compact: 950 · 1.2k · 34k · 1.3M (one decimal max). */
export function fmtCompact(v: number | null | undefined): string {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a >= 1e6) return `${nf1.format(v / 1e6)}M`
  if (a >= 1e4) return `${nf0.format(v / 1e3)}k`
  if (a >= 1e3) return `${nf1.format(v / 1e3)}k`
  return nf0.format(Math.round(v))
}

export const fmtRatio = (v: number | null | undefined) => (v == null ? '—' : `${nf1.format(v)}×`)
