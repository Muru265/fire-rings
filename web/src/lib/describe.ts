import { fmtInt } from './format'
import { MONTHS, sourceLabel, valueOf, VIIRS_START } from './series'
import type { MonthRec, ViewMode } from './types'

const FLAG_TEXT: Record<string, string> = {
  insufficient: 'insufficient satellite coverage',
  provisional: 'provisional (near-real-time data)',
  mtd: 'month to date',
  uncertain: 'uncertain (wide interval)',
}

export interface CellText {
  title: string
  value: string
  unit: string
  lines: string[]
  aria: string
}

export function describe(r: MonthRec | undefined, y: number, m: number, mode: ViewMode): CellText {
  const title = `${MONTHS[m - 1]} ${y}`
  if (!r) return { title, value: 'No data', unit: '', lines: [], aria: `${title}: no data` }
  const v = valueOf(r, mode)
  const unit = mode === 'harmonized' ? 'fire-days (MODIS-equivalent)' : 'fire-days (raw)'
  const value = v == null ? 'No data' : fmtInt(v)
  const lines: string[] = []
  if (mode === 'harmonized' && r.lo != null && r.hi != null) lines.push(`90% interval ${fmtInt(r.lo)}–${fmtInt(r.hi)}`)
  lines.push(`Source: ${sourceLabel(r, mode)}`)
  const hm = r.hot_modis != null ? `MODIS ${fmtInt(r.hot_modis)}` : null
  const hv = r.y >= VIIRS_START && r.hot_viirs != null ? `VIIRS ${fmtInt(r.hot_viirs)}` : null
  if (hm || hv) lines.push(`Raw hotspots: ${[hm, hv].filter(Boolean).join(' / ')}`)
  for (const f of r.flags) lines.push(`⚑ ${FLAG_TEXT[f] ?? f}`)
  const aria = `${title}: ${v == null ? 'no data' : `${value} ${unit}`}. ${lines.join('. ')}`
  return { title, value, unit, lines, aria }
}
