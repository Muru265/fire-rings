// P1.8 Paper + slides: every {{placeholder}} in web/content/*.md is filled from the published JSON at view time.
// A placeholder with no value renders as a visible "⟨missing: key⟩" (never a made-up number); claims_check fails on it.
import { useEffect, useState } from 'react'
import { fetchJson } from './api'
import { fmt1, fmtInt, pctDiff2sig } from './format'
import { provisionalSpan } from './provisional'
import type { RegionDoc } from './types'
import type { WatchDoc } from '../../api/_lib/watch'

export const REGION_IDS = ['punjab', 'madagascar', 'se_australia', 'mauritius', 'nt_savanna', 'ne_india', 'tanzania', 'sudan', 'mato_grosso'] as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ContentData { values: Record<string, string>; docs: Record<string, RegionDoc>; watch: WatchDoc | null; reunion: boolean; val: Record<string, any> | null }

const n1 = (v: number | null | undefined) => (v == null ? undefined : fmt1(v))
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
  set('provisional', provisionalSpan(docs[0]?.months ?? []) ?? undefined)
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
  if (parity) { set('parity.api', n0(parity.api)); set('parity.record', n0(parity.record)); set('parity.diff', pctDiff2sig(parity.api, parity.record)) }
  const projs = await Promise.all(REGION_IDS.map((id) => fetchJson<ProjFile>(`api/projection/${id}.json`).catch(() => null)))
  let wins = 0, cells = 0
  for (const p of projs) for (const m of p?.months ?? []) for (const c of m.checkpoints) { cells++; if (c.better === 'projection') wins++ }
  if (cells) { set('proj.wins', String(wins)); set('proj.cells', String(cells)) }
  // #87 slide 3: Punjab detection-time evidence + the three independent reports cited on Proof
  const timing = await fetchJson<{ checks: Record<string, { aqua_rel_2022_2026: number }>; sources: { name: string; url: string }[] }>('dataset/punjab_timing_v1.json').catch(() => null)
  const pt = timing?.checks['punjab|Oct–Nov (rice residue)']
  set('timing.aqua_rel', pt ? pt.aqua_rel_2022_2026.toFixed(1) : undefined)
  set('timing.sources', timing?.sources?.length ? timing.sources.map((x) => x.name.split(' — ')[0]).join('; ') : undefined)
  set('timing.n_sources', timing?.sources?.length ? String(timing.sources.length) : undefined)
  // #87 slide 2: the companion insurance app's result, computed the same way from the open API (Punjab, 90th percentile)
  const ser = await fetchJson<{ baseline: [number, number]; months: (number | string | null)[][] }>('api/series/punjab.json').catch(() => null)
  if (ser) {
    const P = 90, q = (vs: number[], p: number) => { const s = [...vs].sort((a, b) => a - b); const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo) }
    const rows = ser.months as [number, number, number | null, number | null, number | null, number | null][]
    const thr = (col: 2 | 5) => Array.from({ length: 12 }, (_, m) => q(rows.filter((x) => x[1] === m + 1 && x[0] >= ser.baseline[0] && x[0] <= ser.baseline[1] && x[col] != null).map((x) => x[col]!), P / 100))
    const tH = thr(2), tR = thr(5)
    const cells = rows.filter((x) => x[0] >= 2003 && x[0] <= 2025).map((x) => ({ y: x[0], harm: x[2] != null && x[2] > tH[x[1] - 1], raw: x[5] != null && x[5] > tR[x[1] - 1] }))
    set('ins.p', String(P)); set('ins.harm', String(cells.filter((c) => c.harm).length)); set('ins.raw', String(cells.filter((c) => c.raw).length))
    set('ins.raw_only', String(cells.filter((c) => c.raw && !c.harm && c.y >= 2012).length))
  }
  // Round 5B: prediction model (api/model_card.json) + model history + Tanzania study check (regions/tanzania.json)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mc = await fetchJson<any>('api/model_card.json').catch(() => null)
  if (mc) {
    const P = mc.evaluation.pooled, ab = mc.ablation, I = mc.evaluation.intervals
    const pc = (x: number) => String(Math.round(x)), f2 = (x: number) => x.toFixed(2)
    set('model.cap10', pc(P.model.capture10)); set('model.cap20', pc(P.model.capture20))
    set('model.clim_cap10', pc(P.climatology.capture10)); set('model.pers_cap10', pc(P.persistence.capture10))
    set('model.pr_auc', f2(P.model.pr_auc)); set('model.clim_pr_auc', f2(P.climatology.pr_auc)); set('model.pers_pr_auc', f2(P.persistence.pr_auc))
    set('model.roc_auc', f2(P.model.roc_auc)); set('model.clim_roc_auc', f2(P.climatology.roc_auc))
    set('model.f1', P.model.f1 != null ? f2(P.model.f1) : undefined)
    set('model.precision', P.model.precision != null ? f2(P.model.precision) : undefined); set('model.recall', P.model.recall != null ? f2(P.model.recall) : undefined)
    set('model.cap10_ci', I?.model?.capture10 ? `${pc(I.model.capture10[0])}–${pc(I.model.capture10[1])}` : undefined)
    set('model.raw_pr_auc', f2(ab.raw.pr_auc)); set('model.raw_cap10', pc(ab.raw.capture10))
    const d = ab.difference_harmonized_minus_raw
    const sg = (x: number, dd: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(dd)}`
    set('model.abl_pr', sg(d.pr_auc, 2)); set('model.abl_cap', sg(d.capture10, 1))
    set('model.gate', mc.gate.passed ? 'passed' : 'not passed')
    set('model.version', String(mc.version)); set('model.trained', new Date(mc.trained_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
    set('model.chosen', mc.model_selection.chosen.startsWith('hgb') ? 'gradient boosting' : 'logistic regression')
    const lo = Object.values(mc.leave_one_region_out as Record<string, { model?: { pr_auc: number }; climatology?: { pr_auc: number } }>).filter((x) => x.model && x.climatology)
    set('model.loro_wins', String(lo.filter((x) => x.model!.pr_auc > x.climatology!.pr_auc).length)); set('model.loro_n', String(lo.length))
  }
  const sc = (byId.tanzania as RegionDoc & { study_check?: { harmonized: { change_pct: number }; modis_only: { change_pct: number }; raw_step_2012_pct: number; years_a: number[]; years_b: number[] } } | undefined)?.study_check
  if (sc) {
    const sp = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x) >= 10 ? Math.round(Math.abs(x)) : Math.abs(x).toFixed(1)}%`
    set('tz.harm', sp(sc.harmonized.change_pct)); set('tz.modis', sp(sc.modis_only.change_pct)); set('tz.raw', sp(sc.raw_step_2012_pct))
    set('tz.years', `${sc.years_a[0]}–${sc.years_a[1]} vs ${sc.years_b[0]}–${sc.years_b[1]}`)
  }
  const val = await fetchJson<{ regions: Record<string, unknown> }>('dataset/validation_v1.json').then((x) => x.regions).catch(() => null)
  const reu = await fetchJson<ReunionFile>('api/reunion.json').catch(() => null)
  if (reu) {
    const s = reu.summary
    set('reunion.n', String(reu.eruptions.length))
    set('reunion.modis_detected', String(s.modis.detected)); set('reunion.modis_n', String(s.modis.eruptions_in_period))
    set('reunion.viirs_detected', String(s.viirs.detected)); set('reunion.viirs_n', String(s.viirs.eruptions_in_period))
    set('reunion.lag_modis', s.modis.median_lag_days != null ? String(s.modis.median_lag_days) : undefined)
    set('reunion.lag_viirs', s.viirs.median_lag_days != null ? String(s.viirs.median_lag_days) : undefined)
    const [lm, lv] = [s.modis.median_lag_days, s.viirs.median_lag_days]
    set('reunion.lag_text', lm == null || lv == null ? undefined : lm === lv ? `a median first-detection lag of ${lm} days for both sensors`
      : `a median first-detection lag of ${lm} and ${lv} days (MODIS, VIIRS)`)
    set('reunion.pre_modis', `${s.modis.pre30_eruptions_with_detections} of ${s.modis.pre30_eruptions_tested}`)
    set('reunion.pre_viirs', `${s.viirs.pre30_eruptions_with_detections} of ${s.viirs.pre30_eruptions_tested}`)
    set('reunion.dd_modis', n0(s.both.detection_days_modis)); set('reunion.dd_viirs', n0(s.both.detection_days_viirs)); set('reunion.both', String(s.both.eruptions))
  }
  return { values: v, docs: byId, watch, reunion: !!reu, val }
}

export function useContent(): ContentData | null | 'error' {
  const [c, setC] = useState<ContentData | null | 'error'>(null)
  useEffect(() => { loadContent().then(setC).catch(() => setC('error')) }, [])
  return c
}

/** Replace {{key}} with its value, or a visible missing marker. */
export const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => values[k] ?? `⟨missing: ${k}⟩`)
