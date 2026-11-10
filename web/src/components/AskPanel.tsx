import { useEffect, useRef, useState } from 'react'
import { askFireRings, CHIPS, regionInQuestion } from '../lib/ask'
import type { DataMode } from '../lib/types'
import type { Answer, Voice } from '../lib/ask'
import { REGIONS } from '../lib/regions'
import AnswerCard from './AnswerCard'

/** One question and what happened to it — errors stay attached to their own question (QA #58). */
interface Turn { id: number; question: string; region: string; voice: Voice; status: 'loading' | 'done' | 'error'; answer?: Answer; error?: string }

/** Chat with the grounded analyst. Used in the region drawer and on /ask. */
export default function AskPanel({ initialRegion, initialQuestion, compact, mode = 'longterm' }: { initialRegion?: string; initialQuestion?: string; compact?: boolean; mode?: DataMode }) {
  const [region, setRegion] = useState(initialRegion ?? 'punjab')
  const [voice, setVoice] = useState<Voice>('responder')
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [styleHelp, setStyleHelp] = useState(false)
  const asked = useRef(false)
  const nextId = useRef(1)
  const busy = turns.some((t) => t.status === 'loading')

  const send = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    const id = nextId.current++
    // QA #61: a region named in the question switches the selector (never answer Mauritius with Punjab data)
    const named = regionInQuestion(text)
    const useRegion = named ?? region
    if (named && named !== region) setRegion(named)
    setTurns((ts) => [{ id, question: text, region: useRegion, voice, status: 'loading' }, ...ts])
    setQ('')
    try {
      const a = await askFireRings(text, useRegion, voice, mode)
      const withNote = named && named !== region ? { ...a, switched_region: named } : a
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'done', answer: withNote } : t)))
    } catch (e) {
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'error', error: (e as Error).message } : t)))
    }
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) { asked.current = true; void send(initialQuestion) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <label className="flex items-center gap-2 text-muted">Region
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-sm border border-border bg-surface-2 px-2 py-1 text-text">
            {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Voice" className="flex rounded-sm border border-border p-0.5 text-xs">
          {(['responder', 'scientist'] as Voice[]).map((v) => (
            <button key={v} onClick={() => setVoice(v)} aria-pressed={voice === v}
              className={`rounded-[6px] px-2.5 py-1 capitalize ${voice === v ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}>{v}</button>
          ))}
        </div>
        <button onClick={() => setStyleHelp((s) => !s)} aria-expanded={styleHelp} className="text-xs text-accent-2" aria-label="What do the styles mean?">ⓘ styles</button>
      </div>
      {styleHelp && (
        <p className="rounded-sm border border-border bg-surface-2 p-3 text-xs text-muted">
          <strong className="text-text">Responder:</strong> 2–3 plain sentences, bottom line first — is it unusual, how much, what it means.{' '}
          <strong className="text-text">Scientist:</strong> the same numbers plus uncertainty (90% range, percentile range), baseline, units and method notes.
          Both use only verified numbers from the record.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button key={c} disabled={busy} onClick={() => send(c)}
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text hover:bg-surface-2 disabled:opacity-50">{c}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(q) }} className="flex gap-2">
        <label htmlFor="ask-input" className="sr-only">Your question</label>
        <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ask about fire in this region…"
          className="min-w-0 flex-1 rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint" />
        <button type="submit" disabled={busy || !q.trim()} className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      <div className="space-y-3" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} data-turn={t.status} className="space-y-2">
            {t.status === 'loading' && (
              <div className="rounded-sm border border-border bg-surface-2 p-4 text-sm text-muted">
                <span className="text-faint">You asked:</span> {t.question}
                <div className="mt-2 flex items-center gap-2 text-xs"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Thinking… looking up numbers</div>
              </div>
            )}
            {t.status === 'error' && (
              <div className="rounded-sm border border-border bg-surface-2 p-4 text-sm" role="alert">
                <span className="text-faint">You asked:</span> <span className="text-text">{t.question}</span>
                <p className="mt-2 text-muted">{t.error}. The charts and numbers on every page still work; the suggested questions have saved answers.</p>
              </div>
            )}
            {t.status === 'done' && t.answer && <AnswerCard a={t.answer} />}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-faint">Answers come from Google Gemini using only numbers looked up from the Fire Rings record (see "Numbers used"). No forecasts.</p>
    </div>
  )
}
