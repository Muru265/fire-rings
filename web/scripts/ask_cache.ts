// Precompute answers for the 4 chips × 4 regions (responder voice) → public/data/v1/ask_cache.json.
// The frontend uses these if /api/ask errors or is rate-limited. Only verified answers are cached.
// Usage: npx tsx --env-file=../.env scripts/ask_cache.ts                       (all 16)
//        npx tsx --env-file=../.env scripts/ask_cache.ts --only "mauritius|Is this month unusual?","punjab|*"
// Existing entries are kept unless regenerated. Flash-Lite is tried first (lowest quota pressure); 429s back off.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FALLBACK_MODELS, ask } from '../api/_lib/core.js'
import type { AskResult } from '../api/_lib/core.js'
import { DATA, apiKey, load, sleep } from './ask_local.js'

export const CHIPS = ['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?']
const models = [...new Set(['gemini-3.5-flash-lite', ...FALLBACK_MODELS, process.env.GEMINI_MODEL].filter(Boolean) as string[])]
const onlyArg = process.argv.indexOf('--only')
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',').map((s) => s.trim()) : null
const wanted = (key: string) => !only || only.some((o) => o === key || (o.endsWith('|*') && key.startsWith(o.slice(0, -1))))

const meta = await load('meta.json')
const path = resolve(DATA, 'ask_cache.json')
type Entry = AskResult & { question: string; region: string; generated: string }
let entries: Record<string, Entry> = {}
try { entries = JSON.parse(await readFile(path, 'utf-8')).entries ?? {} } catch { /* new cache */ }

const failed: string[] = []
for (const r of meta.regions as { id: string }[]) {
  for (const q of CHIPS) {
    const key = `${r.id}|${q}`
    if (!wanted(key)) continue
    let out: AskResult | null = null
    for (let a = 0, wait = 4000; a < 6 && !(out && out.verified); a++, wait *= 2) {
      try { out = await ask({ apiKey: apiKey(), models, load, question: q, voice: 'responder', region: r.id }) } catch (e) {
        console.log(`retry ${a + 1} in ${wait / 1000}s`, key, (e as Error).message.slice(0, 70))
        await sleep(wait)
      }
    }
    if (out?.verified) {
      entries[key] = { ...out, trace: out.trace.map((t) => ({ ...t, result: undefined })), question: q, region: r.id, generated: new Date().toISOString() }
      console.log('cached', key, '·', out.model)
    } else { failed.push(key); console.log('SKIPPED (not verified / quota)', key) }
    await sleep(1500)
  }
}
await writeFile(path, JSON.stringify({ data_end: meta.data_end, chips: CHIPS, entries }), 'utf-8')
console.log(`cache now has ${Object.keys(entries).length}/16 answers${failed.length ? `; missing: ${failed.join(' · ')}` : ''}`)
