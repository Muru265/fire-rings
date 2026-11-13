// Precompute answers for 4 chips × every published region (meta.json) × 2 styles → public/data/v1/ask_cache.json (keys "region|question|voice").
// The frontend uses these if /api/ask errors or is rate-limited (QA #33). Only verified answers are cached.
// Keys "region|question|voice" (Long-term) and "region|question|voice|detail" (High detail, #85).
// Usage: npx tsx --env-file=../.env scripts/ask_cache.ts [--mode longterm|detail|both] [--only "mauritius|*"]   (existing entries kept unless regenerated)
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FALLBACK_MODELS, ask } from '../api/_lib/core.js'
import type { AskResult, Voice } from '../api/_lib/core.js'
import type { Mode } from '../api/tools.js'
import { DATA, apiKey, load, sleep } from './ask_local.js'

export const CHIPS = ['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?']
const VOICES: Voice[] = ['responder', 'scientist']
const models = [...new Set(['gemini-3.5-flash-lite', 'gemini-3-flash-preview', ...FALLBACK_MODELS, process.env.GEMINI_MODEL].filter(Boolean) as string[])]
const modeArg = process.argv.indexOf('--mode')
const MODES: Mode[] = modeArg > 0 && process.argv[modeArg + 1] !== 'both' ? [process.argv[modeArg + 1] as Mode] : ['longterm', 'detail']
const onlyArg = process.argv.indexOf('--only')
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',').map((s) => s.trim()) : null
// exact key, or a prefix when it ends in * (Round 6: a plain key no longer also matches its '|detail' twin)
const wanted = (key: string) => !only || only.some((o) => (o.endsWith('*') ? key.startsWith(o.slice(0, -1)) : key === o))

const meta = await load('meta.json')
const path = resolve(DATA, 'ask_cache.json')
type Entry = AskResult & { question: string; generated: string }
let entries: Record<string, Entry> = {}
try { entries = JSON.parse(await readFile(path, 'utf-8')).entries ?? {} } catch { /* new cache */ }
for (const k of Object.keys(entries)) if (![3, 4].includes(k.split('|').length)) delete entries[k]   // old style-less keys

const failed: string[] = []
for (const r of meta.regions as { id: string }[]) {
  for (const q of CHIPS) {
    for (const voice of VOICES) for (const mode of MODES) {
      const key = `${r.id}|${q}|${voice}${mode === 'detail' ? '|detail' : ''}`
      if (!wanted(key)) continue
      let out: AskResult | null = null
      for (let a = 0, wait = 4000; a < 6 && !(out && out.verified); a++, wait *= 2) {
        try { out = await ask({ apiKey: apiKey(), models, load, question: q, voice, region: r.id, mode, perModelMs: 20_000 }) } catch (e) {
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
await writeFile(path, JSON.stringify({ data_end: meta.data_end, chips: CHIPS, voices: VOICES, modes: ['longterm', 'detail'], entries }), 'utf-8')
console.log(`cache now has ${Object.keys(entries).length}/${meta.regions.length * CHIPS.length * VOICES.length * 2} answers${failed.length ? `; missing: ${failed.join(' · ')}` : ''}`)
