import { fetchJson } from './api'

export type Voice = 'responder' | 'scientist'
export interface TraceItem { tool: string; args: Record<string, unknown>; result_summary: string; result?: unknown }
export interface Answer {
  question: string
  region?: string
  voice: Voice
  answer: string
  caveat: string
  trace: TraceItem[]
  model?: string
  verified?: boolean
  source: 'live' | 'cache'
  generated?: string
}

export const CHIPS = ['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?']

interface CacheDoc { data_end: string; chips: string[]; entries: Record<string, Omit<Answer, 'source' | 'voice'> & { generated: string }> }

/** Saved answer for the selected style first; the badge always shows the style the answer was really written in (QA #52). */
async function fromCache(question: string, region: string | undefined, voice: Voice): Promise<Answer | null> {
  if (!region) return null
  try {
    const c = await fetchJson<CacheDoc>('ask_cache.json')
    const e = c.entries[`${region}|${question}|${voice}`] ?? c.entries[`${region}|${question}`]
    if (!e) return null
    return { ...e, voice: (e as { voice?: Voice }).voice ?? 'responder', source: 'cache' }
  } catch {
    return null
  }
}

/** Ask the live analyst; on any error fall back to the precomputed answer for chip questions. */
export async function askFireRings(question: string, region: string | undefined, voice: Voice): Promise<Answer> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 30_000) // server budget is 25 s; never wait forever
  try {
    const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, region, voice }), signal: ac.signal })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) throw new Error(r.status === 429 ? 'Too many questions — please wait a minute' : 'AI temporarily unavailable')
    return { ...j, question, region, voice, source: 'live' }
  } catch (e) {
    const cached = await fromCache(question, region, voice)
    if (cached) return cached
    throw new Error((e as Error).name === 'AbortError' ? 'AI temporarily unavailable (no answer within 30 seconds)' : (e as Error).message || 'AI temporarily unavailable')
  } finally {
    clearTimeout(timer)
  }
}
