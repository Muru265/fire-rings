// Precompute Fire Watch briefings for the current data (fallback when the live AI is busy; labelled "⚡ saved briefing").
// Only regions the rules flag (status ≠ Normal) get a briefing; only verified answers are saved.
// Usage: npx tsx --env-file=../.env scripts/watch_cache.ts
import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FALLBACK_MODELS, ask } from '../api/_lib/core.js'
import { briefingQuestion, looksLikeForecast, worst } from '../api/_lib/watch.js'
import type { WatchDoc } from '../api/_lib/watch.js'
import { apiKey, load, sleep } from './ask_local.js'

const here = dirname(fileURLToPath(import.meta.url))
const models = [...new Set(['gemini-3.5-flash-lite', ...FALLBACK_MODELS])]
const w: WatchDoc = await load('watch.json')
const briefings: Record<string, unknown> = {}
for (const [id, reg] of Object.entries(w.regions)) {
  const status = worst(reg.checks)
  if (status === 'Normal') { console.log(`${id}: Normal — no briefing`); continue }
  for (const voice of ['responder', 'scientist'] as const) {
    let saved = false
    for (let a = 0; a < 3 && !saved; a++) {
      try {
        const out = await ask({ apiKey: apiKey(), models, load, question: briefingQuestion(reg.name, reg, status, reg.checks), voice, region: id, mode: 'longterm', perModelMs: 20_000 })
        if (!out.verified) { console.log(`${id}|${voice}: unverified, retrying`); continue }
        if (looksLikeForecast(out.answer)) { console.log(`${id}|${voice}: sounded like a forecast, retrying`); continue }
        briefings[`${id}|${voice}`] = { answer: out.answer, caveat: out.caveat, verified: true, model: out.model, generated: new Date().toISOString(), status,
          trace: out.trace.map((t) => ({ tool: t.tool, args: t.args, result_summary: t.result_summary, result: t.result })) }
        console.log(`${id}|${voice}: saved · ${out.model}`)
        saved = true
      } catch (e) { console.log(`${id}|${voice}: ${(e as Error).message.slice(0, 80)}`); await sleep(4000) }
    }
    await sleep(1500)
  }
}
await writeFile(resolve(here, '../public/data/v1/watch_cache.json'), JSON.stringify({ data_end: w.data_end, generated: new Date().toISOString(), briefings }, null, 1))
console.log(`watch_cache: ${Object.keys(briefings).length} briefings`)
