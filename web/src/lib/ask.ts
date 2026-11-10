import { fetchJson } from './api'
import { describeCall, describeResult, runTool } from '../../api/tools'
import type { StepEvent } from '../../api/tools'
export { regionInQuestion } from '../../api/tools'
export type { StepEvent } from '../../api/tools'

/** A saved answer's lookups, re-run on the published JSON and shown as steps (labelled as a replay). */
async function replaySteps(trace: TraceItem[], onStep: (s: StepEvent) => void) {
  onStep({ kind: 'info', text: 'Live AI busy — showing a saved answer; replaying its lookups on the published data' })
  for (const t of trace) {
    onStep({ kind: 'tool_start', tool: t.tool, args: t.args, text: `Looking up ${describeCall(t.tool, t.args)}…` })
    const r = await runTool((p) => fetchJson(p), t.tool, t.args).catch(() => null)
    onStep({ kind: 'tool_done', tool: t.tool, args: t.args, text: describeResult(t.tool, r) })
  }
  onStep({ kind: 'verify', ok: true, text: 'Saved answer was verified against these lookups when it was made ✓' })
}

export type Voice = 'responder' | 'scientist'
export type DataMode = 'longterm' | 'detail'
export interface TraceItem { tool: string; args: Record<string, unknown>; result_summary: string; result?: unknown }
export interface Answer {
  question: string
  region?: string | null
  voice: Voice
  mode?: DataMode
  answer: string
  caveat: string
  trace: TraceItem[]
  model?: string
  verified?: boolean
  source: 'live' | 'cache'
  generated?: string
  switched_region?: string
}

export const CHIPS = ['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?']

interface CacheDoc { data_end: string; chips: string[]; entries: Record<string, Omit<Answer, 'source'> & { generated: string }> }

/** Saved answer for the selected style first; the badge always shows the style the answer was really written in (QA #52). */
async function fromCache(question: string, region: string | undefined, voice: Voice): Promise<Answer | null> {
  if (!region) return null
  try {
    const c = await fetchJson<CacheDoc>('ask_cache.json')
    const e = c.entries[`${region}|${question}|${voice}`] ?? c.entries[`${region}|${question}`]
    if (!e) return null
    return { ...e, voice: e.voice ?? 'responder', source: 'cache' }
  } catch {
    return null
  }
}

/** Ask the live analyst; on any error fall back to the saved answer for chip questions (QA #33, #55). */
export async function askFireRings(question: string, region: string | undefined, voice: Voice, mode: DataMode = 'longterm', onStep?: (s: StepEvent) => void): Promise<Answer> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 60_000) // server budget is ~55 s; never wait forever
  try {
    const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, region, voice, mode, stream: !!onStep }), signal: ac.signal })
    if (!r.ok) throw new Error(r.status === 429 ? 'Too many questions — please wait a minute' : 'The live AI is busy right now')
    if (onStep && r.body && (r.headers.get('content-type') ?? '').includes('ndjson')) {
      // QA #71: live steps while the analyst works
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
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
          if (ev.type === 'step') onStep(ev as StepEvent)
          else if (ev.type === 'answer') return { ...ev, question, source: 'live' }
          else if (ev.type === 'error') throw new Error('The live AI is busy right now')
        }
      }
      throw new Error('The live AI is busy right now')
    }
    const j = await r.json().catch(() => ({}))
    if (j.error) throw new Error('The live AI is busy right now')
    return { ...j, question, source: 'live' }
  } catch (e) {
    const cached = await fromCache(question, region, voice)
    // saved answers are Long-term; in High detail they are still shown, clearly labelled with their mode
    if (cached) {
      if (onStep) await replaySteps(cached.trace, onStep)
      return { ...cached, mode: 'longterm' }
    }
    throw new Error((e as Error).name === 'AbortError' ? 'The live AI did not answer within a minute' : (e as Error).message || 'The live AI is busy right now')
  } finally {
    clearTimeout(timer)
  }
}
