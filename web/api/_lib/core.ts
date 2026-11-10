// Ask Fire Rings — agent loop (Gemini function calling) + number verification. Shared by api/ask.ts and scripts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenAI } from '@google/genai'
import { TOOL_DECLARATIONS, regionInQuestion, runTool } from '../tools.js'
import type { Loader, Mode } from '../tools.js'

export type Voice = 'responder' | 'scientist'
export interface TraceItem { tool: string; args: Record<string, unknown>; result_summary: string; result: unknown }
export interface AskResult {
  answer: string; caveat: string; trace: TraceItem[]; model: string; verified: boolean; unverified_numbers?: string[]
  voice: Voice; region: string | null; mode: Mode; switched_region?: string; timings?: { step: string; ms: number }[]
}

// Tested with this key: gemini-flash-latest / gemini-3.8-flash often 503/504 under load, gemini-2.5-flash 404 (retired
// for new keys); these answered function calls within seconds (scripts/gemini_try.ts).
export const FALLBACK_MODELS = ['gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']

// Circuit breaker (per warm instance): a model that just timed out / was overloaded goes to the back for 10 min,
// so one slow model doesn't eat the time budget of every question.
const benchedUntil = new Map<string, number>()
export function orderModels(models: string[]): string[] {
  const now = Date.now()
  return [...models.filter((m) => (benchedUntil.get(m) ?? 0) < now), ...models.filter((m) => (benchedUntil.get(m) ?? 0) >= now)]
}

const VOICE = {
  responder: `RESPONDER style (for a firefighter, land manager or journalist): 2–3 short plain sentences. Start with the bottom line
(e.g. "Yes — far below normal: 0.1× a typical October."), then what it means in practice. No method details, no statistics jargon.`,
  scientist: `SCIENTIST style: up to 7 sentences with the SAME facts plus the uncertainty (90% range, percentile range), the baseline period,
that values are MODIS-equivalent fire-days, the calibration/validation numbers when relevant, and any flags (provisional, low activity,
Terra-only, detection-time). Point to the Proof page or METHODS.md for method details.`,
}

function systemPrompt(voice: Voice, region: string | null, mode: Mode, dataEnd?: string) {
  const now = dataEnd ? `\nData run through ${dataEnd}. "This month" means the latest month (call get_month without year/month); "this year" means ${dataEnd.slice(0, 4)}; "last October" means the most recent October before the latest month.` : ''
  return `You are "Ask Fire Rings", an analyst for a harmonized 25-year satellite fire record (NASA FIRMS MODIS + VIIRS).${now}
${region ? `The question is about region id "${region}". Use this region id in every tool call.` : 'If no region is named, ask the user to pick one and call list_regions.'}
Data mode: "${mode}" — pass mode="${mode}" to every tool that accepts it.
Pick the most direct tool so ONE lookup usually answers: a year total → get_year_total; one month → get_month; what is normal
→ get_typical; two years → compare_years; worst/biggest/lowest → get_rankings; reliability → get_quality; peak season → get_season.
Rules — follow all of them:
1. Use ONLY numbers that appear in tool results in this conversation. Never compute new numbers (no sums, differences,
   percentages or conversions). Never round differently than the tool. If a number is not in a tool result, do not write it.
2. Say "fire-days". Ratios like "0.1× typical". Percentiles as given.
3. ${VOICE[voice]}
4. Never forecast. Similar years are analogues, not predictions.
5. If too_little_fire_to_judge is true, say there is too little fire to judge against normal instead of quoting a ratio.
6. If data is missing, say so plainly.
Output format, exactly two lines:
ANSWER: <your answer>
CAVEAT: <copy ONE sentence verbatim from the "caveats" list in the tool results — the most important one>`
}

const NUM = /\d[\d,]*(?:\.\d+)?/g

function numbersIn(text: string): string[] {
  return (text.match(NUM) ?? []).map((n) => n.replace(/,/g, '')).filter((n) => n.length > 0)
}

/** Allowed numbers: every number in tool results (as given, rounded to 0/1 decimals) and in the question. */
export function allowedNumbers(trace: TraceItem[], question: string): Set<string> {
  const allowed = new Set<string>()
  const add = (v: number) => {
    allowed.add(String(v))
    allowed.add(String(Math.round(v)))
    allowed.add((Math.round(v * 10) / 10).toString())
  }
  const walk = (x: any) => {
    if (typeof x === 'number') add(x)
    else if (typeof x === 'string') numbersIn(x).forEach((n) => add(Number(n)))
    else if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') { Object.keys(x).forEach((k) => numbersIn(k).forEach((n) => add(Number(n)))); Object.values(x).forEach(walk) }
  }
  trace.forEach((t) => walk(t.result))
  numbersIn(question).forEach((n) => add(Number(n)))
  for (let i = 0; i <= 12; i++) allowed.add(String(i)) // small counting words / list positions ("3 years", "top 3")
  allowed.add('90') // the interval level named in tool keys
  return allowed
}

export function unverified(text: string, allowed: Set<string>): string[] {
  return numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))))
}

/** Every caveat sentence the tools returned, in order (QA #56). */
export function toolCaveats(trace: TraceItem[]): string[] {
  const out: string[] = []
  for (const t of trace) for (const c of ((t.result as any)?.caveats ?? []) as string[]) if (!out.includes(c)) out.push(c)
  return out
}

function summarize(result: any): string {
  if (result?.error) return `error: ${result.error}`
  const { caveats: _c, ...rest } = result ?? {}
  const s = JSON.stringify(rest)
  return s.length > 240 ? `${s.slice(0, 237)}…` : s
}

function parse(text: string): { answer: string; caveat: string } {
  const a = text.match(/ANSWER:\s*([\s\S]*?)(?:\n\s*CAVEAT:|$)/i)
  const c = text.match(/CAVEAT:\s*([\s\S]*)$/i)
  return { answer: (a?.[1] ?? text).trim(), caveat: (c?.[1] ?? '').trim() }
}

export async function ask(opts: { apiKey: string; models: string[]; load: Loader; question: string; voice: Voice; region?: string; mode?: Mode
  maxSteps?: number; perModelMs?: number; budgetMs?: number; log?: (e: Record<string, unknown>) => void }): Promise<AskResult> {
  // Time budget (QA #59): each model attempt ≤ 22 s (all its steps), whole request ≤ 55 s (Vercel maxDuration 60). No SDK retries.
  const PER = opts.perModelMs ?? 22_000
  const TOTAL = opts.budgetMs ?? 55_000
  const mode: Mode = opts.mode ?? 'longterm'
  const log = opts.log ?? (() => {})
  const t0 = Date.now()
  let mStart = t0
  const timings: { step: string; ms: number }[] = []
  const left = () => Math.min(PER - (Date.now() - mStart), TOTAL - (Date.now() - t0))
  const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { retryOptions: { attempts: 1 } } as never })
  const gen = async (model: string, contents: any[], config: any, step: string) => {
    const ms = left()
    if (ms < 1500) throw new Error('timeout: budget exhausted')
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), ms)
    const s0 = Date.now()
    try {
      return await Promise.race([
        ai.models.generateContent({ model, contents, config: { ...config, abortSignal: ac.signal } }),
        new Promise<never>((_, rej) => ac.signal.addEventListener('abort', () => rej(new Error(`timeout after ${ms} ms`)))),
      ])
    } finally {
      clearTimeout(timer)
      const d = Date.now() - s0
      timings.push({ step: `${model}:${step}`, ms: d })
      log({ ev: 'model_call', model, step, ms: d })
    }
  }
  // QA #61: a region named in the question wins over the selector
  const named = regionInQuestion(opts.question)
  const region = named ?? opts.region ?? null
  const switched = named && opts.region && named !== opts.region ? named : undefined
  const trace: TraceItem[] = []
  const config = {
    systemInstruction: systemPrompt(opts.voice, region, mode, await opts.load('meta.json').then((m: any) => m.data_end).catch(() => undefined)),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
    temperature: 0.2,
  }
  const contents: any[] = [{ role: 'user', parts: [{ text: opts.question }] }]
  let lastErr: unknown = null

  for (const model of orderModels(opts.models)) {
    if (TOTAL - (Date.now() - t0) < 3000) break
    mStart = Date.now()
    try {
      trace.length = 0
      contents.length = 1
      let text = ''
      for (let step = 0; step < (opts.maxSteps ?? 5); step++) {
        const res = await gen(model, contents, config, `step${step}`)
        const calls = res.functionCalls ?? []
        if (!calls.length) { text = res.text ?? ''; break }
        contents.push(res.candidates?.[0]?.content ?? { role: 'model', parts: calls.map((c) => ({ functionCall: c })) })
        const parts = []
        for (const c of calls) {
          const s0 = Date.now()
          const args = { ...(c.args ?? {}) } as Record<string, unknown>
          if (region && 'region' in args && named) args.region = region    // never answer one region with another's data
          if (TOOL_DECLARATIONS.find((d) => d.name === c.name)?.parameters?.properties && 'mode' in ((TOOL_DECLARATIONS.find((d) => d.name === c.name)!.parameters as any).properties)) args.mode = mode
          const result = await runTool(opts.load, c.name ?? '', args)
          timings.push({ step: `tool:${c.name}`, ms: Date.now() - s0 })
          log({ ev: 'tool', tool: c.name, ms: Date.now() - s0 })
          trace.push({ tool: c.name ?? '', args, result_summary: summarize(result), result })
          parts.push({ functionResponse: { name: c.name, response: { result } } })
        }
        contents.push({ role: 'user', parts })
      }
      let out = parse(text)
      if (!out.answer) throw new Error('empty answer from model') // retryable: try the next model
      const allowed = allowedNumbers(trace, opts.question)
      let bad = unverified(out.answer, allowed)
      if (bad.length) {
        contents.push({ role: 'model', parts: [{ text }] })
        contents.push({ role: 'user', parts: [{ text: `Your answer used numbers that are not in any tool result: ${bad.join(', ')}. Rewrite it using only numbers that appear verbatim in the tool results. Keep the two-line format.` }] })
        const res = await gen(model, contents, { ...config, tools: undefined }, 'correction')
        out = parse(res.text ?? '')
        if (!out.answer) throw new Error('empty answer from model after correction')
        bad = unverified(out.answer, allowed)
      }
      // QA #56: the caveat line is always one full sentence from the tools' fixed caveat list
      const cav = toolCaveats(trace)
      const caveat = cav.find((c) => out.caveat && (c === out.caveat || out.caveat.includes(c) || c.includes(out.caveat))) ?? cav[0] ?? ''
      const base = { voice: opts.voice, region, mode, ...(switched ? { switched_region: switched } : {}), timings }
      log({ ev: 'done', model, total_ms: Date.now() - t0, verified: !bad.length })
      if (bad.length) {
        return { answer: 'I could not produce an answer that uses only verified numbers. Please see the "Numbers used" panel for the data I retrieved.',
          caveat: 'Answer withheld because it contained unverified numbers.', trace, model, verified: false, unverified_numbers: bad, ...base }
      }
      return { answer: out.answer, caveat, trace, model, verified: true, ...base }
    } catch (e) {
      lastErr = e
      const msg = String((e as Error)?.message ?? e)
      const cls = classify(msg)
      log({ ev: 'model_error', model, error_class: cls })
      if (cls === 'timeout' || cls === 'unavailable' || cls === 'quota_exceeded' || cls === 'model_not_found') benchedUntil.set(model, Date.now() + 10 * 60_000)
      if (!/503|504|429|404|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|DEADLINE|overloaded|high demand|timed? ?out|abort|empty answer|budget/i.test(msg)) throw e
    }
  }
  throw lastErr ?? new Error('all models failed')
}

/** Error class for logs/health — never contains key material. */
export function classify(msg: string): 'invalid_key' | 'model_not_found' | 'quota_exceeded' | 'timeout' | 'unavailable' | 'error' {
  if (/API[_ ]?KEY|API key not valid|PERMISSION_DENIED|401|403/i.test(msg)) return 'invalid_key'
  if (/404|NOT_FOUND|not found/i.test(msg)) return 'model_not_found'
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'quota_exceeded'
  if (/timeout|timed out|DEADLINE|abort|504/i.test(msg)) return 'timeout'
  if (/503|UNAVAILABLE|overloaded|high demand/i.test(msg)) return 'unavailable'
  return 'error'
}
