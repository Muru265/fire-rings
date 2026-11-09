// Precompute answers for the 4 chips × 4 regions (responder voice) → public/data/v1/ask_cache.json.
// The frontend uses these if /api/ask errors or is rate-limited. Only verified answers are cached.
// Usage: npx tsx --env-file=../.env scripts/ask_cache.ts
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ask } from '../api/_lib/core.js'
import type { AskResult } from '../api/_lib/core.js'
import { DATA, apiKey, load, models, sleep } from './ask_local.js'

export const CHIPS = ['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?']
const meta = await load('meta.json')
const entries: Record<string, AskResult & { question: string; region: string; generated: string }> = {}
for (const r of meta.regions as { id: string }[]) {
  for (const q of CHIPS) {
    let out: AskResult | null = null
    for (let a = 0; a < 4 && !(out && out.verified); a++) {
      try { out = await ask({ apiKey: apiKey(), models, load, question: q, voice: 'responder', region: r.id }) } catch (e) { console.log('retry', r.id, q, (e as Error).message.slice(0, 80)); await sleep(5000) }
    }
    if (out?.verified) {
      entries[`${r.id}|${q}`] = { ...out, trace: out.trace.map((t) => ({ ...t, result: undefined })), question: q, region: r.id, generated: new Date().toISOString() }
      console.log('cached', r.id, '|', q)
    } else console.log('SKIPPED (not verified)', r.id, q)
    await sleep(1200)
  }
}
await writeFile(resolve(DATA, 'ask_cache.json'), JSON.stringify({ data_end: meta.data_end, chips: CHIPS, entries }), 'utf-8')
console.log(`wrote ${Object.keys(entries).length} cached answers`)
