// Precompute Fire Watch briefings for the current data (fallback when the live AI is busy; labelled "⚡ saved briefing").
// Only regions the rules flag (status ≠ Normal) get a briefing; only verified answers are saved.
// Usage: npx tsx --env-file=../.env scripts/watch_cache.ts [--only nt_savanna,ne_india,tanzania]
// Daily job (.github/workflows/daily.yml): --only <regions whose Fire Watch status changed>; GEMINI_API_KEY from the env.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FALLBACK_MODELS, ask } from '../api/_lib/core.js'
import { briefingQuestion, rejectReason, worst } from '../api/_lib/watch.js'
import type { WatchDoc } from '../api/_lib/watch.js'
import { apiKey, load, sleep } from './ask_local.js'

const here = dirname(fileURLToPath(import.meta.url))
const models = [...new Set(['gemini-3.5-flash-lite', ...FALLBACK_MODELS])]
const w: WatchDoc = await load('watch.json')
// --only id,id: regenerate just these regions and keep every other saved briefing (Round 5B: new regions only)
// --missing (Round 8, .github/workflows/fill_ai.yml): only flagged regions/voices WITHOUT a saved briefing; stop at the first
// quota error and leave the rest for the next run; write the file only if something new was saved (prints FILLED=<n>).
const MISSING = process.argv.includes('--missing')
const isQuota = (m: string) => /\b429\b|quota|RESOURCE_EXHAUSTED/i.test(m)
const cacheFile = JSON.parse(await readFile(resolve(here, '../public/data/v1/watch_cache.json'), 'utf-8').catch(() => '{}'))
const onlyArg = process.argv.indexOf('--only')
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null
const prev = only || MISSING ? cacheFile.briefings ?? {} : {}
const briefings: Record<string, unknown> = MISSING ? { ...prev } : Object.fromEntries(Object.entries(prev).filter(([k]) => !only!.includes(k.split('|')[0])))
let filled = 0
let quotaHit = false
regions: for (const [id, reg] of Object.entries(w.regions)) {
  if (only && !only.includes(id)) continue
  const status = worst(reg.checks)
  if (status === 'Normal') { console.log(`${id}: Normal — no briefing`); continue }
  for (const voice of ['responder', 'scientist'] as const) {
    if (MISSING && prev[`${id}|${voice}`]) continue
    let saved = false
    for (let a = 0; a < (MISSING ? 3 : 5) && !saved; a++) {
      try {
        const out = await ask({ apiKey: apiKey(), models, load, question: briefingQuestion(reg.name, reg, status, reg.checks), voice, region: id, mode: 'longterm', perModelMs: 20_000 })
        if (!out.verified) { console.log(`${id}|${voice}: unverified, retrying`); continue }
        const rr = rejectReason(out.answer)
        if (rr) { console.log(`${id}|${voice}: rejected (${rr}), retrying: ${out.answer.slice(0, 120)}`); continue }
        briefings[`${id}|${voice}`] = { answer: out.answer, caveat: out.caveat, verified: true, model: out.model, generated: new Date().toISOString(), status,
          trace: out.trace.map((t) => ({ tool: t.tool, args: t.args, result_summary: t.result_summary, result: t.result })) }
        console.log(`${id}|${voice}: saved · ${out.model}`)
        saved = true
        filled++
      } catch (e) {
        const msg = (e as Error).message
        if (MISSING && isQuota(msg)) { console.log(`QUOTA — stopping at ${id}|${voice}; the rest is left for the next run`); quotaHit = true; break regions }
        console.log(`${id}|${voice}: ${msg.slice(0, 80)}`); await sleep(4000)
      }
    }
    // Gemini failed or every answer was rejected → keep the previous saved briefing (never an empty or made-up one)
    if (!saved && prev[`${id}|${voice}`]) { briefings[`${id}|${voice}`] = prev[`${id}|${voice}`]; console.log(`${id}|${voice}: kept previous saved briefing`) }
    await sleep(1500)
  }
}
if (!MISSING || filled > 0)
  await writeFile(resolve(here, '../public/data/v1/watch_cache.json'), JSON.stringify({ data_end: w.data_end, generated: new Date().toISOString(), briefings }, null, 1))
console.log(`watch_cache: ${Object.keys(briefings).length} briefings`)
if (MISSING) console.log(`FILLED=${filled}${quotaHit ? ' (stopped at quota)' : ''}`)
