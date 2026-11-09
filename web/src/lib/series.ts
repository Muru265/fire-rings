import type { MonthRec, ViewMode } from './types'

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
export const VIIRS_START = 2012

/**
 * Value shown for a month.
 * raw: naive concatenation — MODIS cell-days before 2012, VIIRS cell-days from 2012 (S-NPP, NOAA-20 from Nov 2026).
 * harmonized: H (MODIS-equivalent). null = no data / insufficient coverage.
 */
export function valueOf(r: MonthRec, mode: ViewMode): number | null {
  if (mode === 'harmonized') return r.H
  if (r.flags.includes('insufficient')) return null
  return r.y < VIIRS_START ? r.raw_modis : r.raw_viirs
}

export function sourceLabel(r: MonthRec, mode: ViewMode): string {
  if (mode === 'raw') return r.y < VIIRS_START ? 'MODIS (raw)' : r.src === 'V2' ? 'VIIRS NOAA-20 (raw)' : 'VIIRS S-NPP (raw)'
  return { T: 'MODIS Terra (scaled to Terra+Aqua)', M: 'MODIS Terra+Aqua', V: 'VIIRS S-NPP (calibrated)', V2: 'VIIRS NOAA-20 (calibrated)' }[r.src]
}

export type Grid = { years: number[]; byKey: Map<string, MonthRec> }

export function toGrid(months: MonthRec[]): Grid {
  const byKey = new Map<string, MonthRec>()
  const years = new Set<number>()
  for (const r of months) {
    byKey.set(`${r.y}-${r.m}`, r)
    years.add(r.y)
  }
  return { years: [...years].sort((a, b) => a - b), byKey }
}

export const key = (y: number, m: number) => `${y}-${m}`
