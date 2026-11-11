// P1.8 Paper + slides: every {{placeholder}} in web/content/*.md is filled from the published JSON at view time.
// A placeholder with no value renders as a visible "⟨missing: key⟩" (never a made-up number); claims_check fails on it.
import { useEffect, useState } from 'react'
import { fetchJson } from './api'
import { fmtInt } from './format'
import type { RegionDoc } from './types'
import type { WatchDoc } from '../../api/_lib/watch'

export const REGION_IDS = ['punjab', 'madagascar', 'se_australia', 'mauritius'] as const
export interface ContentData { values: Record<string, string>; docs: Record<string, RegionDoc>; watch: WatchDoc | null; reunion: boolean }

const n1 = (v: number | null | undefined) => (v == null ? undefined : (Math.round(v * 10) / 10).toLocaleString('en-GB'))
const n0 = (v: number | null | undefined) => (v == null ? undefined : fmtInt(v))

interface ProjFile { months: { checkpoints: { better: string }[] }[] }
interface ReunionFile { summary: Record<'modis' | 'viirs', { eruptions_in_period: number; detected: number; median_lag_days: number | null; pre30_eruptions_tested: number; pre30_eruptions_with_detections: number }> & { both: { eruptions: number; detection_days_modis: number; detection_days_viirs: number } }; eruptions: unknown[] }

export async function loadContent(): Promise<ContentData> {
  const v: Record<string, string> = {}
  const set = (k: string, x: string | undefined) => { if (x != null) v[k] = x }
  const [meta, watch, parity, ...docs] = await Promise.all([
    fetchJson<{ data_end: string; regions: { id: string; months: number }[] }>('meta.json'),
    fetchJson<WatchDoc>('watch.json').catch(() => null),
    fetchJson<{ api: number; record: number; diff_pct: number; start: string; end: string }>('api/hotspots_parity.json').catch(() => null),
    ...REGION_IDS.map((id) => fetchJson<RegionDoc>(`regions/${id}.json`)),
  ])
  const byId = Object.fromEntries(docs.map((d) => [d.id, d])) as Record<string, RegionDoc>
  set('data_end', meta.data_end)
  set('n_regions', String(meta.regions.length))
  set('region_months', n0(meta.regions.reduce((a, r) => a + r.months, 0)))
  let read = 0, kept = 0
  for (const d of docs) {
    const r = d.id, va = d.validation
    set(`${r}.name`, d.name)
    set(`${r}.v1`, n1(va?.loyo_err_pct)); set(`${r}.v1_bias`, n1(va?.loyo_bias_pct))
    set(`${r}.step_raw`, n0(va?.step_raw_pct)); set(`${r}.step_harm`, n1(va?.step_harm_pct)); set(`${r}.step_modis`, n1(va?.step_modis_pct))
    set(`${r}.shape_r`, va?.shape_r?.toFixed(2)); set(`${r}.drift`, n1(va?.drift_post2020_rel_pct))
    set(`${r}.method`, va?.method === 'pooled' ? 'a single region-wide ratio' : 'monthly ratios')
    set(`${r}.rows_read`, n0(d.quality?.rows_read)); set(`${r}.rows_kept`, n0(d.quality?.rows_kept))
    set(`${r}.adds`, d.detail?.adds.ratio != null ? `${d.detail.adds.ratio.toFixed(1)}×` : undefined)
    set(`${r}.k_pool`, d.k?.pool?.toFixed(2))
    read += d.quality?.rows_read ?? 0; kept += d.quality?.rows_kept ?? 0
  }
  set('rows_read', n0(read)); set('rows_kept', n0(kept))
  const v9 = byId.se_australia?.validation?.v9 as { black_summer_rank_harmonized?: number; black_summer_rank_raw?: number; n_seasons?: number; known_event?: { source?: { url?: string; name?: string } } } | undefined
  set('bs.rank', v9?.black_summer_rank_harmonized != null ? String(v9.black_summer_rank_harmonized) : undefined)
  set('bs.rank_raw', v9?.black_summer_rank_raw != null ? String(v9.black_summer_rank_raw) : undefined)
  set('bs.n', v9?.n_seasons != null ? String(v9.n_seasons) : undefined)
  set('bs.source_url', v9?.known_event?.source?.url); set('bs.source_name', v9?.known_event?.source?.name)
  if (watch) {
    const t = watch.backtest.totals
    set('watch.raw_alerts', String(t.raw_alerts)); set('watch.harm_alerts', String(t.harmonized_alerts)); set('watch.raw_only', String(t.raw_only_alerts))
    set('watch.raw_lows', String(t.raw_lows)); set('watch.harm_lows', String(t.harmonized_lows))
    set('watch.period', `${watch.backtest.period[0].slice(0, 4)}–${watch.backtest.period[1].slice(0, 4)}`)
  }
  if (parity) { set('parity.api', n0(parity.api)); set('parity.record', n0(parity.record)); set('parity.diff', n1(parity.diff_pct)) }
  const projs = await Promise.all(REGION_IDS.map((id) => fetchJson<ProjFile>(`api/projection/${id}.json`).catch(() => null)))
  let wins = 0, cells = 0
  for (const p of projs) for (const m of p?.months ?? []) for (const c of m.checkpoints) { cells++; if (c.better === 'projection') wins++ }
  if (cells) { set('proj.wins', String(wins)); set('proj.cells', String(cells)) }
  const reu = await fetchJson<ReunionFile>('api/reunion.json').catch(() => null)
  if (reu) {
    const s = reu.summary
    set('reunion.n', String(reu.eruptions.length))
    set('reunion.modis_detected', String(s.modis.detected)); set('reunion.modis_n', String(s.modis.eruptions_in_period))
    set('reunion.viirs_detected', String(s.viirs.detected)); set('reunion.viirs_n', String(s.viirs.eruptions_in_period))
    set('reunion.lag_modis', s.modis.median_lag_days != null ? String(s.modis.median_lag_days) : undefined)
    set('reunion.lag_viirs', s.viirs.median_lag_days != null ? String(s.viirs.median_lag_days) : undefined)
    set('reunion.pre_modis', `${s.modis.pre30_eruptions_with_detections} of ${s.modis.pre30_eruptions_tested}`)
    set('reunion.pre_viirs', `${s.viirs.pre30_eruptions_with_detections} of ${s.viirs.pre30_eruptions_tested}`)
    set('reunion.dd_modis', n0(s.both.detection_days_modis)); set('reunion.dd_viirs', n0(s.both.detection_days_viirs)); set('reunion.both', String(s.both.eruptions))
  }
  return { values: v, docs: byId, watch, reunion: !!reu }
}

export function useContent(): ContentData | null | 'error' {
  const [c, setC] = useState<ContentData | null | 'error'>(null)
  useEffect(() => { loadContent().then(setC).catch(() => setC('error')) }, [])
  return c
}

/** Replace {{key}} with its value, or a visible missing marker. */
export const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => values[k] ?? `⟨missing: ${k}⟩`)
