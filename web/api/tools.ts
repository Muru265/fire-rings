// Ask Fire Rings — tools. Every tool reads the published region JSON (web/public/data/v1) and returns compact,
// pre-rounded numbers. The model may only state numbers that appear in these results (checked in _lib/core.ts).
// GET /api/tools lists the tool schemas.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Loader = (path: string) => Promise<any>

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const r0 = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const r1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10)
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }
/** Percentile range as words, so the model never writes "0th–0th". Baseline has 20 years → max Weibull pct is 95. */
function pctText(p: [number, number]): string {
  if (p[1] === 0) return 'below every year in the 2003–2022 baseline'
  if (p[0] >= 95) return 'above every year in the 2003–2022 baseline'
  return p[0] === p[1] ? `${ord(p[0])} percentile` : `${ord(p[0])}–${ord(p[1])} percentile`
}

export const TOOL_DECLARATIONS = [
  { name: 'list_regions', description: 'List the regions available in Fire Rings with their record period and latest month.', parameters: { type: 'object', properties: {} } },
  {
    name: 'get_month',
    description: 'Fire-days (MODIS-equivalent) for one month in a region, compared with the same month in the 2003–2022 baseline. Omit year and month for the latest month (may be month-to-date).',
    parameters: { type: 'object', properties: {
      region: { type: 'string', description: 'region id, e.g. punjab, madagascar, se_australia, mauritius' },
      year: { type: 'integer' }, month: { type: 'integer', description: '1–12' },
    }, required: ['region'] },
  },
  { name: 'get_season', description: 'Typical seasonal cycle of a region (baseline 2003–2022 median and P10–P90 per month), peak and quietest months, and the current year so far vs typical.',
    parameters: { type: 'object', properties: { region: { type: 'string' } }, required: ['region'] } },
  {
    name: 'get_rankings',
    description: 'Rank years by annual fire-days (by="year"), or rank all years for one calendar month (by="month", month=1–12).',
    parameters: { type: 'object', properties: { region: { type: 'string' }, by: { type: 'string', enum: ['year', 'month'] }, month: { type: 'integer' } }, required: ['region', 'by'] },
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

function monthView(doc: any, rec: any) {
  const lt = doc.latest
  const mtd = rec.flags.includes('mtd') && lt && lt.y === rec.y && lt.m === rec.m
  const median = mtd ? lt.median : doc.climatology?.median?.[rec.m - 1]
  return {
    region: doc.name, month: `${MONTHS[rec.m - 1]} ${rec.y}`,
    month_to_date: mtd ? `days 1–${lt.days} only, compared with the same days of baseline years` : false,
    fire_days: r0(rec.H), interval_90: rec.lo != null ? [r0(rec.lo), r0(rec.hi)] : null,
    typical_fire_days_baseline_median: r0(median),
    ratio_to_typical: rec.guard ? null : r1(rec.ratio),
    percentile: rec.guard || !rec.pct ? null : pctText(rec.pct),
    return_period_years: rec.guard || rec.rp == null ? null : r0(rec.rp),
    beyond_baseline_record: !!rec.beyond,
    rank_among_years_for_this_month: rec.rank ?? null,
    years_ranked: mtd ? lt.rank_of : doc.months.filter((x: any) => x.m === rec.m && x.H != null && !x.flags.includes('mtd')).length,
    low_activity_guard: !!rec.guard,
    flags: rec.flags,
    raw_hotspots: { modis: rec.hot_modis, viirs: rec.y >= 2012 ? rec.hot_viirs : null },
    source: { T: 'Terra MODIS scaled to Terra+Aqua', M: 'MODIS Terra+Aqua', V: 'VIIRS S-NPP calibrated to MODIS', V2: 'VIIRS NOAA-20 calibrated to MODIS' }[rec.src as string],
    units: 'fire-days = H3 hexagons (~36 km²) with ≥1 detection per day, MODIS-equivalent',
  }
}

export async function runTool(load: Loader, name: string, args: any): Promise<any> {
  switch (name) {
    case 'list_regions': {
      const meta = await load('meta.json')
      return { regions: meta.regions.map((r: any) => ({ id: r.id, name: r.name, record: `${r.first} to ${r.last}`, data_through: meta.data_end,
        latest_month: r.latest ? `${MONTHS[r.latest.m - 1]} ${r.latest.y}${r.latest.mtd ? ' (month to date)' : ''}` : null })) }
    }
    case 'get_month': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      let rec
      if (args.year && args.month) rec = doc.months.find((x: any) => x.y === args.year && x.m === args.month)
      else rec = doc.months[doc.months.length - 1]
      if (!rec) return { error: `no data for ${args.year}-${args.month}`, record: `${doc.months[0].y}-${doc.months[0].m} to ${doc.months.at(-1).y}-${doc.months.at(-1).m}` }
      if (rec.H == null) return { region: doc.name, month: `${MONTHS[rec.m - 1]} ${rec.y}`, error: 'no harmonized value (insufficient satellite coverage)' }
      const out: any = monthView(doc, rec)
      if (!args.year && doc.latest_complete) {
        const lc = doc.months.find((x: any) => x.y === doc.latest_complete.y && x.m === doc.latest_complete.m)
        if (lc && lc !== rec) out.last_complete_month = monthView(doc, lc)
      }
      return out
    }
    case 'get_season': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const c = doc.climatology
      const med = c.median as number[]
      const peak = med.indexOf(Math.max(...med))
      const low = med.indexOf(Math.min(...med))
      const ly = doc.months.at(-1).y
      const cur = doc.months.filter((x: any) => x.y === ly && x.H != null).map((x: any) => ({
        month: MONTHS[x.m - 1], fire_days: r0(x.H), typical: r0(med[x.m - 1]), month_to_date: x.flags.includes('mtd') }))
      return { region: doc.name, baseline: `${doc.baseline[0]}–${doc.baseline[1]}`,
        typical_by_month: MONTHS.map((mn, i) => ({ month: mn, median: r0(med[i]), p10: r0(c.p10[i]), p90: r0(c.p90[i]) })),
        peak_month: MONTHS[peak], peak_median: r0(med[peak]), quietest_month: MONTHS[low], quietest_median: r0(med[low]),
        current_year: ly, current_year_so_far: cur, units: 'fire-days (MODIS-equivalent)' }
    }
    case 'get_rankings': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      if (args.by === 'month' && args.month) {
        const rows = doc.months.filter((x: any) => x.m === args.month && x.H != null && !x.flags.includes('mtd'))
          .sort((a: any, b: any) => b.H - a.H)
        return { region: doc.name, month: MONTHS[args.month - 1], years_ranked: rows.length,
          highest: rows.slice(0, 5).map((x: any, i: number) => ({ rank: i + 1, year: x.y, fire_days: r0(x.H), interval_90: [r0(x.lo), r0(x.hi)], provisional: x.flags.includes('provisional') })),
          lowest: rows.slice(-3).reverse().map((x: any, i: number) => ({ rank: rows.length - i, year: x.y, fire_days: r0(x.H) })) }
      }
      const yrs = doc.annual.filter((a: any) => a.complete && a.H != null).sort((a: any, b: any) => b.H - a.H)
      return { region: doc.name, complete_years_ranked: yrs.length, note: 'complete calendar years only; the current year is excluded',
        highest: yrs.slice(0, 5).map((a: any, i: number) => ({ rank: i + 1, year: a.y, fire_days: r0(a.H), interval_90: [r0(a.lo), r0(a.hi)] })),
        lowest: yrs.slice(-3).reverse().map((a: any, i: number) => ({ rank: yrs.length - i, year: a.y, fire_days: r0(a.H) })),
        units: 'fire-days per year (MODIS-equivalent)' }
    }
    case 'get_similar_years': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const d = doc.similar_detail
      if (!d?.years?.length) return { region: doc.name, error: 'not enough complete months this year' }
      const upto = Number(String(d.months).split('–')[1])
      return { region: doc.name, current_year: doc.months.at(-1).y, compared_months: `January–${MONTHS[upto - 1]}`,
        similar_years: d.years.map((s: any) => ({ year: s.y, correlation: Math.round(s.r * 100) / 100 })),
        note: 'analogues by shape of the year so far; not a forecast' }
    }
    case 'get_quality': {
      const doc = await region(load, args.region)
      if (doc.error) return doc
      const v = doc.validation
      const q = doc.quality
      return { region: doc.name, calibration_window: 'July 2012 – December 2019',
        method: doc.method === 'pooled' ? 'single region-wide ratio (fallback, validated better here)' : 'monthly ratios with shrinkage',
        low_activity_region: v?.low_activity ?? null,
        out_of_sample_annual_error_pct: v?.loyo_err_pct, out_of_sample_bias_pct: v?.loyo_bias_pct,
        validation_v1_pass: v?.low_activity ? 'not judged (low activity)' : v?.v1_pass,
        step_at_2012_raw_pct: v?.step_raw_pct, step_at_2012_harmonized_pct: v?.step_harm_pct, step_at_2012_modis_only_pct: v?.step_modis_pct,
        validation_v3_pass: v?.low_activity ? 'not judged (low activity)' : v?.v3_pass,
        uncertain_months_in_record: doc.months.filter((x: any) => x.flags.includes('uncertain')).length,
        provisional_months: doc.months.filter((x: any) => x.flags.includes('provisional')).map((x: any) => `${MONTHS[x.m - 1]} ${x.y}`),
        static_source_detections_removed: q?.masked_static_total, data_through: doc.data_end,
        famous_seasons: v?.v9 ? {
          season_definition: 'July–June', seasons_ranked: v.v9.n_seasons, top3_seasons_harmonized: v.v9.top3_harmonized,
          ...(v.v9.black_summer_rank_harmonized != null ? { black_summer_2019_20_rank_harmonized: v.v9.black_summer_rank_harmonized,
            black_summer_2019_20_rank_raw: v.v9.black_summer_rank_raw } : {}),
          ...(v.v9.octnov_top3_harmonized ? { oct_nov_crop_burning_top3_years: v.v9.octnov_top3_harmonized } : {}),
        } : null,
        notes: ['Aug–Nov 2026 are near-real-time (provisional)', 'MODIS orbit drift after 2020 is excluded from calibration', 'values are MODIS-equivalent; VIIRS-only small fires are scaled away'] }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

export function GET() {
  return Response.json({ tools: TOOL_DECLARATIONS })
}
