// Mirrors the region JSON contract (master plan §6.3) written by pipeline/08_export.py.

export type Flag = 'uncertain' | 'provisional' | 'insufficient' | 'mtd' | 'terra_only' | 'overpass_timing'
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
  ratio?: number | null
  pct?: [number, number] | null
  rp?: number | null
  beyond?: boolean | null
  rank?: number | null
  guard?: boolean | null
  rp_range?: [number, number] | null
  /** High detail (QA #44): native VIIRS, S-NPP-equivalent fire-days, 2012+ (07b_detail) */
  V?: number | null
  V_lo?: number | null
  V_hi?: number | null
  V_ratio?: number | null
  V_pct?: [number, number] | null
  V_rp?: number | null
  V_rp_range?: [number, number] | null
  V_beyond?: boolean | null
  V_rank?: number | null
  V_guard?: boolean | null
}

export interface AnnualRec {
  y: number
  H: number | null
  lo: number | null
  hi: number | null
  complete?: boolean
  months?: number
  terra_only_months?: number
  rankable?: boolean
}

export interface Ratios {
  month: number[]
  lo: number[]
  hi: number[]
  pool: number
  B?: number[]
  A?: number[]
  raw_month?: number[]
  tau?: number
  low_n?: boolean[]
  low_n_threshold?: number
}

export interface LatestStats {
  y: number
  m: number
  mtd: boolean
  value: number | null
  lo: number | null
  hi: number | null
  median?: number
  ratio: number | null
  pct: [number, number] | null
  return_period: number | null
  beyond_record: boolean
  rank?: number
  rank_of?: number
  guard: boolean | null
  provisional?: boolean
  days?: number
  baseline_kind?: string
}

export interface Validation {
  method: string
  method_reason: string
  low_activity: boolean
  loyo_err_pct: number
  loyo_bias_pct: number
  step_raw_pct: number
  step_harm_pct: number
  step_modis_pct: number
  step_harm_ci: [number, number]
  step_p: number
  step_p_raw: number
  shape_r: number
  drift: { y: number; ratio: number | null }[]
  drift_post2020_rel_pct: number | null
  v1_pass: boolean
  v3_pass: boolean
  v9: Record<string, unknown>
}

export interface Quality {
  rows_read?: number
  cell_days?: Record<string, number>
  rows_unified: number
  rows_kept: number
  dropped_low_conf: number
  dropped_type: number
  dropped_known_static: number
  dropped_persistent: number
  masked_static_total: number
  known_static_cells: number
  persistent_cells: number
  nrt_rows: number
  nrt_removed_known_static: number
  global_outages: Record<string, [string, string, number][]> | null
  regional_gaps: Record<string, [string, string, number][]> | null
  insufficient_months: string[] | null
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
  method_reason?: string | null
  months: MonthRec[]
  k: Ratios
  q: Ratios | null
  kprime: Ratios | null
  validation: Validation | null
  climatology: { median: number[]; p10: number[]; p90: number[]; n: number[] } | null
  latest: LatestStats | null
  latest_complete: LatestStats | null
  annual: AnnualRec[]
  similar_years: number[]
  similar_detail?: { months: string; years: { y: number; r: number }[] } | null
  daily: Record<string, { modis?: number[]; viirs?: number[] }>
  quality: Quality | null
  caveats?: { overpass_timing: string | null; terra_only: string }
  geo?: {
    anchor: [number, number]
    view_bbox: [number, number, number, number]
    inset: { name: string; bbox: [number, number, number, number]; detections: number } | null
    view_area_km2: number
    small: boolean
    points_years?: number[]
  }
  hotspot_months: string[]
  hex_years: number[]
  harmonized: boolean
  detail?: DetailBlock | null
  /** set on the view doc by toDetail() */
  mode?: DataMode
}

export type DataMode = 'longterm' | 'detail'

export interface DetailLatest {
  y: number; m: number; mtd: boolean; value: number | null; lo: number | null; hi: number | null; median?: number
  ratio: number | null; pct: [number, number] | null; rp: number | null; rp_range?: [number, number] | null; beyond: boolean
  guard: boolean | null; rank?: number | null; rank_of?: number; provisional?: boolean; days?: number; baseline_kind?: string
}

export interface DetailBlock {
  baseline: [number, number]
  unit: string
  first: string
  climatology: { median: number[]; p10: number[]; p90: number[]; n: number[] }
  latest: DetailLatest
  latest_complete: DetailLatest
  annual: AnnualRec[]
  similar_years: number[]
  similar_detail?: { months: string; years: { y: number; r: number }[] } | null
  adds: { ratio: number | null; years: [number, number]; native_total: number; modis_eq_total: number; months: number }
}

export interface MetaDoc {
  version: string
  data_end: string
  generated: string
  citation: string
  regions: {
    id: string
    name: string
    bbox: number[]
    months: number
    method: string | null
    harmonized: boolean
    first: string
    last: string
    latest: LatestStats | null
    latest_complete: LatestStats | null
  }[]
}

/** Which series the calendar shows. */
export type ViewMode = 'raw' | 'harmonized'
export type CalMode = 'counts' | 'anomaly'
