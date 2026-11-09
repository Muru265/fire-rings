import { interpolateRgb } from 'd3-interpolate'
import { quantileScale } from './scales'
import type { ClassScale } from './scales'
import { fmtCompact } from './format'
import { VIIRS_START } from './series'
import type { CalMode, MonthRec, RegionDoc } from './types'

export const ZERO_HEX = '#1C2533'
export const GUARD_HEX = '#3A4250'

/** Anomaly ramp: ColorBrewer RdBu reversed, 7 classes on log2(H / median), limits ±3; neutral middle #2A3442. */
export const ANOM_COLORS = ['#2166AC', '#67A9CF', '#D1E5F0', '#2A3442', '#FDDBC7', '#EF8A62', '#B2182B']
export const ANOM_BREAKS = [-2, -1, -0.4, 0.4, 1, 2] // log2 class edges
export const ANOM_LABELS = ['≤ ¼×', '¼–½×', '½–¾×', 'typical (¾–1.3×)', '1.3–2×', '2–4×', '≥ 4×']

export function anomClass(l2: number): number {
  let c = 0
  while (c < ANOM_BREAKS.length && l2 > ANOM_BREAKS[c]) c++
  return c
}

export const rawValue = (r: MonthRec) =>
  r.flags.includes('insufficient') ? null : r.y < VIIRS_START ? r.raw_modis : r.raw_viirs

export interface Colorer {
  colorOf: (r: MonthRec) => string | null
  /** glyph drawn on grid cells (anomaly ▲▼, guard ~) */
  glyphOf: (r: MonthRec) => string | null
  rawScale: ClassScale
  harmScale: ClassScale
}

const resolveZero = (c: string | null) => (c === 'var(--zero)' ? ZERO_HEX : c)

export function makeColorer(doc: RegionDoc, mode: CalMode, t: number): Colorer {
  const rawScale = quantileScale(doc.months.map(rawValue), fmtCompact)
  const harmScale = quantileScale(doc.months.map((r) => r.H), fmtCompact)
  const med = doc.climatology?.median ?? []

  if (mode === 'anomaly') {
    return {
      rawScale, harmScale,
      colorOf: (r) => {
        if (r.H == null || !med[r.m - 1]) return null
        if (r.guard) return GUARD_HEX
        return ANOM_COLORS[anomClass(Math.log2(Math.max(r.H, 0.5) / med[r.m - 1]))]
      },
      glyphOf: (r) => {
        if (r.H == null || !med[r.m - 1]) return null
        if (r.guard) return '~'
        const l2 = Math.log2(Math.max(r.H, 0.5) / med[r.m - 1])
        return l2 >= 1 ? '▲' : l2 <= -1 ? '▼' : null
      },
    }
  }
  return {
    rawScale, harmScale,
    colorOf: (r) => {
      const a = resolveZero(rawScale.colorOf(rawValue(r)))
      const b = resolveZero(harmScale.colorOf(r.H))
      if (t <= 0) return a
      if (t >= 1) return b
      if (a == null || b == null) return t < 0.5 ? a : b
      return interpolateRgb(a, b)(t)
    },
    glyphOf: () => null,
  }
}
