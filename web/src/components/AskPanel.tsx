import { useEffect, useRef, useState } from 'react'
import { askFireRings, CHIPS } from '../lib/ask'
import type { Answer, Voice } from '../lib/ask'
import { REGIONS } from '../lib/regions'
import AnswerCard from './AnswerCard'

/** Chat with the grounded analyst. Used in the region drawer and on /ask. */
export default function AskPanel({ initialRegion, initialQuestion, compact }: { initialRegion?: string; initialQuestion?: string; compact?: boolean }) {
  const [region, setRegion] = useState(initialRegion ?? 'punjab')
  const [voice, setVoice] = useState<Voice>('responder')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const asked = useRef(false)

  const send = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setErr(null)
    try {
      const a = await askFireRings(text, region, voice)
      setAnswers((xs) => [a, ...xs])
      setQ('')
    } catch (e) {
      setErr(`${(e as Error).message}. The charts and numbers on every page still work; the suggested questions may have saved answers.`)
    } finally {
      setBusy(false)
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
      </div>
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
      {busy && <div className="h-20 animate-pulse rounded-sm bg-surface-2" aria-label="Waiting for answer" />}
      {err && <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">{err}</p>}
      <div className="space-y-3">{answers.map((a, i) => <AnswerCard key={answers.length - i} a={a} />)}</div>
      <p className="text-[11px] text-faint">Answers come from Google Gemini using only numbers looked up from the Fire Rings record (see "Numbers used"). No forecasts.</p>
    </div>
  )
}
