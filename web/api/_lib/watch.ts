// Fire Watch shared logic (no SDK imports, so the browser can use it for the offline replay).
// The month rules run in the pipeline (pipeline/09_watch.py → watch.json); this adds the live rule and the plain-words steps.

export type Status = 'Normal' | 'Watch' | 'Alert' | 'Unusually low'
export const SEVERITY: Record<Status, number> = { Normal: 0, 'Unusually low': 1, Watch: 2, Alert: 3 }

export interface Check {
  id: 'mtd' | 'last_full' | 'live'; label: string; month?: string; y?: number; m?: number; days?: number | null
  value: number | null; lo?: number | null; hi?: number | null; median?: number | null; ratio?: number | null; pct?: [number, number] | null
  return_period?: number | null; beyond_record?: boolean; guard?: boolean; flags?: string[]
  status: Status; rule: string | null; rule_text: string | null; expected?: number | null
}
export interface WatchRegion {
  name: string; status: Status; checks: Check[]; flags: string[]; relevant_for: string
  live_expected: { month: string; median_monthly_detections: number; expected_72h: number; baseline: [number, number] }
  backtest: { raw_alerts: number; harmonized_alerts: number; raw_only_alerts: number; raw_lows: number; harmonized_lows: number; per_year: Record<string, { raw: number; harmonized: number; raw_only: number }> }
}
export interface WatchDoc {
  version: string; data_end: string
  rules: { alert_pct: number; far_above_pct: number; far_below_pct: number; live_spike_ratio: number; live_min_expected: number; live_satellites: number }
  rule_text: Record<string, string>
  backtest: { period: [string, string]; baseline: [number, number]; method: string; per_year: Record<string, { raw: number; harmonized: number; raw_only: number }>
    totals: { raw_alerts: number; harmonized_alerts: number; raw_only_alerts: number; both: number; harmonized_only_alerts: number; raw_lows: number; harmonized_lows: number; lows_missed_by_raw: number }
    /** Round 7: agentic check of the harmonized flags (pipeline/12_agent.py) */
    agent?: { period: [string, string]; months_checked: number; verdicts: Record<'Real change' | 'Detection issue likely' | 'Unclear' | 'Not checkable yet', number>
      by_direction: Record<'up' | 'down', Record<string, number>>; regions_with_data: { detection_times: string[]; burned_area: string[]; geostationary: string[] }; americas: string[] | null } }
  regions: Record<string, WatchRegion>
}
export interface Briefing { answer: string; caveat: string; trace: { tool: string; args: Record<string, unknown>; result_summary: string }[]; verified: boolean; model?: string; generated?: string; source: 'live' | 'saved' }

const nf = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'))
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
export const pctWords = (p: [number, number] | null | undefined) => !p ? 'no percentile' : p[1] === 0 ? 'below every baseline year' : p[0] === p[1] ? `${ord(p[0])} percentile` : `${ord(p[0])}–${ord(p[1])} percentile`

/** Live rule: spike → Watch (never Alert); guarded when few detections are expected. */
export function liveCheck(reg: WatchRegion, count: number | null, rules: WatchDoc['rules'], ruleText: Record<string, string>): Check {
  const exp = reg.live_expected.expected_72h
  if (count == null) return { id: 'live', label: 'Live 72 h', value: null, expected: exp, status: 'Normal', rule: null, rule_text: 'live feed unavailable — not used' }
  if (exp < rules.live_min_expected) return { id: 'live', label: 'Live 72 h', value: count, expected: exp, status: 'Normal', rule: 'low_activity_guard', rule_text: `fewer than ${rules.live_min_expected} detections expected — no live rule` }
  const spike = count >= rules.live_spike_ratio * exp
  return { id: 'live', label: 'Live 72 h', value: count, expected: exp, ratio: Math.round((count / exp) * 10) / 10, status: spike ? 'Watch' : 'Normal', rule: spike ? 'live_spike' : null, rule_text: spike ? ruleText.live_spike : null }
}

export const worst = (checks: Check[]): Status => checks.reduce<Status>((a, c) => (SEVERITY[c.status] > SEVERITY[a] ? c.status : a), 'Normal')

/** Plain-words steps for one region's checks (the "Run the agent" trace). */
export function checkSteps(name: string, checks: Check[]): string[] {
  const out = [`Checking ${name}…`]
  for (const c of checks) {
    if (c.id === 'live') {
      out.push(c.value == null ? `Live 72 h (${name.split(' (')[0]}): feed unavailable — skipped` : `Live 72 h: ${nf(c.value)} raw detections vs ~${nf(c.expected)} expected${c.rule === 'live_spike' ? ` → rule “live spike”` : c.rule === 'low_activity_guard' ? ' → too few expected, no live rule' : ' → normal'}`)
      continue
    }
    const what = c.guard ? 'too little fire to judge' : `${nf(c.value)} fire-days, ${c.ratio != null ? `${(Math.round(c.ratio * 10) / 10).toFixed(1)}× typical` : 'no ratio'}, ${pctWords(c.pct)}`
    out.push(`${c.label} (${c.month}): ${what}${c.rule && c.rule !== 'low_activity_guard' ? ` → rule “${c.rule.replace(/_/g, ' ')}”` : c.guard ? ' → low-activity guard, no alarm' : ' → normal'}`)
  }
  return out
}

/** Briefings never forecast: reject (and regenerate) any text that talks about what will happen next. */
export function looksLikeForecast(text: string): boolean {
  return /\b(expect(ed)? to|can expect|will (be|likely|continue|see|rise|fall|increase|decrease)|is likely to|are likely to|forecast(s|ed)?|coming (days|weeks|months)|upcoming|in the next|next (week|month|season))\b/i.test(text)
}

/** #72 Briefings state facts + caveats only: reject (and regenerate) opinions, advice or claims about consequences. */
export function looksLikeOpinion(text: string): boolean {
  return /\b(should|must|ought to|need(s)? to|advis(e|ed|able)|recommend(s|ed)?|urge[sd]?|remain (alert|vigilant|on guard)|stay (alert|vigilant)|be (prepared|ready|alert|vigilant)|ease[sd]? (the )?(strain|pressure|burden)|reliev(e|es|ing) (the )?(strain|pressure)|good news|welcome|encouraging|reassuring|concerning|worrying|alarming|fortunately|unfortunately|thankfully|relief for|helps? (fire|ground|emergency)|ground teams?|fire services (can|may|will)|important for|matters? for|crucial|vital|planning|agency responses?|responders? (can|may|should))\b/i.test(text)
}

/** Why a briefing is rejected, or null when it is facts + caveat only. */
export function rejectReason(text: string): 'forecast' | 'opinion' | null {
  return looksLikeForecast(text) ? 'forecast' : looksLikeOpinion(text) ? 'opinion' : null
}

/** #75 Which month(s) set the status, short: "Oct", "Nov so far", "live 72 h". */
export function triggerLabel(checks: Check[], status: Status): string | null {
  if (status === 'Normal') return null
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const t = checks.filter((c) => c.status === status && c.rule && c.rule !== 'low_activity_guard')
    .map((c) => (c.id === 'live' ? 'live 72 h' : c.m ? `${MON[c.m - 1]}${c.id === 'mtd' ? ' so far' : ''}` : null)).filter(Boolean)
  return t.length ? t.join(', ') : null
}

/** The briefing request: the facts the rules used are named in words; numbers come from the tools (verified server-side). */
export function briefingQuestion(name: string, _reg: WatchRegion, status: Status, checks: Check[]): string {
  const fired = checks.filter((c) => c.rule && c.rule !== 'low_activity_guard')
  const why = fired.map((c) => `${c.label.toLowerCase()} (${c.month ?? 'last 72 hours'}): ${c.rule!.replace(/_/g, ' ')}`).join('; ')
  const months = checks.filter((c) => c.y && c.m).map((c) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][c.m! - 1]} ${c.y}`)
  const timing = checks.some((c) => c.flags?.includes('overpass_timing'))
  return `Write a Fire Watch briefing for ${name}. The monitoring rules gave status "${status}" because ${why || 'no rule fired'}. `
    + `Look up ${months.join(' and ')} with get_month, then state how unusual it is compared with a typical year. `
    + 'State facts and the caveat only: detected fire (fire-days), how it compares with normal, and data limits. '
    + 'No opinions, no advice, no recommendations, no statements about what anyone should do or about effects on people, '
    + 'fire services, smoke, air quality, health or crops, and no forecast. '
    + (timing ? 'A detection-time caveat applies: say that part of the drop may be fires burning after the satellite pass that are no longer detected, and use that detection-time caveat in the CAVEAT line.' : '')
    + ' Then call get_agent_check for this region and add exactly ONE sentence stating the agentic check verdict and its main evidence, using only numbers from that tool; if the verdict is "Not checkable yet", say which data are not available yet.'
}
