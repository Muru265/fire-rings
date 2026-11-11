// GET /api/health → { gemini, gemini_model, gemini_tried, firms, checked_at } (QA #54)
// Classes only: ok | not_configured | invalid_key | model_not_found | quota_exceeded | timeout | unavailable | error.
// NEVER returns or logs key values. Cached 5 min per warm instance.
import { GoogleGenAI } from '@google/genai'
import { FALLBACK_MODELS, classify } from './_lib/core.js'

let cache: { t: number; body: unknown } | null = null

async function checkGemini(): Promise<{ gemini: string; gemini_model: string | null; gemini_tried: { model: string; status: string; ms: number }[] }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { gemini: 'not_configured', gemini_model: null, gemini_tried: [] }
  const ai = new GoogleGenAI({ apiKey: key, httpOptions: { retryOptions: { attempts: 1 } } as never })
  const models = [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean) as string[])]
  const tried: { model: string; status: string; ms: number }[] = []
  for (const model of models) {
    const t0 = Date.now()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 8000)
    try {
      await ai.models.generateContent({ model, contents: 'Reply with: ok', config: { abortSignal: ac.signal, maxOutputTokens: 5 } })
      tried.push({ model, status: 'ok', ms: Date.now() - t0 })
      return { gemini: 'ok', gemini_model: model, gemini_tried: tried }
    } catch (e) {
      tried.push({ model, status: classify(String((e as Error).message)), ms: Date.now() - t0 })
      if (tried.at(-1)!.status === 'invalid_key') break
    } finally {
      clearTimeout(timer)
    }
  }
  return { gemini: tried.at(-1)?.status ?? 'error', gemini_model: null, gemini_tried: tried }
}

async function checkFirms(): Promise<string> {
  const key = process.env.FIRMS_MAP_KEY
  if (!key) return 'not_configured'
  try {
    const r = await fetch(`https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${key}`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return `http_${r.status}`
    const j = (await r.json()) as { transaction_limit?: number; current_transactions?: number; status?: string }
    if (j.transaction_limit == null) return 'invalid_key'
    return (j.current_transactions ?? 0) >= j.transaction_limit ? 'quota_exceeded' : 'ok'
  } catch (e) {
    return /abort|timeout/i.test(String((e as Error).message)) ? 'timeout' : 'error'
  }
}

const CORS = { 'access-control-allow-origin': '*' }
let fcache: { t: number; firms: string } | null = null

export async function GET(req?: Request): Promise<Response> {
  // ?scope=data (P1.7, for outside apps): service status without touching Gemini — FIRMS key status + published data version
  if (req && new URL(req.url).searchParams.get('scope') === 'data') {
    if (!fcache || Date.now() - fcache.t > 5 * 60_000) fcache = { t: Date.now(), firms: await checkFirms() }
    return Response.json({ ok: true, api: 'fire-rings', version: 'v1', firms: fcache.firms, data: '/data/v1/meta.json', checked_at: new Date(fcache.t).toISOString() },
      { headers: { ...CORS, 'cache-control': 'public, max-age=60, s-maxage=300' } })
  }
  if (cache && Date.now() - cache.t < 5 * 60_000) return Response.json({ ...(cache.body as object), cached: true }, { headers: CORS })
  const [g, f] = await Promise.all([checkGemini(), checkFirms()])
  const body = { ...g, firms: f, checked_at: new Date().toISOString() }
  console.log(JSON.stringify({ fn: 'health', gemini: g.gemini, model: g.gemini_model, firms: f }))
  cache = { t: Date.now(), body }
  return Response.json(body, { headers: { ...CORS, 'cache-control': 'no-store' } })
}
