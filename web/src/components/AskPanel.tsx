import { useEffect, useRef, useState } from 'react'
import { askFireRings, CHIPS, regionInQuestion } from '../lib/ask'
import type { Answer, StepEvent, Voice } from '../lib/ask'
import { fetchJson } from '../lib/api'
import { toDetail } from '../lib/detail'
import { fmtInt, fmtRatio } from '../lib/format'
import { storedMode } from '../lib/mode'
import { REGIONS } from '../lib/regions'
import { MONTHS } from '../lib/series'
import type { DataMode, RegionDoc } from '../lib/types'
import AnswerCard from './AnswerCard'
import MiniRings from './MiniRings'

/** One question and what happened to it — errors stay attached to their own question (QA #58). */
interface Turn { id: number; question: string; region: string; voice: Voice; status: 'loading' | 'done' | 'error'; answer?: Answer; error?: string; steps: StepEvent[] }

/** One set of suggestions (QA #71): the four saved-answer chips first, then region-specific examples. */
const suggestions = (name: string) => [...CHIPS, `How many fire-days did ${name} have in 2019?`, 'Compare 2016 with 2024.', 'What is a typical October?']

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-sm border border-border-strong bg-surface-2 p-0.5 text-sm">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
          className={`rounded-[6px] px-3 py-1.5 transition-colors ${value === v ? 'bg-accent font-semibold text-bg' : 'text-muted hover:text-text'}`}>{l}</button>
      ))}
    </div>
  )
}

/** "What the AI can see": the selected region at a glance + the live trace of lookups (QA #71). */
function SidePanel({ region, mode, turn }: { region: string; mode: DataMode; turn: Turn | undefined }) {
  const [doc, setDoc] = useState<RegionDoc | null>(null)
  useEffect(() => {
    let alive = true
    fetchJson<RegionDoc>(`regions/${region}.json`).then((d) => alive && setDoc(mode === 'detail' && d.detail ? toDetail(d) : d)).catch(() => {})
    return () => { alive = false }
  }, [region, mode])
  const lc = doc?.latest_complete
  const lcRec = lc ? doc!.months.find((r) => r.y === lc.y && r.m === lc.m) : undefined
  const peak = doc?.climatology ? doc.climatology.median.indexOf(Math.max(...doc.climatology.median)) : -1
  const best = doc ? [...doc.annual].filter((a) => a.complete && a.rankable !== false && a.H != null).sort((a, b) => b.H! - a.H!)[0] : undefined
  return (
    <aside className="space-y-4" aria-label="What the AI can see" data-testid="ask-side">
      <section className="card">
        <h2 className="eyebrow">What the AI can see</h2>
        <div className="mt-3 flex items-center gap-4">
          {doc ? <MiniRings months={doc.months} label={`${doc.name} mini Fire Rings`} /> : <div className="h-[72px] w-[72px] animate-pulse rounded-full bg-surface-3" />}
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-text">{doc?.name ?? '…'}</p>
            <p className="text-xs text-muted">{mode === 'detail' ? 'High detail · native VIIRS fire-days, 2012–now' : 'Long-term · MODIS-equivalent fire-days, 2001–now'}</p>
          </div>
        </div>
        {doc && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm" data-testid="ask-keynums">
            {lcRec && <div className="rounded-sm bg-surface-2 p-2.5"><dt className="text-[11px] text-faint">Last full month</dt>
              <dd className="mt-0.5 text-text"><span className="num">{fmtInt(lcRec.H)}</span> <span className="text-xs text-muted">{MONTHS[lc!.m - 1]} {lc!.y}</span>
                <span className="block text-xs text-muted">{lcRec.guard ? 'too little fire to judge' : lcRec.ratio != null ? `${fmtRatio(lcRec.ratio)} typical` : ''}</span></dd></div>}
            {peak >= 0 && <div className="rounded-sm bg-surface-2 p-2.5"><dt className="text-[11px] text-faint">Peak month</dt>
              <dd className="mt-0.5 text-text">{MONTHS[peak]} <span className="block text-xs text-muted">typical <span className="num">{fmtInt(doc.climatology!.median[peak])}</span></span></dd></div>}
            {best && <div className="rounded-sm bg-surface-2 p-2.5"><dt className="text-[11px] text-faint">Biggest year</dt>
              <dd className="mt-0.5 text-text">{best.y} <span className="block text-xs text-muted"><span className="num">{fmtInt(best.H)}</span> fire-days</span></dd></div>}
            <div className="rounded-sm bg-surface-2 p-2.5"><dt className="text-[11px] text-faint">Data through</dt>
              <dd className="num mt-0.5 text-text">{doc.data_end}</dd></div>
          </dl>
        )}
      </section>
      <section className="card" aria-live="polite">
        <h2 className="eyebrow">Live trace</h2>
        {!turn ? <p className="mt-2 text-sm text-muted">Ask a question and watch each lookup appear here: what the analyst looked up, what it found, and the final number check.</p> : (
          <>
            <p className="mt-2 truncate text-xs text-faint">“{turn.question}”</p>
            <ol className="mt-2 space-y-1.5 text-sm" data-testid="ask-trace">
              {turn.steps.map((s, i) => (
                <li key={i} className={`flex gap-2 ${s.kind === 'verify' ? (s.ok ? 'text-ok' : 'text-warn') : s.kind === 'tool_done' ? 'text-text' : 'text-muted'}`}>
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">{s.kind === 'tool_done' ? '✓' : s.kind === 'verify' ? (s.ok ? '✓' : '!') : s.kind === 'info' ? 'ⓘ' : '…'}</span>
                  <span className="min-w-0">{s.text.replace(/ ✓$/, '')}</span>
                </li>
              ))}
              {turn.status === 'loading' && <li className="flex items-center gap-2 text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />working…</li>}
              {turn.status === 'error' && <li className="text-warn">No answer: {turn.error}</li>}
            </ol>
          </>
        )}
      </section>
    </aside>
  )
}

/** Chat with the grounded analyst. `compact` = the region drawer; otherwise the full /ask page with the side panel. */
export default function AskPanel({ initialRegion, initialQuestion, compact, mode: modeProp }: { initialRegion?: string; initialQuestion?: string; compact?: boolean; mode?: DataMode }) {
  const [region, setRegion] = useState(initialRegion ?? 'punjab')
  const [voice, setVoice] = useState<Voice>('responder')
  const [mode, setMode] = useState<DataMode>(modeProp ?? storedMode())
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [help, setHelp] = useState(false)
  const asked = useRef(false)
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)
  const busy = turns.some((t) => t.status === 'loading')
  const regionName = REGIONS.find((r) => r.id === region)?.name.split(' (')[0] ?? region

  const send = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    const id = nextId.current++
    // QA #61: a region named in the question switches the selector (never answer Mauritius with Punjab data)
    const named = regionInQuestion(text)
    const useRegion = named ?? region
    if (named && named !== region) setRegion(named)
    setTurns((ts) => [...ts, { id, question: text, region: useRegion, voice, status: 'loading', steps: [] }])
    setQ('')
    const onStep = (s: StepEvent) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, steps: [...t.steps, s] } : t)))
    try {
      const a = await askFireRings(text, useRegion, voice, mode, onStep)
      const withNote = named && named !== region ? { ...a, switched_region: named } : a
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'done', answer: { region: useRegion, ...withNote } } : t)))
    } catch (e) {
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'error', error: (e as Error).message } : t)))
    }
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) { asked.current = true; void send(initialQuestion) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])
  const lastStatus = turns.at(-1)?.status
  useEffect(() => { if (turns.length) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [turns.length, lastStatus])

  const controls = (
    <div className="flex flex-wrap items-center gap-2.5" data-testid="ask-controls">
      <label className="flex items-center gap-2 text-sm text-muted">
        <span className="sr-only">Region</span>
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region"
          className="rounded-sm border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text">
          {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <Segmented label="Voice" value={voice} onChange={setVoice} options={[['responder', 'Responder'], ['scientist', 'Scientist']]} />
      <Segmented label="Data mode" value={mode} onChange={setMode} options={[['longterm', 'Long-term'], ['detail', 'High detail']]} />
      <button onClick={() => setHelp((h) => !h)} aria-expanded={help} aria-label="How the analyst works"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-xs text-muted hover:border-accent-2 hover:text-accent-2">i</button>
    </div>
  )
  const helpBox = help && (
    <div className="rounded-sm border border-border bg-surface-2 p-3 text-xs text-muted" data-testid="ask-help">
      <p><strong className="text-text">Responder</strong>: 2–3 plain sentences, bottom line first. <strong className="text-text">Scientist</strong>: the same numbers plus uncertainty (90% range, percentile range), baseline and method notes.</p>
      <p className="mt-1"><strong className="text-text">Long-term</strong> answers in MODIS-equivalent fire-days (2001–now); <strong className="text-text">High detail</strong> in native VIIRS fire-days (2012–now).</p>
      <p className="mt-1">Answered by Google Gemini using only Fire Rings numbers: every number is looked up with a tool on the published record and checked before the answer is shown.</p>
    </div>
  )
  const thread = (
    <div className="space-y-5" aria-live="polite">
      {!turns.length && (
        <div className="rounded-sm border border-dashed border-border-strong p-5 text-sm text-muted" data-testid="ask-empty">
          <p className="font-display text-base text-text">Ask anything about fire in {regionName}.</p>
          <p className="mt-1">Pick a suggestion below or type your own question. Every number in the answer is looked up and verified.</p>
        </div>
      )}
      {turns.map((t) => (
        <article key={t.id} data-turn={t.status} data-voice={t.status === 'done' ? t.answer?.voice : undefined} data-source={t.answer?.source} className="space-y-2">
          <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-4 py-2.5 text-[15px] text-text">{t.question}</p></div>
          {t.status === 'loading' && (
            <div className="max-w-[92%] rounded-sm border border-border bg-surface-2 p-4" aria-label="Thinking">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 150}ms` }} />)}
                <span className="ml-1">{t.steps.at(-1)?.text ?? 'Looking up numbers in the record…'}</span>
              </div>
              <div className="mt-3 space-y-2"><div className="h-3 w-11/12 animate-pulse rounded bg-surface-3" /><div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" /></div>
            </div>
          )}
          {t.status === 'error' && (
            <div className="max-w-[92%] rounded-sm border border-border bg-surface-2 p-4 text-sm" role="alert">
              <p className="text-muted">{t.error}. The charts and numbers on every page still work; the first four suggestions have saved answers.</p>
            </div>
          )}
          {t.status === 'done' && t.answer && <div className="max-w-[96%]"><AnswerCard a={t.answer} onFollow={busy ? undefined : send} /></div>}
        </article>
      ))}
      <div ref={endRef} />
    </div>
  )
  const chips = (
    <div className="flex flex-wrap gap-2" data-testid="ask-suggestions">
      {(compact ? CHIPS : suggestions(regionName)).map((c) => (
        <button key={c} disabled={busy} onClick={() => send(c)}
          className="rounded-full border border-border-strong bg-surface-2 px-3 py-1.5 text-xs text-text hover:border-accent hover:bg-surface-3 disabled:opacity-50">{c}</button>
      ))}
    </div>
  )
  const bar = (
    <form onSubmit={(e) => { e.preventDefault(); void send(q) }} className="flex gap-2 rounded-card border border-border-strong bg-surface-2 p-2 focus-within:border-accent">
      <label htmlFor="ask-input" className="sr-only">Your question</label>
      <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder={`Ask about fire in ${regionName}…`}
        className={`min-w-0 flex-1 bg-transparent px-2 text-text placeholder:text-faint focus:outline-none ${compact ? 'py-1.5 text-sm' : 'py-2.5 text-base'}`} />
      <button type="submit" disabled={busy || !q.trim()}
        className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint disabled:hover:brightness-100">
        {busy ? 'Thinking…' : 'Ask ↵'}
      </button>
    </form>
  )
  const disclaimer = <p className="text-[11px] text-faint">A planning tool: no forecasts, not an emergency service. Every number comes from the published record.</p>

  if (compact) {
    return <div className="flex flex-col gap-4">{controls}{helpBox}{thread}{chips}{bar}{disclaimer}</div>
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="card flex min-h-[560px] flex-col gap-4" aria-label="Conversation">
        {controls}
        {helpBox}
        <div className="flex-1">{thread}</div>
        {chips}
        {bar}
        {disclaimer}
      </section>
      <SidePanel region={region} mode={mode} turn={turns.at(-1)} />
    </div>
  )
}
