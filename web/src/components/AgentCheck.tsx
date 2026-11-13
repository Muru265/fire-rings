import Help from './Help'

/** Round 7 agentic check box on Fire Watch: stored results only (pipeline/12_agent.py → watch.json), no live tool calls. */
export interface AgentTrace { step: number; tool: string; input: Record<string, unknown>; result: Record<string, any> }
export interface TimingCheck {
  region: string; month: string; flag: string; direction: 'up' | 'down'; verdict: 'Real change' | 'Detection issue likely' | 'Unclear' | 'Not checkable yet'
  rule: string; signals: Record<string, string>; evidence: string[]; trace: AgentTrace[]; sources: string[]; checked_at: string; check?: string
}

const TONE: Record<TimingCheck['verdict'], string> = {
  'Real change': 'border-ok/50 bg-ok/10 text-ok',
  'Detection issue likely': 'border-warn/50 bg-warn/10 text-warn',
  Unclear: 'border-border-strong bg-surface-3 text-text',
  'Not checkable yet': 'border-border-strong bg-surface-3 text-muted',
}
const ICON: Record<TimingCheck['verdict'], string> = { 'Real change': '✓', 'Detection issue likely': '⚠', Unclear: '?', 'Not checkable yet': '…' }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (k: string) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`
const SIGNAL_TEXT: Record<string, string> = {
  timing_shift: 'detection times shifted', no_timing_shift: 'no timing shift', too_few_detections: 'too few detections',
  burned_area_agrees: 'burned area agrees', burned_area_disagrees: 'burned area does not agree', not_yet_published: 'not yet published',
  unavailable: 'unavailable', fires_outside_overpass_hours: 'fires outside polar overpass hours', fires_match_overpass: 'fires match overpass hours',
  pending_access: 'Meteosat check ready — waiting for data access', not_covered: 'not covered (no geostationary check for this region yet)',
}
const TOOL_TEXT: Record<string, string> = {
  check_detection_times: 'Detection times (FIRMS)', check_burned_area: 'Burned area (MCD64A1)', check_geostationary: 'Geostationary', verdict_rules: 'Verdict rules',
}

function resultLine(t: AgentTrace): string {
  const r = t.result
  if (t.tool === 'verdict_rules') return `${r.verdict} — ${r.rule}`
  const parts = [SIGNAL_TEXT[r.signal] ?? r.signal]
  if (t.tool === 'check_detection_times' && r.aqua_viirs_rel != null) parts.push(`Aqua÷VIIRS ×${r.aqua_viirs_rel}, night share ×${r.night_share_rel ?? '—'}, hour ${r.mean_hour_shift != null ? `${r.mean_hour_shift > 0 ? '+' : ''}${r.mean_hour_shift} h` : '—'}`)
  if (t.tool === 'check_burned_area' && r.burned_km2 != null) parts.push(`${Math.round(r.burned_km2).toLocaleString('en-GB')} km² vs ${r.baseline_km2 != null ? Math.round(r.baseline_km2).toLocaleString('en-GB') : '—'} km² typical`)
  if (t.tool === 'check_geostationary' && r.share_outside_polar_hours != null) parts.push(`${Math.round(r.share_outside_polar_hours * 100)}% outside polar hours`)
  return parts.join(' · ')
}

export default function AgentCheck({ checks }: { checks: TimingCheck[] }) {
  return (
    <div className="rounded-sm border border-border bg-surface-2 p-3" data-testid="agent-check">
      <p className="eyebrow !text-[10px]">Agent check<Help id="agent-check" /></p>
      <div className="mt-1.5 space-y-3">
        {checks.map((c) => (
          <div key={c.month} data-testid="agent-check-month">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{monthLabel(c.month)} · {c.flag}</span>
              <span className={`rounded-full border px-2 py-px text-[11px] font-semibold ${TONE[c.verdict]}`} data-testid="agent-verdict">{ICON[c.verdict]} {c.verdict}</span>
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted" data-testid="agent-evidence">
              {c.evidence.slice(0, 3).map((e) => <li key={e}>{e}</li>)}
            </ul>
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-accent-2">Step-by-step trace ({c.trace.length} steps)</summary>
              <ol className="mt-1 space-y-1" data-testid="agent-trace">
                {c.trace.map((t) => (
                  <li key={t.step} className="rounded-sm border border-border bg-surface px-2 py-1">
                    <span className="num text-faint">{t.step}.</span> <span className="text-text">{TOOL_TEXT[t.tool] ?? t.tool}</span>
                    <span className="text-faint"> → input {Object.entries(t.input).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
                    <span className="block text-muted">→ {resultLine(t)}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-1 text-[11px] text-faint">Stored results, checked {c.checked_at.slice(0, 10)}. Rules decide; the AI only explains. Sources: {c.sources.join(' · ')}.</p>
            </details>
          </div>
        ))}
      </div>
    </div>
  )
}
