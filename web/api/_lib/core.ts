// Ask Fire Rings — agent loop (Gemini function calling) + number verification. Shared by api/ask.ts and scripts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenAI } from '@google/genai'
import { TOOL_DECLARATIONS, runTool } from '../tools.js'
import type { Loader } from '../tools.js'

export type Voice = 'responder' | 'scientist'
export interface TraceItem { tool: string; args: Record<string, unknown>; result_summary: string; result: unknown }
export interface AskResult { answer: string; caveat: string; trace: TraceItem[]; model: string; verified: boolean; unverified_numbers?: string[] }

export const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash']

function systemPrompt(voice: Voice, region?: string) {
  return `You are "Ask Fire Rings", an analyst for a harmonized 25-year satellite fire record (NASA FIRMS MODIS + VIIRS).
Rules — follow all of them:
1. Call tools to get data before answering. Use ONLY numbers that appear in tool results in this conversation. Never compute new numbers (no sums, differences, percentages or unit conversions of your own). Never round to a different value than the tool gave. If a number is not in a tool result, do not write it.
2. Units: say "fire-days" (MODIS-equivalent). Ratios like "0.1× typical". Percentiles as given (e.g. "88th–97th percentile").
3. ${voice === 'responder' ? 'Responder voice: at most 4 short, plain sentences for a firefighter or land manager.' : 'Scientist voice: at most 8 sentences; include the 90% interval, the baseline period and the method/validation numbers when relevant.'}
4. Never forecast. Similar years are "analogues", not predictions.
5. If data is missing or a region is not available, say so and list the available regions (call list_regions).
6. If low_activity_guard is true, say there is too little fire to judge against normal instead of quoting a ratio.
7. Mention "provisional" when the month is flagged provisional or month-to-date.
${region ? `8. The user is currently looking at region id "${region}"; use it unless they name another region.` : ''}
Output format, exactly two lines:
ANSWER: <your answer>
CAVEAT: <one short caveat (provisional data / low activity / MODIS-equivalent units / uncertainty)>`
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
    else if (x && typeof x === 'object') Object.values(x).forEach(walk)
  }
  trace.forEach((t) => walk(t.result))
  numbersIn(question).forEach((n) => add(Number(n)))
  for (let i = 0; i <= 12; i++) allowed.add(String(i)) // small counting words / list positions ("3 years", "top 3")
  allowed.add('90') // the interval level named in tool keys
  allowed.add('36') // "~36 km²" cell size is in tool units text, kept explicit
  return allowed
}

export function unverified(text: string, allowed: Set<string>): string[] {
  return numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))))
}

function summarize(name: string, result: any): string {
  if (result?.error) return `error: ${result.error}`
  const s = JSON.stringify(result)
  return s.length > 220 ? `${s.slice(0, 217)}…` : s
}

function parse(text: string): { answer: string; caveat: string } {
  const a = text.match(/ANSWER:\s*([\s\S]*?)(?:\n\s*CAVEAT:|$)/i)
  const c = text.match(/CAVEAT:\s*([\s\S]*)$/i)
  return { answer: (a?.[1] ?? text).trim(), caveat: (c?.[1] ?? '').trim() }
}

export async function ask(opts: { apiKey: string; models: string[]; load: Loader; question: string; voice: Voice; region?: string; maxSteps?: number }): Promise<AskResult> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })
  const trace: TraceItem[] = []
  const config = {
    systemInstruction: systemPrompt(opts.voice, opts.region),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
    temperature: 0.2,
  }
  const contents: any[] = [{ role: 'user', parts: [{ text: opts.question }] }]
  let lastErr: unknown = null

  for (const model of opts.models) {
    try {
      trace.length = 0
      contents.length = 1
      let text = ''
      for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
        const res = await ai.models.generateContent({ model, contents, config })
        const calls = res.functionCalls ?? []
        if (!calls.length) { text = res.text ?? ''; break }
        contents.push(res.candidates?.[0]?.content ?? { role: 'model', parts: calls.map((c) => ({ functionCall: c })) })
        const parts = []
        for (const c of calls) {
          const result = await runTool(opts.load, c.name ?? '', c.args ?? {})
          trace.push({ tool: c.name ?? '', args: (c.args ?? {}) as Record<string, unknown>, result_summary: summarize(c.name ?? '', result), result })
          parts.push({ functionResponse: { name: c.name, response: { result } } })
        }
        contents.push({ role: 'user', parts })
      }
      let out = parse(text)
      const allowed = allowedNumbers(trace, opts.question)
      let bad = unverified(`${out.answer} ${out.caveat}`, allowed)
      if (bad.length) {
        // one correction round, then give up honestly
        contents.push({ role: 'model', parts: [{ text }] })
        contents.push({ role: 'user', parts: [{ text: `Your answer used numbers that are not in any tool result: ${bad.join(', ')}. Rewrite it using only numbers that appear verbatim in the tool results. Keep the two-line format.` }] })
        const res = await ai.models.generateContent({ model, contents, config: { ...config, tools: undefined } })
        out = parse(res.text ?? '')
        bad = unverified(`${out.answer} ${out.caveat}`, allowed)
      }
      if (bad.length) {
        return { answer: 'I could not produce an answer that uses only verified numbers. Please see the "Numbers used" panel for the data I retrieved.',
          caveat: 'Answer withheld because it contained unverified numbers.', trace, model, verified: false, unverified_numbers: bad }
      }
      return { ...out, trace, model, verified: true }
    } catch (e) {
      lastErr = e
      const msg = String((e as Error)?.message ?? e)
      if (!/503|429|404|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|overloaded|high demand/i.test(msg)) throw e
    }
  }
  throw lastErr ?? new Error('all models failed')
}
