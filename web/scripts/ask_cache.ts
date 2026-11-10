// Precompute answers for 4 chips × 4 regions × 2 styles → public/data/v1/ask_cache.json (keys "region|question|voice").
// The frontend uses these if /api/ask errors or is rate-limited (QA #33). Only verified answers are cached.
// Usage: npx tsx --env-file=../.env scripts/ask_cache.ts [--only "mauritius|*"]   (existing entries kept unless regenerated)
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FALLBACK_MODELS, ask } from '../api/_lib/core.js'
import type { AskResult, Voice } from '../api/_lib/core.js'
import { DATA, apiKey, load, sleep } from './ask_local.js'

export const CHIPS = ['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?']
const VOICES: Voice[] = ['responder', 'scientist']
const models = [...new Set(['gemini-3.5-flash-lite', 'gemini-3-flash-preview', ...FALLBACK_MODELS, process.env.GEMINI_MODEL].filter(Boolean) as string[])]
const onlyArg = process.argv.indexOf('--only')
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',').map((s) => s.trim()) : null
const wanted = (key: string) => !only || only.some((o) => key === o || key.startsWith(o.replace(/\*$/, '')))

const meta = await load('meta.json')
const path = resolve(DATA, 'ask_cache.json')
type Entry = AskResult & { question: string; generated: string }
let entries: Record<string, Entry> = {}
try { entries = JSON.parse(await readFile(path, 'utf-8')).entries ?? {} } catch { /* new cache */ }
for (const k of Object.keys(entries)) if (k.split('|').length !== 3) delete entries[k]   // old style-less keys

const failed: string[] = []
for (const r of meta.regions as { id: string }[]) {
  for (const q of CHIPS) {
    for (const voice of VOICES) {
      const key = `${r.id}|${q}|${voice}`
      if (!wanted(key)) continue
      let out: AskResult | null = null
      for (let a = 0, wait = 4000; a < 6 && !(out && out.verified); a++, wait *= 2) {
        try { out = await ask({ apiKey: apiKey(), models, load, question: q, voice, region: r.id, perModelMs: 20_000 }) } catch (e) {
          console.log(`retry ${a + 1} in ${wait / 1000}s`, key, (e as Error).message.slice(0, 70))
          await sleep(wait)
        }
      }
      if (out?.verified) {
        entries[key] = { ...out, trace: out.trace.map((t) => ({ ...t, result: undefined })), timings: undefined, question: q, generated: new Date().toISOString() }
        console.log('cached', key, '·', out.model)
      } else { failed.push(key); console.log('SKIPPED (not verified / quota)', key) }
      await sleep(1200)
    }
  }
}
await writeFile(path, JSON.stringify({ data_end: meta.data_end, chips: CHIPS, voices: VOICES, entries }), 'utf-8')
console.log(`cache now has ${Object.keys(entries).length}/32 answers${failed.length ? `; missing: ${failed.join(' · ')}` : ''}`)
