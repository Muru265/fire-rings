// GET /api/watch[?brief=1][&stream=1]   Fire Watch — rules decide, AI explains.
//   Monitoring agent (deterministic): month rules from the pipeline (watch.json, pipeline/09_watch.py) + a live rule on the
//   last-72 h NASA FIRMS detections (/api/live). Briefing agent (Gemini function calling, the Ask tools): a Responder briefing
//   per flagged region, every number verified server-side (rejected + regenerated once, else the saved briefing is used).
//   stream=1 → NDJSON {type:'step'|'region'|'briefing'|'done'} so the page can show the agent's steps live.
// Keys only from env (GEMINI_API_KEY); never logged. Situational awareness, not an emergency alert service.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FALLBACK_MODELS, ask, classify } from './_lib/core.js'
import { briefingQuestion, checkSteps, liveCheck, rejectReason, worst } from './_lib/watch.js'
import type { Briefing, Check, WatchDoc } from './_lib/watch.js'

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const brief = url.searchParams.get('brief') === '1'
  const streamOut = url.searchParams.get('stream') === '1'
  const origin = url.origin
  const load = async (p: string) => {
    for (const base of [join(process.cwd(), 'public', 'data', 'v1'), join(process.cwd(), 'web', 'public', 'data', 'v1')]) {
      try { return JSON.parse(await readFile(join(base, p), 'utf-8')) } catch { /* try next */ }
    }
    const r = await fetch(`${origin}/data/v1/${p}`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`data ${p}: ${r.status}`)
    return r.json()
  }
  const log = (e: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'watch', ...e }))
  const t0 = Date.now()

  const run = async (send: (o: Record<string, unknown>) => void) => {
    const w: WatchDoc = await load('watch.json')
    const saved: { briefings: Record<string, Omit<Briefing, 'source'>> } = await load('watch_cache.json').catch(() => ({ briefings: {} }))
    const key = process.env.GEMINI_API_KEY
    const models = [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean) as string[])]
    // live counts in parallel (10 s each); a failed feed never blocks the record rules
    const live = Object.fromEntries(await Promise.all(Object.keys(w.regions).map(async (id) => {
      try {
        const r = await fetch(`${origin}/api/live?region=${id}`, { signal: AbortSignal.timeout(10_000) })
        const j = await r.json()
        return [id, j?.ok ? Number(j.count) : null] as const
      } catch { return [id, null] as const }
    })))
    send({ type: 'step', kind: 'info', text: `Rules: far above normal > P${w.rules.far_above_pct}, alert = above every baseline year, far below < P${w.rules.far_below_pct}, live spike ≥ ${w.rules.live_spike_ratio}× expected; low-activity guard first.` })
    // 1) rules for every region (deterministic, instant)
    const flagged: { id: string; reg: WatchDoc['regions'][string]; status: ReturnType<typeof worst>; checks: Check[] }[] = []
    for (const [id, reg] of Object.entries(w.regions)) {
      const checks: Check[] = [...reg.checks, liveCheck(reg, live[id], w.rules, w.rule_text)]
      for (const text of checkSteps(reg.name, checks)) send({ type: 'step', region: id, kind: 'rule', text })
      const status = worst(checks)
      send({ type: 'step', region: id, kind: 'status', text: `Status: ${status} — ${reg.name.split(' (')[0]}` })
      send({ type: 'region', region: id, status, checks, relevant_for: reg.relevant_for, flags: reg.flags })
      if (brief && status !== 'Normal') flagged.push({ id, reg, status, checks })
    }
    // 2) briefings for flagged regions in parallel (#74: faster); facts + caveat only, numbers verified, no forecast/opinion
    await Promise.all(flagged.map(async ({ id, reg, status, checks }) => {
      let b: Briefing | null = null
      let why = ''
      if (key && Date.now() - t0 < 38_000) {
        send({ type: 'step', region: id, kind: 'model', text: `${reg.name.split(' (')[0]}: asking the briefing agent (Gemini, Ask tools)…` })
        for (let attempt = 0; attempt < 2 && !b && Date.now() - t0 < 45_000; attempt++) {
          try {
            const out = await ask({ apiKey: key, models, load, question: briefingQuestion(reg.name, reg, status, checks), voice: 'responder', region: id, mode: 'longterm',
              perModelMs: 12_000, budgetMs: Math.max(5000, 52_000 - (Date.now() - t0)), log, onStep: (s) => send({ type: 'step', region: id, ...s }) })
            const reason = out.verified ? rejectReason(out.answer) : null
            if (!out.verified) { why = 'a number was not in the lookups'; send({ type: 'step', region: id, kind: 'verify', ok: false, text: 'Rejected (a number was not in the lookups) — regenerating…' }) }
            else if (reason) { why = reason === 'forecast' ? 'it sounded like a forecast' : 'it gave an opinion or advice'; send({ type: 'step', region: id, kind: 'verify', ok: false, text: `Rejected (${why}) — regenerating…` }) }
            else b = { answer: out.answer, caveat: out.caveat, trace: out.trace.map((t) => ({ tool: t.tool, args: t.args, result_summary: t.result_summary })), verified: true, model: out.model, source: 'live' }
          } catch (e) {
            why = 'the AI service did not answer in time'
            log({ ev: 'brief_failed', region: id, error_class: classify(String((e as Error).message)) })
            break
          }
        }
      } else why = key ? 'out of time for a live briefing' : 'the AI service is not configured'
      if (!b && saved.briefings[`${id}|responder`]) {
        const sv = saved.briefings[`${id}|responder`]
        b = { ...sv, source: 'saved' }
        send({ type: 'step', region: id, kind: 'info', text: `${reg.name.split(' (')[0]}: saved briefing used${why ? ` (${why})` : ''} — verified when it was made${sv.generated ? ` on ${sv.generated.slice(0, 10)}` : ''}` })
      }
      if (b) send({ type: 'briefing', region: id, voice: 'responder', briefing: b })
    }))
    send({ type: 'done', ms: Date.now() - t0, data_end: w.data_end })
  }

  if (streamOut) {
    const enc = new TextEncoder()
    const stream = new ReadableStream({
      async start(ctrl) {
        const send = (o: Record<string, unknown>) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'))
        try { await run(send) } catch (e) { log({ ev: 'failed', error_class: classify(String((e as Error).message)) }); send({ type: 'error', message: 'Fire Watch is unavailable right now.' }) }
        finally { ctrl.close() }
      },
    })
    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
  }
  const events: Record<string, unknown>[] = []
  try { await run((o) => events.push(o)) } catch { return Response.json({ error: 'unavailable' }, { status: 502 }) }
  return Response.json({ regions: events.filter((e) => e.type === 'region'), briefings: events.filter((e) => e.type === 'briefing') }, { headers: { 'cache-control': 'no-store' } })
}
