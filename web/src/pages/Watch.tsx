import { useCallback, useEffect, useRef, useState } from 'react'
import Freshness from '../components/Freshness'
import { Link } from 'react-router-dom'
import { checkSteps, liveCheck, pctWords, triggerLabel, worst } from '../../api/_lib/watch'
import type { Briefing, Check, Status, WatchDoc } from '../../api/_lib/watch'
import Help from '../components/Help'
import WatchProof from '../components/WatchProof'
import { fetchJson } from '../lib/api'
import { fmtInt, fmtRatio } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import { formatNumbersInText } from '../../api/_lib/numfmt'
import { collapseSteps } from '../lib/steps'
import AgentCheck from '../components/AgentCheck'
import type { TimingCheck } from '../components/AgentCheck'

interface Step { region?: string; kind: string; text: string; ok?: boolean }
interface RegionState { status: Status; checks: Check[]; relevant_for: string; flags: string[]; timing_check?: TimingCheck[] | null }
type Saved = Record<string, Omit<Briefing, 'source'>>

function RegionCard({ id, name, st, brief, saved }: { id: string; name: string; st: RegionState; brief?: Briefing; saved: Saved }) {
  const [voice, setVoice] = useState<'responder' | 'scientist'>('responder')
  const sci = saved[`${id}|scientist`]
  const shown: Briefing | undefined = voice === 'scientist' && sci ? { ...sci, source: 'saved' } : brief
  const fired = st.checks.filter((c) => c.rule && c.rule !== 'low_activity_guard')
  const guarded = st.checks.filter((c) => c.rule === 'low_activity_guard')
  return (
    <article className="card flex flex-col gap-3" data-testid="watch-card" data-region={id} data-status={st.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-text">{name}</h3>
        <StatusBadge status={st.status} trigger={triggerLabel(st.checks, st.status)} />
      </div>
      <div>
        <p className="eyebrow !text-[10px]">Why this {st.status === 'Normal' ? 'status' : 'alert'}?</p>
        <ul className="mt-1 space-y-1 text-sm text-muted" data-testid="watch-why">
          {fired.map((c) => <li key={c.id}><span className="text-text">{c.label}{c.month ? ` (${c.month})` : ''}:</span> {c.rule_text}</li>)}
          {guarded.map((c) => <li key={c.id}><span className="text-text">{c.label}{c.month ? ` (${c.month})` : ''}:</span> {c.rule_text}</li>)}
          {!fired.length && !guarded.length && <li>No rule fired: every check is inside the normal range.</li>}
        </ul>
      </div>
      {shown ? (
        <div className="rounded-sm border border-border bg-surface-2 p-3" data-testid="watch-briefing">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            <div role="group" aria-label="Briefing style" className="inline-flex rounded-sm border border-border p-0.5">
              {(['responder', 'scientist'] as const).map((v) => <button key={v} onClick={() => setVoice(v)} aria-pressed={voice === v} disabled={v === 'scientist' && !sci}
                className={`rounded-[5px] px-2 py-0.5 capitalize ${voice === v ? 'bg-surface-3 text-text' : 'text-muted'} disabled:opacity-40`}>{v}</button>)}
            </div>
            {shown.source === 'saved'
              ? <span className="rounded-full bg-accent-2/15 px-2 py-px text-accent-2" title="Precomputed from the same data and verified the same way">⚡ saved briefing</span>
              : <span className="rounded-full bg-ok/15 px-2 py-px text-ok">live · every number verified ✓</span>}
          </div>
          <p className="text-[15px] leading-relaxed text-text">{formatNumbersInText(shown.answer)}</p>
          {shown.caveat && <p className="mt-1.5 text-xs text-muted"><span className="font-semibold text-warn">Caveat:</span> {shown.caveat}</p>}
        </div>
      ) : st.status !== 'Normal' ? <p className="text-xs text-faint">Briefing: run the agent to generate one.</p> : null}
      {st.status !== 'Normal' && st.timing_check?.length ? <AgentCheck checks={st.timing_check} /> : null}
      <details className="text-sm" open={st.status !== 'Normal'}>
        <summary className="cursor-pointer text-xs text-accent-2">Numbers used</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-[12px]" data-testid="watch-numbers">
          <thead><tr className="text-left text-faint"><th className="py-1 pr-2 font-medium">Check</th><th className="pr-2 text-right font-medium">Value</th><th className="pr-2 text-right font-medium">Typical</th><th className="font-medium">Where it sits</th></tr></thead>
          <tbody>{st.checks.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="py-1 pr-2 text-muted">{c.label}{c.month ? ` · ${c.month}` : ''}</td>
              <td className="num pr-2 text-right text-text">{c.value == null ? '—' : fmtInt(c.value)}</td>
              <td className="num pr-2 text-right">{c.id === 'live' ? (c.expected != null ? `~${fmtInt(c.expected)}` : '—') : c.median != null ? fmtInt(c.median) : '—'}</td>
              <td className="text-muted">{c.id === 'live' ? (c.value == null ? 'feed unavailable' : `raw detections, last 72 h${c.ratio != null ? ` (${c.ratio}× expected)` : ''}`) : c.guard ? 'too little fire to judge' : `${c.ratio != null ? `${fmtRatio(c.ratio)} · ` : ''}${pctWords(c.pct)}`}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="mt-1 text-[11px] text-faint">Fire-days are MODIS-equivalent (Long-term record); “this month so far” is compared with the same days of 2003–2022.</p>
      </details>
      <p className="text-xs text-muted"><span className="text-faint">Relevant for:</span> {st.relevant_for}</p>
      {st.flags.length > 0 && <p className="text-[11px] text-faint">Flags: {st.flags.map((f) => f.replace(/_/g, ' ')).join(' · ')}</p>}
      <Link to={`/r/${id}`} className="mt-auto text-sm">Explore {name.split(' (')[0]} →</Link>
    </article>
  )
}

const short = (name: string) => name.split(' (')[0]

/** #86: the last line of a region's trace block. */
function closeStep(id: string, name: string, brief: { answer: string } | null, status?: string): Step {
  if (!brief) return { region: id, kind: 'close', ok: true, text: `✓ ${short(name)} checked — ${status ?? 'Normal'}, no briefing needed` }
  const n = (brief.answer.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).length
  return { region: id, kind: 'close', ok: true, text: `✓ ${short(name)} briefing ready — ${n} numbers verified` }
}

function TraceLine({ s, prefix }: { s: Step & { times: number }; prefix?: string }) {
  const cls = s.kind === 'status' || s.kind === 'close' ? 'font-semibold text-text' : s.kind === 'verify' ? (s.ok === false ? 'text-warn' : 'text-ok') : s.kind === 'info' ? 'text-accent-2' : 'text-muted'
  const icon = s.kind === 'close' ? '' : s.kind === 'status' ? '■' : s.kind === 'verify' || s.kind === 'tool_done' ? '✓' : s.kind === 'info' ? 'ⓘ' : '›'
  // the region name leads every line (unless the line already starts with it)
  const text = s.text.replace(/ ✓$/, '')
  const showPrefix = prefix && s.kind !== 'close' && !text.includes(prefix)
  return (
    <li className={`flex gap-2 ${s.kind === 'close' ? 'text-ok' : cls}`} data-kind={s.kind}>
      {icon && <span aria-hidden="true" className="w-4 shrink-0 text-center">{icon}</span>}
      <span className="min-w-0">{showPrefix && <span className="text-faint">{prefix} · </span>}{text}{s.times > 1 && <span className="num ml-1 text-faint">×{s.times}</span>}</span>
    </li>
  )
}

export default function Watch() {
  const [doc, setDoc] = useState<WatchDoc | null>(null)
  const [saved, setSaved] = useState<Saved>({})
  const [regions, setRegions] = useState<Record<string, RegionState>>({})
  const [briefs, setBriefs] = useState<Record<string, Briefing>>({})
  const [steps, setSteps] = useState<Step[]>([])
  // #86: a region's block is closed by its last line ("briefing ready" / "no briefing needed"); later lines are dropped
  const closed = useRef<Set<string>>(new Set())
  const push = useCallback((st: Step) => {
    if (st.region && closed.current.has(st.region)) return
    if (st.kind === 'close' && st.region) closed.current.add(st.region)
    setSteps((x) => [...x, st])
  }, [])
  const resetSteps = () => { closed.current = new Set(); setSteps([]) }
  const [run, setRun] = useState<'idle' | 'running' | 'done' | 'replay'>('idle')
  const traceRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    Promise.all([fetchJson<WatchDoc>('watch.json'), fetchJson<{ briefings: Saved }>('watch_cache.json').catch(() => ({ briefings: {} }))]).then(([w, c]) => {
      setDoc(w)
      setSaved(c.briefings)
      setRegions(Object.fromEntries(Object.entries(w.regions).map(([id, r]) => [id, { status: r.status, checks: r.checks, relevant_for: r.relevant_for, flags: r.flags, timing_check: (r as { timing_check?: TimingCheck[] | null }).timing_check ?? null }])))
      setBriefs(Object.fromEntries(Object.entries(c.briefings).filter(([k]) => k.endsWith('|responder')).map(([k, b]) => [k.split('|')[0], { ...b, source: 'saved' as const }])))
    })
  }, [])
  // keep the newest step visible inside the trace box only (never scroll the page)
  useEffect(() => { const el = traceRef.current; if (el) el.scrollTop = el.scrollHeight }, [steps.length])

  const replay = async (w: WatchDoc) => {
    // offline: the same rules re-applied to the published record + saved briefings (no live feed, no live AI)
    setRun('replay')
    const add = push
    add({ kind: 'info', text: 'Live agent unavailable here — replaying the rules on the published data with saved briefings.' })
    for (const [id, r] of Object.entries(w.regions)) {
      const checks = [...r.checks, liveCheck(r, null, w.rules, w.rule_text)]
      for (const text of checkSteps(r.name, checks)) { add({ region: id, kind: 'rule', text }); await new Promise((res) => setTimeout(res, 120)) }
      const status = worst(checks)
      add({ region: id, kind: 'status', text: `Status: ${status} — ${r.name.split(' (')[0]}` })
      setRegions((x) => ({ ...x, [id]: { ...x[id], status, checks } }))
      if (status !== 'Normal' && saved[`${id}|responder`]) {
        add({ region: id, kind: 'info', text: '⚡ Saved briefing (verified against its lookups when it was made)' })
        add(closeStep(id, r.name, saved[`${id}|responder`]))
      } else add(closeStep(id, r.name, null, status))
    }
    add({ kind: 'info', text: 'Done.' })
  }

  const start = async () => {
    if (!doc || run === 'running') return
    resetSteps()
    setRun('running')
    try {
      const r = await fetch('/api/watch?stream=1&brief=1')
      if (!r.ok || !r.body || !(r.headers.get('content-type') ?? '').includes('ndjson')) throw new Error('unavailable')
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let gotDone = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          const ev = JSON.parse(line)
          if (ev.type === 'step') push({ region: ev.region, kind: ev.kind, text: ev.text, ok: ev.ok })
          else if (ev.type === 'region') {
            setRegions((x) => ({ ...x, [ev.region]: { status: ev.status, checks: ev.checks, relevant_for: ev.relevant_for, flags: ev.flags, timing_check: x[ev.region]?.timing_check ?? null } }))
            if (ev.status === 'Normal') push(closeStep(ev.region, doc.regions[ev.region]?.name ?? ev.region, null, ev.status))
          } else if (ev.type === 'briefing') {
            setBriefs((x) => ({ ...x, [ev.region]: ev.briefing }))
            push(closeStep(ev.region, doc.regions[ev.region]?.name ?? ev.region, ev.briefing))
          }
          else if (ev.type === 'done') gotDone = true
          else if (ev.type === 'error') throw new Error(ev.message)
        }
      }
      if (!gotDone) throw new Error('stream ended early')
      setRun('done')
    } catch {
      await replay(doc)
    }
  }

  if (!doc) return <div className="card h-[60vh] animate-pulse" />
  const names = Object.fromEntries(Object.entries(doc.regions).map(([id, r]) => [id, r.name]))
  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <p className="eyebrow">Agentic monitoring</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">Fire Watch<Help id="fire-watch" /></h1>
        <p className="mt-2 text-base text-muted">A monitoring agent checks every region against fixed, published rules; a briefing agent explains flagged regions in plain words using only verified numbers. <strong className="text-text">Rules decide, AI explains.</strong></p>
        <p className="mt-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-xs text-muted">Situational awareness for planning — <strong className="text-text">not an emergency alert service</strong>. No forecasts. Data through {doc.data_end} · <Freshness />.</p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-4 md:grid-cols-2" data-testid="watch-cards">
          {Object.entries(regions).map(([id, st]) => <RegionCard key={id} id={id} name={names[id]} st={st} brief={briefs[id]} saved={saved} />)}
        </div>
        <aside className="space-y-4">
          <section className="card" aria-labelledby="agent-h">
            <h2 id="agent-h" className="eyebrow">The agent</h2>
            <button onClick={start} disabled={run === 'running'} data-testid="run-agent"
              className="mt-3 w-full rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-bg hover:brightness-110 disabled:cursor-wait disabled:opacity-70">
              {run === 'running' ? 'Running…' : '▶ Run the agent now'}</button>
            <p className="mt-2 text-[11px] text-faint">Checks the month so far, the last full month and the live 72-hour feed for each region, then asks for briefings where a rule fired.</p>
            <ol ref={traceRef} className="mt-3 max-h-[520px] space-y-2 overflow-auto text-[13px]" aria-live="polite" data-testid="watch-trace">
              {!steps.length && <li className="text-muted">Press ▶ to watch the agent work, step by step.</li>}
              {collapseSteps(steps.filter((x) => !x.region && x.text !== 'Done.')).map((s, i) => <TraceLine key={`g${i}`} s={s} />)}
              {Object.keys(doc.regions).filter((id) => steps.some((x) => x.region === id)).map((id) => (
                <li key={id} className="rounded-sm border border-border bg-surface-2/60 p-2" data-testid="trace-block" data-region={id}>
                  <p className="mb-1 font-display text-[12px] font-semibold tracking-wide text-text">{short(names[id])}</p>
                  <ol className="space-y-1">
                    {collapseSteps(steps.filter((x) => x.region === id)).map((s, i) => <TraceLine key={i} s={s} prefix={short(names[id])} />)}
                  </ol>
                </li>
              ))}
              {steps.some((x) => x.text === 'Done.') && <TraceLine s={{ kind: 'info', text: 'Done.', times: 1 }} />}
              {run === 'running' && <li className="flex items-center gap-2 text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />working…</li>}
            </ol>
          </section>
          <section className="card text-sm" aria-labelledby="rules-h">
            <h2 id="rules-h" className="eyebrow">The rules (fixed, published)</h2>
            <ul className="mt-2 space-y-1.5 text-muted" data-testid="watch-rules">
              <li><StatusBadge status="Alert" small /> month above every year in the 2003–2022 baseline</li>
              <li><StatusBadge status="Watch" small /> far above normal (above P{doc.rules.far_above_pct}), or live 72 h ≥ {doc.rules.live_spike_ratio}× expected</li>
              <li><StatusBadge status="Unusually low" small /> far below normal (below P{doc.rules.far_below_pct})</li>
              <li><StatusBadge status="Normal" small /> otherwise — and always when there is too little fire to judge</li>
            </ul>
            <p className="mt-2 text-[11px] text-faint">Percentiles use our uncertainty range: “far above” only when even its low end is above P{doc.rules.far_above_pct}. Thresholds live in one config file (pipeline/config.yaml → watch).</p>
          </section>
          <section className="card text-sm" aria-labelledby="next-h" data-testid="watch-next">
            <h2 id="next-h" className="eyebrow">Coming next (not built yet)</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>Scheduled runs every 3 hours</li>
              <li>Email / SMS alerts for subscribers</li>
              <li>Worldwide coverage</li>
              <li>District-level breakdowns with official boundaries</li>
            </ul>
          </section>
        </aside>
      </div>

      <WatchProof doc={doc} />
    </div>
  )
}
