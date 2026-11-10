// POST /api/ask  { question, region?, voice?: 'responder'|'scientist', mode?: 'longterm'|'detail' }
//   → { answer, caveat, trace, model, verified, voice, region, mode, switched_region? }
// Gemini function calling over the published region JSON. Key only from Vercel env (GEMINI_API_KEY, GEMINI_MODEL).
// Logs: one JSON line per model call / tool / result with timings and an error class — never key material (QA #59).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FALLBACK_MODELS, ask, classify } from './_lib/core.js'
import type { Voice } from './_lib/core.js'

// simple per-IP rate limit (per warm instance): 8 requests / minute, 60 / hour
const hits = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000)
  arr.push(now)
  hits.set(ip, arr)
  if (hits.size > 5000) hits.clear()
  return arr.filter((t) => now - t < 60_000).length > 8 || arr.length > 60
}

export async function POST(req: Request): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (limited(ip)) return Response.json({ error: 'rate_limited', message: 'Too many questions — please wait a minute.' }, { status: 429 })
  const key = process.env.GEMINI_API_KEY
  if (!key) return Response.json({ error: 'not_configured' }, { status: 503 })
  let body: { question?: string; region?: string; voice?: Voice; mode?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }
  const question = String(body.question ?? '').trim().slice(0, 500)
  if (!question) return Response.json({ error: 'empty_question' }, { status: 400 })
  const voice: Voice = body.voice === 'scientist' ? 'scientist' : 'responder'
  const mode = body.mode === 'detail' ? 'detail' : 'longterm'
  const region = body.region && /^[a-z_]{2,32}$/.test(body.region) ? body.region : undefined
  const origin = new URL(req.url).origin
  const load = async (p: string) => {
    // data is bundled with the function (vercel.json includeFiles); fall back to a short-timeout fetch
    for (const base of [join(process.cwd(), 'public', 'data', 'v1'), join(process.cwd(), 'web', 'public', 'data', 'v1')]) {
      try { return JSON.parse(await readFile(join(base, p), 'utf-8')) } catch { /* try next */ }
    }
    const r = await fetch(`${origin}/data/v1/${p}`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`data ${p}: ${r.status}`)
    return r.json()
  }
  const models = [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean) as string[])]
  const log = (e: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'ask', ...e }))
  try {
    const out = await Promise.race([
      ask({ apiKey: key, models, load, question, voice, region, mode, log }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout: request budget exceeded')), 57_000)),
    ])
    return Response.json(out, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    const cls = classify(String((e as Error).message))
    log({ ev: 'failed', error_class: cls })
    return Response.json({ error: 'model_error', error_class: cls, message: 'The AI service is unavailable right now.' }, { status: 502 })
  }
}
