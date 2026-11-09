// POST /api/ask  { question, region?, voice?: 'responder' | 'scientist' }  →  { answer, caveat, trace, model, verified }
// Gemini function calling over the published region JSON. Key only from Vercel env (GEMINI_API_KEY, GEMINI_MODEL).
import { FALLBACK_MODELS, ask } from './_lib/core.js'
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
  let body: { question?: string; region?: string; voice?: Voice }
  try { body = await req.json() } catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }
  const question = String(body.question ?? '').trim().slice(0, 500)
  if (!question) return Response.json({ error: 'empty_question' }, { status: 400 })
  const voice: Voice = body.voice === 'scientist' ? 'scientist' : 'responder'
  const region = body.region && /^[a-z_]{2,32}$/.test(body.region) ? body.region : undefined
  const origin = new URL(req.url).origin
  const load = async (p: string) => {
    const r = await fetch(`${origin}/data/v1/${p}`)
    if (!r.ok) throw new Error(`data ${p}: ${r.status}`)
    return r.json()
  }
  const models = [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean) as string[])]
  try {
    const out = await ask({ apiKey: key, models, load, question, voice, region })
    return Response.json(out, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('ask failed', (e as Error).message)
    return Response.json({ error: 'model_error', message: 'The AI service is unavailable right now.' }, { status: 502 })
  }
}
