import { fmtInt, fmtRatio } from './format'
import { MONTHS, sourceLabel, valueOf, VIIRS_START } from './series'
import type { MonthRec, ViewMode } from './types'

const FLAG_TEXT: Record<string, string> = {
  insufficient: 'insufficient satellite coverage',
  provisional: 'provisional (near-real-time data)',
  mtd: 'month to date',
  uncertain: 'uncertain (wide interval)',
  terra_only: 'Terra only — wider uncertainty; not ranked',
  overpass_timing: 'detected at satellite overpass times; burning has reportedly shifted to late afternoon, so this may be undercounted',
}

export interface CellText {
  title: string
  value: string
  unit: string
  lines: string[]
  aria: string
}

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function pctRange(p: [number, number] | null | undefined): string | null {
  if (!p) return null
  return p[0] === p[1] ? `${ordinal(p[0])} pct` : `${ordinal(p[0])}–${ordinal(p[1])} pct`
}

export function describe(r: MonthRec | undefined, y: number, m: number, mode: ViewMode): CellText {
  const title = `${MONTHS[m - 1]} ${y}`
  if (!r) return { title, value: 'No data', unit: '', lines: [], aria: `${title}: no data` }
  const v = valueOf(r, mode)
  const unit = mode === 'harmonized' ? 'fire-days (MODIS-equivalent)' : 'fire-days (raw)'
  const value = v == null ? 'No data' : fmtInt(v)
  const lines: string[] = []
  if (mode === 'harmonized' && r.lo != null && r.hi != null) lines.push(`90% interval ${fmtInt(r.lo)}–${fmtInt(r.hi)}`)
  if (mode === 'harmonized' && r.H != null) {
    if (r.guard) lines.push('Too little fire to judge against normal')
    else if (r.ratio != null) {
      const bits = [`${fmtRatio(r.ratio)} median`, pctRange(r.pct)].filter(Boolean)
      lines.push(bits.join(' · '))
    }
    if (r.rank != null && !r.guard) lines.push(`Rank ${r.rank} of ${MONTHS[m - 1]}s on record`)
  }
  lines.push(`Source: ${sourceLabel(r, mode)}`)
  const hm = r.hot_modis != null ? `MODIS ${fmtInt(r.hot_modis)}` : null
  const hv = r.y >= VIIRS_START && r.hot_viirs != null ? `VIIRS ${fmtInt(r.hot_viirs)}` : null
  if (hm || hv) lines.push(`Raw hotspots: ${[hm, hv].filter(Boolean).join(' / ')}`)
  for (const f of r.flags) lines.push(`⚑ ${FLAG_TEXT[f] ?? f}`)
  const aria = `${title}: ${v == null ? 'no data' : `${value} ${unit}`}. ${lines.join('. ')}`
  return { title, value, unit, lines, aria }
}
