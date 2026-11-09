// Mirrors the region JSON contract (master plan §6.3) written by pipeline/08_export.py.

export type Flag = 'uncertain' | 'provisional' | 'insufficient' | 'mtd'
export type SrcCode = 'T' | 'M' | 'V' | 'V2'

export interface MonthRec {
  y: number
  m: number
  H: number | null
  lo: number | null
  hi: number | null
  raw_modis: number | null
  raw_viirs: number | null
  hot_modis: number | null
  hot_viirs: number | null
  cov_modis: number | null
  cov_viirs: number | null
  src: SrcCode
  flags: Flag[]
}

export interface AnnualRec {
  y: number
  H: number | null
  lo: number | null
  hi: number | null
}

export interface RegionDoc {
  id: string
  name: string
  area_km2: number | null
  area_note: string
  bbox: [number, number, number, number]
  baseline: [number, number]
  calib_version: string | null
  updated: string
  data_end: string
  units: { H: string; raw: string; hot: string }
  method: string | null
  months: MonthRec[]
  k: { month: number[]; lo: number[]; hi: number[]; B: number[] }
  validation: Record<string, unknown> | null
  climatology: { median: number[]; p10: number[]; p90: number[] } | null
  latest: Record<string, unknown> | null
  annual: AnnualRec[]
  similar_years: number[]
  daily: Record<string, { modis?: number[]; viirs?: number[] }>
  harmonized: boolean
}

export interface MetaDoc {
  version: string
  data_end: string
  generated: string
  regions: { id: string; name: string; bbox: number[]; months: number; harmonized: boolean; first: string; last: string }[]
}

/** Which series the calendar shows. */
export type ViewMode = 'raw' | 'harmonized'
