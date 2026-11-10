import { interpolateInferno } from 'd3-scale-chromatic'
import { quantile } from 'd3-array'

/** Counts ramp: inferno sampled t ∈ [0.18, 0.98] (bottom of inferno vanishes on the dark background). */
export const N_CLASSES = 7
/** Map ramp (QA #18): the same Inferno ramp started brighter (0.34 → 0.98) so the lowest class stays visible on the dark basemap. */
export const MAP_COLORS = Array.from({ length: N_CLASSES }, (_, i) => interpolateInferno(0.34 + (0.64 * i) / (N_CLASSES - 1)))

export const COUNT_COLORS = Array.from({ length: N_CLASSES }, (_, i) =>
  interpolateInferno(0.18 + (0.8 * i) / (N_CLASSES - 1)),
)
export const ZERO_COLOR = 'var(--zero)'

export interface ClassScale {
  /** class upper bounds (inclusive); the last class is open-ended */
  breaks: number[]
  /** colour per class (length = breaks.length + 1, spread across the full ramp) */
  colors: string[]
  colorOf: (v: number | null | undefined) => string | null
  classOf: (v: number) => number
  /** legend label per class */
  labels: string[]
}

/**
 * Up to 7 quantile classes over the region's non-zero values. Tied breaks (common in low-fire regions with small
 * integer counts) are merged, and the remaining classes keep the full ramp extent.
 * Zero gets its own colour; null → no colour (pattern).
 */
export function quantileScale(values: (number | null | undefined)[], fmt: (v: number) => string = String): ClassScale {
  const nz = values.filter((v): v is number => v != null && v > 0).sort((a, b) => a - b)
  const raw: number[] = []
  for (let i = 1; i < N_CLASSES; i++) if (nz.length) raw.push(quantile(nz, i / N_CLASSES) ?? 0)
  const breaks = [...new Set(raw)].filter((b) => b < (nz[nz.length - 1] ?? 0))
  const n = breaks.length + 1
  const colors = Array.from({ length: n }, (_, i) =>
    COUNT_COLORS[n === 1 ? N_CLASSES - 1 : Math.round((i * (N_CLASSES - 1)) / (n - 1))])
  const classOf = (v: number) => {
    let c = 0
    while (c < breaks.length && v > breaks[c]) c++
    return c
  }
  const labels = colors.map((_, i) => {
    if (n === 1) return `${fmt(nz[0] ?? 0)}–${fmt(nz[nz.length - 1] ?? 0)}`
    if (i === 0) return `≤ ${fmt(breaks[0])}`
    if (i === n - 1) return `> ${fmt(breaks[n - 2])}`
    return `${fmt(breaks[i - 1])}–${fmt(breaks[i])}`
  })
  return {
    breaks,
    colors,
    classOf,
    labels,
    colorOf: (v) => (v == null ? null : v <= 0 ? ZERO_COLOR : colors[classOf(v)]),
  }
}
