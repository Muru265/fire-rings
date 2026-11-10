// Ask Fire Rings — tools. Every tool reads the published region JSON (web/public/data/v1) and returns compact,
// pre-rounded numbers plus the flags and full-sentence caveats that apply (QA #56, #60). The model may only state
// numbers that appear in these results (checked in _lib/core.ts). GET /api/tools lists the tool schemas.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Loader = (path: string) => Promise<any>
export type Mode = 'longterm' | 'detail'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const r0 = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const r1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10)
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }

/** The only caveat sentences the analyst may use (full sentences, never a bare word). */
export const CAVEATS = {
  units: 'All numbers are MODIS-equivalent fire-days: one ~36 km² tile with at least one fire on one day, on the old satellite’s scale.',
  units_detail: 'High-detail numbers use the new satellites’ full 375 m view and are not comparable with years before 2012.',
  provisional: 'This month is provisional: it uses NASA’s quick-look data, which can change when the final data arrive about five months later.',
  mtd: 'This month is not over yet, so it is compared with the same days in past years.',
  low_activity: (name: string) => `${name} has very little fire, so small changes look big and comparisons and rankings are uncertain.`,
  terra_only: 'Months before July 2002 come from one satellite only (Terra), so they are less certain and are not ranked.',
  uncertain: 'This value is uncertain: its 90% range is wider than half the value.',
  insufficient: 'There was not enough satellite coverage this month to give a value.',
  incomplete_year: 'This year is not complete, so its total is not comparable with full years.',
} as const

const pctText = (p: [number, number]) => p[1] === 0 ? 'below every year in the 2003–2022 baseline'
  : p[0] >= 95 ? 'above every year in the 2003–2022 baseline'
  : p[0] === p[1] ? `${ord(p[0])} percentile` : `${ord(p[0])}–${ord(p[1])} percentile`

export const REGION_ALIASES: Record<string, string[]> = {
  punjab: ['punjab', 'haryana', 'punjab-haryana', 'punjab–haryana'],
  madagascar: ['madagascar', 'malagasy'],
  se_australia: ['se australia', 'south-east australia', 'southeast australia', 'south east australia', 'new south wales', 'nsw', 'victoria', 'black summer'],
  mauritius: ['mauritius', 'rodrigues'],
}

/** Region named in a question (QA #61), or null. */
export function regionInQuestion(q: string): string | null {
  const t = ` ${q.toLowerCase()} `
  const hits = Object.entries(REGION_ALIASES).filter(([, al]) => al.some((a) => new RegExp(`[^a-z]${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(t)))
  return hits.length === 1 ? hits[0][0] : null
}

const MODE_PARAM = { type: 'string', enum: ['longterm', 'detail'], description: 'longterm (default): MODIS-equivalent 2001–now; detail: native VIIRS 2012–now' }

export const TOOL_DECLARATIONS = [
  { name: 'list_regions', description: 'List the regions available in Fire Rings with their record period and latest month.', parameters: { type: 'object', properties: {} } },
  {
    name: 'get_month',
    description: 'Fire-days for ONE month in a region, compared with the same month in the baseline. Omit year and month for the latest month (may be month-to-date).',
    parameters: { type: 'object', properties: {
      region: { type: 'string', description: 'region id: punjab, madagascar, se_australia, mauritius' },
      year: { type: 'integer' }, month: { type: 'integer', description: '1–12' }, mode: MODE_PARAM,
    }, required: ['region'] },
  },
  { name: 'get_year_total', description: 'Total fire-days for ONE calendar year in a region, with 90% range, rank among complete years and flags.',
    parameters: { type: 'object', properties: { region: { type: 'string' }, year: { type: 'integer' }, mode: MODE_PARAM }, required: ['region', 'year'] } },
  { name: 'get_typical', description: 'What is typical for a calendar month in a region: baseline median and normal range (P10–P90).',
    parameters: { type: 'object', properties: { region: { type: 'string' }, month: { type: 'integer', description: '1–12' }, mode: MODE_PARAM }, required: ['region', 'month'] } },
  { name: 'compare_years', description: 'Compare two years in a region (whole year, or one month if month is given): both totals and how many times larger one is.',
    parameters: { type: 'object', properties: { region: { type: 'string' }, year1: { type: 'integer' }, year2: { type: 'integer' }, month: { type: 'integer' }, mode: MODE_PARAM }, required: ['region', 'year1', 'year2'] } },
  { name: 'get_season', description: 'Typical seasonal cycle of a region (baseline median and P10–P90 per month), peak and quietest months, and the current year so far vs typical.',
    parameters: { type: 'object', properties: { region: { type: 'string' }, mode: MODE_PARAM }, required: ['region'] } },
  {
    name: 'get_rankings',
    description: 'Rank years by annual fire-days (by="year"), or rank all years for one calendar month (by="month", month=1–12). Use for worst/biggest/lowest questions.',
    parameters: { type: 'object', properties: { region: { type: 'string' }, by: { type: 'string', enum: ['year', 'month'] }, month: { type: 'integer' }, mode: MODE_PARAM }, required: ['region', 'by'] },
  },
  { name: 'get_similar_years', description: 'Past years whose year-to-date monthly pattern looks most like the current year (analogues, not forecasts).',
    parameters: { type: 'object', properties: { region: { type: 'string' } }, required: ['region'] } },
  { name: 'get_quality', description: 'How reliable the record is for a region: validation results, calibration method, uncertainty, provisional months, outages and masking.',
    parameters: { type: 'object', properties: { region: { type: 'string' } }, required: ['region'] } },
]

async function region(load: Loader, id: string) {
  const meta = await load('meta.json')
  const ids = meta.regions.map((r: any) => r.id)
  if (!ids.includes(id)) return { error: `unknown region "${id}"`, available_regions: ids }
  return load(`regions/${id}.json`)
}

/** Detail mode reads the native-VIIRS fields exported by the pipeline (Phase 5); falls back with a clear note. */
function modeView(doc: any, mode: Mode) {
  const detail = mode === 'detail' && !!doc.detail
  return {
    detail,
    val: (r: any) => (detail ? r.V : r.H), lo: (r: any) => (detail ? r.V_lo ?? null : r.lo), hi: (r: any) => (detail ? r.V_hi ?? null : r.hi),
    ratio: (r: any) => (detail ? r.V_ratio : r.ratio), pct: (r: any) => (detail ? r.V_pct : r.pct), guard: (r: any) => (detail ? r.V_guard : r.guard),
    clim: detail ? doc.detail.climatology : doc.climatology, annual: detail ? doc.detail.annual : doc.annual,
    baseline: detail ? doc.detail.baseline : doc.baseline,
    unit: detail ? 'VIIRS fire-days (native 375 m, S-NPP-equivalent)' : 'MODIS-equivalent fire-days',
    note: mode === 'detail' && !doc.detail ? 'High-detail data is not published for this region; Long-term values are shown.' : undefined,
  }
}

function caveatsFor(doc: any, rec: any | null, mv: ReturnType<typeof modeView>, extra: string[] = []): { flags: string[]; caveats: string[] } {
  const flags: string[] = [...(rec?.flags ?? [])]
  const cav: string[] = []
  const low = !!doc.validation?.low_activity
  if (low) { flags.push('low_activity'); cav.push(CAVEATS.low_activity(doc.name)) }
  if (rec?.flags?.includes('provisional')) cav.push(CAVEATS.provisional)
  if (rec?.flags?.includes('mtd')) cav.push(CAVEATS.mtd)
  if (rec?.flags?.includes('terra_only') && !mv.detail) cav.push(CAVEATS.terra_only)
  if (rec?.flags?.includes('overpass_timing') && doc.caveats?.overpass_timing) cav.push(doc.caveats.overpass_timing)
  if (rec?.flags?.includes('uncertain')) cav.push(CAVEATS.uncertain)
  if (rec?.flags?.includes('insufficient')) cav.push(CAVEATS.insufficient)
  cav.push(...extra)
  cav.push(mv.detail ? CAVEATS.units_detail : CAVEATS.units)
  return { flags: [...new Set(flags)], caveats: [...new Set(cav)] }
}

function monthView(doc: any, rec: any, mv: ReturnType<typeof modeView>) {
  const lt = doc.latest
  const mtd = rec.flags.includes('mtd') && lt && lt.y === rec.y && lt.m === rec.m && !mv.detail
  const median = mtd ? lt.median : mv.clim?.median?.[rec.m - 1]
  const guard = !!mv.guard(rec)
  const pct = mv.pct(rec)
  return {
    region: doc.name, month: `${MONTHS[rec.m - 1]} ${rec.y}`, unit: mv.unit, ...(mv.note ? { note: mv.note } : {}),
    month_to_date: mtd ? `days 1–${lt.days} only, compared with the same days of baseline years` : false,
    fire_days: r0(mv.val(rec)), range_90: mv.lo(rec) != null ? [r0(mv.lo(rec)), r0(mv.hi(rec))] : null,
    typical_fire_days: r0(median), baseline: `${mv.baseline[0]}–${mv.baseline[1]}`,
    ratio_to_typical: guard ? null : r1(mv.ratio(rec)),
    percentile: guard || !pct ? null : pctText(pct),
    return_period_years: guard || rec.rp == null || mv.detail ? null : r0(rec.rp),
    beyond_baseline_record: !!rec.beyond && !mv.detail,
    rank_among_years_for_this_month: mv.detail ? null : rec.rank ?? null,
    too_little_fire_to_judge: guard,
    raw_hotspots: { modis: rec.hot_modis, viirs: rec.y >= 2012 ? rec.hot_viirs : null },
    ...caveatsFor(doc, rec, mv),
  }
}

function yearRec(mv: ReturnType<typeof modeView>, y: number) {
  return (mv.annual ?? []).find((a: any) => a.y === y)
}

export async function runTool(load: Loader, name: string, args: any): Promise<any> {
  const mode: Mode = args?.mode === 'detail' ? 'detail' : 'longterm'
  switch (name) {
    case 'list_regions': {
      const meta = await load('meta.json')
      return { regions: meta.regions.map((r: any) => ({ id: r.id, name: r.name, record: `${r.first} to ${r.last}`, data_through: meta.data_end,
        latest_month: r.latest ? `${MONTHS[r.latest.m - 1]} ${r.latest.y}${r.latest.mtd ? ' (month to date)' : ''}` : null })) }
    }
    case 'get_month': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const mv = modeView(doc, mode)
      const rec = args.year && args.month ? doc.months.find((x: any) => x.y === args.year && x.m === args.month) : doc.months[doc.months.length - 1]
      if (!rec) return { error: `no data for ${args.year}-${args.month}`, record: `${doc.months[0].y} to ${doc.months.at(-1).y}` }
      if (mv.val(rec) == null) return { region: doc.name, month: `${MONTHS[rec.m - 1]} ${rec.y}`, error: mv.detail && rec.y < 2012 ? 'High-detail data starts in 2012.' : CAVEATS.insufficient }
      const out: any = monthView(doc, rec, mv)
      if (!args.year && doc.latest_complete) {
        const lc = doc.months.find((x: any) => x.y === doc.latest_complete.y && x.m === doc.latest_complete.m)
        if (lc && lc !== rec) out.last_complete_month = monthView(doc, lc, mv)
      }
      return out
    }
    case 'get_year_total': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const mv = modeView(doc, mode)
      const a = yearRec(mv, args.year)
      if (!a || a.H == null) return { region: doc.name, year: args.year, error: a ? CAVEATS.insufficient : `no data for ${args.year}`, ...caveatsFor(doc, null, mv) }
      const ranked = (mv.annual ?? []).filter((x: any) => x.complete && x.rankable !== false && x.H != null).sort((p: any, q: any) => q.H - p.H)
      const rank = ranked.findIndex((x: any) => x.y === a.y)
      const extra: string[] = []
      if (a.terra_only_months && !mv.detail) extra.push(CAVEATS.terra_only)
      if (!a.complete) extra.push(CAVEATS.incomplete_year)
      if (doc.caveats?.overpass_timing && a.y >= 2022) extra.push(doc.caveats.overpass_timing)
      return { region: doc.name, year: a.y, unit: mv.unit, ...(mv.note ? { note: mv.note } : {}), fire_days: r0(a.H),
        range_90: a.lo != null ? [r0(a.lo), r0(a.hi)] : null, complete_year: !!a.complete,
        rank_among_complete_years: rank >= 0 ? rank + 1 : null, complete_years_ranked: ranked.length,
        ...caveatsFor(doc, null, mv, extra) }
    }
    case 'get_typical': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const mv = modeView(doc, mode)
      const i = (args.month ?? 0) - 1
      if (!(i >= 0 && i < 12) || !mv.clim) return { error: 'month must be 1–12' }
      return { region: doc.name, month: MONTHS[i], unit: mv.unit, baseline: `${mv.baseline[0]}–${mv.baseline[1]}`,
        typical_fire_days_median: r0(mv.clim.median[i]), normal_range_p10_p90: [r0(mv.clim.p10[i]), r0(mv.clim.p90[i])],
        note: '8 of 10 baseline years fall inside the normal range.', ...caveatsFor(doc, null, mv) }
    }
    case 'compare_years': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const mv = modeView(doc, mode)
      const pick = (y: number) => {
        if (args.month) { const r = doc.months.find((x: any) => x.y === y && x.m === args.month); return r ? { v: mv.val(r), rec: r } : null }
        const a = yearRec(mv, y); return a ? { v: a.H, rec: null, a } : null
      }
      const p1 = pick(args.year1), p2 = pick(args.year2)
      if (!p1 || !p2 || p1.v == null || p2.v == null) return { error: 'one of the years has no value', region: doc.name }
      const extra: string[] = []
      for (const p of [p1, p2]) {
        if ((p as any).a?.terra_only_months || p.rec?.flags?.includes('terra_only')) extra.push(CAVEATS.terra_only)
        if ((p as any).a && !(p as any).a.complete) extra.push(CAVEATS.incomplete_year)
        if (p.rec?.flags?.includes('provisional')) extra.push(CAVEATS.provisional)
      }
      if (doc.caveats?.overpass_timing && Math.max(args.year1, args.year2) >= 2022 && (!args.month || args.month >= 10)) extra.push(doc.caveats.overpass_timing)
      const what = args.month ? MONTHS[args.month - 1] : 'whole year'
      return { region: doc.name, compared: what, unit: mv.unit,
        [`fire_days_${args.year1}`]: r0(p1.v), [`fire_days_${args.year2}`]: r0(p2.v),
        times_larger: p2.v > 0 ? `${args.year1} is ${r1(p1.v / p2.v)}× ${args.year2}` : null, ...caveatsFor(doc, null, mv, extra) }
    }
    case 'get_season': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const mv = modeView(doc, mode)
      const c = mv.clim
      const med = c.median as number[]
      const peak = med.indexOf(Math.max(...med))
      const low = med.indexOf(Math.min(...med))
      const ly = doc.months.at(-1).y
      const cur = doc.months.filter((x: any) => x.y === ly && mv.val(x) != null).map((x: any) => ({
        month: MONTHS[x.m - 1], fire_days: r0(mv.val(x)), typical: r0(med[x.m - 1]), month_to_date: x.flags.includes('mtd') }))
      return { region: doc.name, unit: mv.unit, baseline: `${mv.baseline[0]}–${mv.baseline[1]}`,
        typical_by_month: MONTHS.map((mn, i) => ({ month: mn, median: r0(med[i]), p10: r0(c.p10[i]), p90: r0(c.p90[i]) })),
        peak_month: MONTHS[peak], peak_median: r0(med[peak]), quietest_month: MONTHS[low], quietest_median: r0(med[low]),
        current_year: ly, current_year_so_far: cur, ...caveatsFor(doc, doc.months.at(-1), mv) }
    }
    case 'get_rankings': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const mv = modeView(doc, mode)
      if (args.by === 'month' && args.month) {
        const rows = doc.months.filter((x: any) => x.m === args.month && mv.val(x) != null && !x.flags.includes('mtd') && (mv.detail || x.src !== 'T'))
          .sort((a: any, b: any) => mv.val(b) - mv.val(a))
        const extra: string[] = [CAVEATS.terra_only]
        if (doc.caveats?.overpass_timing && (args.month === 10 || args.month === 11)) extra.push(doc.caveats.overpass_timing)
        return { region: doc.name, month: MONTHS[args.month - 1], unit: mv.unit, years_ranked: rows.length,
          highest: rows.slice(0, 5).map((x: any, i: number) => ({ rank: i + 1, year: x.y, fire_days: r0(mv.val(x)), provisional: x.flags.includes('provisional') })),
          lowest: rows.slice(-3).reverse().map((x: any, i: number) => ({ rank: rows.length - i, year: x.y, fire_days: r0(mv.val(x)) })),
          ...caveatsFor(doc, null, mv, extra) }
      }
      const yrs = (mv.annual ?? []).filter((a: any) => a.complete && a.rankable !== false && a.H != null).sort((a: any, b: any) => b.H - a.H)
      const extra: string[] = mv.detail ? [] : [CAVEATS.terra_only]
      if (doc.caveats?.overpass_timing) extra.push(`From 2022: ${doc.caveats.overpass_timing}`)
      return { region: doc.name, unit: mv.unit, complete_years_ranked: yrs.length, note: 'complete calendar years only; the current year is excluded',
        highest: yrs.slice(0, 5).map((a: any, i: number) => ({ rank: i + 1, year: a.y, fire_days: r0(a.H), range_90: a.lo != null ? [r0(a.lo), r0(a.hi)] : null })),
        lowest: yrs.slice(-3).reverse().map((a: any, i: number) => ({ rank: yrs.length - i, year: a.y, fire_days: r0(a.H) })),
        ...caveatsFor(doc, null, mv, extra) }
    }
    case 'get_similar_years': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const d = doc.similar_detail
      if (!d?.years?.length) return { region: doc.name, error: 'not enough complete months this year' }
      const upto = Number(String(d.months).split('–')[1])
      return { region: doc.name, current_year: doc.months.at(-1).y, compared_months: `January–${MONTHS[upto - 1]}`,
        similar_years: d.years.map((s: any) => ({ year: s.y, shape_similarity_percent: Math.round(s.r * 100) })),
        note: 'Same shape of season, not the same size; analogues, not a forecast.', ...caveatsFor(doc, null, modeView(doc, 'longterm')) }
    }
    case 'get_quality': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const v = doc.validation
      const q = doc.quality
      const k = doc.k
      return { region: doc.name, calibration_window: 'July 2012 – December 2019',
        method: doc.method === 'pooled' ? `one exchange rate for all months (${k?.pool}); it predicted better than monthly rates in our tests`
          : `monthly exchange rates shrunk toward the region-wide rate ${k?.pool}`,
        low_activity_region: v?.low_activity ?? null,
        out_of_sample_annual_error_pct: v?.loyo_err_pct, out_of_sample_bias_pct: v?.loyo_bias_pct,
        validation_v1_pass: v?.low_activity ? 'not judged (too little fire)' : v?.v1_pass,
        step_at_2012_raw_pct: v?.step_raw_pct, step_at_2012_harmonized_pct: v?.step_harm_pct, step_at_2012_modis_only_pct: v?.step_modis_pct,
        validation_v3_pass: v?.low_activity ? 'not judged (too little fire)' : v?.v3_pass,
        uncertain_months_in_record: doc.months.filter((x: any) => x.flags.includes('uncertain')).length,
        provisional_months: doc.months.filter((x: any) => x.flags.includes('provisional')).map((x: any) => `${MONTHS[x.m - 1]} ${x.y}`),
        static_source_detections_removed: q?.masked_static_total, data_through: doc.data_end,
        famous_seasons: v?.v9 ? {
          season_definition: 'July–June', seasons_ranked: v.v9.n_seasons, top3_seasons: v.v9.top3_harmonized,
          ...(v.v9.known_event ? { documented_event: v.v9.known_event.event, documented_event_rank: v.v9.black_summer_rank_harmonized } : {}),
          ...(v.v9.octnov_top3_harmonized ? { oct_nov_crop_burning_top3_years: v.v9.octnov_top3_harmonized } : {}),
        } : null,
        ...(doc.caveats?.overpass_timing ? { detection_time_caveat: {
          applies_to: 'October–November from 2022', text: doc.caveats.overpass_timing,
          evidence: await load('dataset/punjab_timing_v1.json').then((t: any) => {
            const p = t.checks['punjab|Oct–Nov (rice residue)']
            return { aqua_to_viirs_ratio_2022_2026_vs_2013_2019: p.aqua_rel_2022_2026, same_vs_noaa20: p.aqua_n20_rel_2022_2026,
              note: 'Aqua passes later in the afternoon since Dec 2021; numbers are not adjusted' }
          }).catch(() => null) } } : {}),
        ...caveatsFor(doc, null, modeView(doc, 'longterm'), [CAVEATS.terra_only]) }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

export function GET() {
  return Response.json({ tools: TOOL_DECLARATIONS })
}
