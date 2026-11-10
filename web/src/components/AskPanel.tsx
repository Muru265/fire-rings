import { useEffect, useRef, useState } from 'react'
import { askFireRings, CHIPS, regionInQuestion } from '../lib/ask'
import type { Answer, Voice } from '../lib/ask'
import { storedMode } from '../lib/mode'
import { REGIONS } from '../lib/regions'
import type { DataMode } from '../lib/types'
import AnswerCard from './AnswerCard'

/** One question and what happened to it — errors stay attached to their own question (QA #58). */
interface Turn { id: number; question: string; region: string; voice: Voice; status: 'loading' | 'done' | 'error'; answer?: Answer; error?: string }

const examples = (name: string) => [
  `How many fire-days did ${name} have in 2019?`, 'What is a typical October?', 'Compare 2016 with 2024.', 'Which years look most like this year?',
]

/** Chat with the grounded analyst (QA #57). Used in the region drawer (compact) and on /ask. Newest turn at the bottom. */
export default function AskPanel({ initialRegion, initialQuestion, compact, mode: modeProp }: { initialRegion?: string; initialQuestion?: string; compact?: boolean; mode?: DataMode }) {
  const [region, setRegion] = useState(initialRegion ?? 'punjab')
  const [voice, setVoice] = useState<Voice>('responder')
  const [mode, setMode] = useState<DataMode>(modeProp ?? storedMode())
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [help, setHelp] = useState<'style' | 'model' | null>(null)
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
    setTurns((ts) => [...ts, { id, question: text, region: useRegion, voice, status: 'loading' }])
    setQ('')
    try {
      const a = await askFireRings(text, useRegion, voice, mode)
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

  const seg = (on: boolean) => `rounded-[6px] px-2.5 py-1 ${on ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`
  return (
    <div className="flex flex-col gap-4">
      {/* one tidy control row: region · style · mode · ⓘ */}
      <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`} data-testid="ask-controls">
        <label className="flex items-center gap-2 text-muted"><span className="sr-only sm:not-sr-only">Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-sm border border-border bg-surface-2 px-2 py-1 text-text" aria-label="Region">
            {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Voice" className="flex rounded-sm border border-border p-0.5 text-xs">
          {(['responder', 'scientist'] as Voice[]).map((v) => <button key={v} onClick={() => setVoice(v)} aria-pressed={voice === v} className={`${seg(voice === v)} capitalize`}>{v}</button>)}
        </div>
        <div role="group" aria-label="Data mode" className="flex rounded-sm border border-border p-0.5 text-xs">
          {([['longterm', 'Long-term'], ['detail', 'High detail']] as [DataMode, string][]).map(([m, l]) => <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={seg(mode === m)}>{l}</button>)}
        </div>
        <button onClick={() => setHelp((h) => (h === 'style' ? null : 'style'))} aria-expanded={help === 'style'} className="text-xs text-accent-2" aria-label="What do the styles and modes mean?">ⓘ styles</button>
        <button onClick={() => setHelp((h) => (h === 'model' ? null : 'model'))} aria-expanded={help === 'model'} className="text-xs text-faint hover:text-text" aria-label="Who answers?">ⓘ who answers</button>
      </div>
      {help === 'style' && (
        <p className="rounded-sm border border-border bg-surface-2 p-3 text-xs text-muted">
          <strong className="text-text">Responder:</strong> 2–3 plain sentences, bottom line first. <strong className="text-text">Scientist:</strong> the same numbers plus uncertainty (90% range, percentile range), baseline and method notes.{' '}
          <strong className="text-text">Long-term</strong> answers in MODIS-equivalent fire-days (2001–now); <strong className="text-text">High detail</strong> in native VIIRS fire-days (2012–now).
        </p>
      )}
      {help === 'model' && <p className="rounded-sm border border-border bg-surface-2 p-3 text-xs text-muted">Answered by Google Gemini using only Fire Rings numbers: every number is looked up with a tool on the published record and checked before the answer is shown (see “Numbers used”).</p>}

      {/* thread */}
      <div className="space-y-5" aria-live="polite">
        {!turns.length && (
          <div className="rounded-sm border border-dashed border-border-strong p-4 text-sm text-muted" data-testid="ask-empty">
            <p className="text-text">Ask anything about fire in {regionName}. For example:</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {examples(regionName).map((e) => <li key={e}><button onClick={() => send(e)} className="rounded-sm bg-surface-2 px-2.5 py-1 text-xs text-text hover:bg-surface-3">{e}</button></li>)}
            </ul>
          </div>
        )}
        {turns.map((t) => (
          <article key={t.id} data-turn={t.status} data-voice={t.status === 'done' ? t.answer?.voice : undefined} data-source={t.answer?.source} className="space-y-2">
            <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-sm text-text">{t.question}</p></div>
            {t.status === 'loading' && (
              <div className="max-w-[92%] rounded-sm border border-border bg-surface-2 p-4" aria-label="Thinking">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 150}ms` }} />)}
                  <span className="ml-1">Looking up numbers in the record…</span>
                </div>
                <div className="mt-3 space-y-2"><div className="h-3 w-11/12 animate-pulse rounded bg-surface-3" /><div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" /></div>
              </div>
            )}
            {t.status === 'error' && (
              <div className="max-w-[92%] rounded-sm border border-border bg-surface-2 p-4 text-sm" role="alert">
                <p className="text-muted">{t.error}. The charts and numbers on every page still work; the suggested questions have saved answers.</p>
                <div className="mt-2 flex flex-wrap gap-2">{CHIPS.map((c) => <button key={c} onClick={() => send(c)} className="rounded-full border border-border-strong px-2.5 py-1 text-[11px] text-text hover:bg-surface-3">{c}</button>)}</div>
              </div>
            )}
            {t.status === 'done' && t.answer && <div className="max-w-[96%]"><AnswerCard a={t.answer} onFollow={busy ? undefined : send} /></div>}
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button key={c} disabled={busy} onClick={() => send(c)}
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2 disabled:opacity-50">{c}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(q) }} className="flex gap-2">
        <label htmlFor="ask-input" className="sr-only">Your question</label>
        <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder={`Ask about fire in ${regionName}… (Enter to send)`}
          className="min-w-0 flex-1 rounded-sm border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent" />
        <button type="submit" disabled={busy || !q.trim()}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint disabled:hover:brightness-100">
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      <p className="text-[11px] text-faint">A planning tool: no forecasts, not an emergency service. Every number comes from the published record.</p>
    </div>
  )
}
