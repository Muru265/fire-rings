// Time one Ask call per model. Usage: npx tsx --env-file=../.env scripts/ask_one.ts "question" [region]
import { ask } from '../api/_lib/core.js'
import { apiKey, load, models } from './ask_local.js'

const [q = 'Is this month unusual?', region = 'punjab'] = process.argv.slice(2)
for (const m of models) {
  const t0 = Date.now()
  try {
    const r = await ask({ apiKey: apiKey(), models: [m], load, question: q, voice: 'responder', region })
    console.log(`${m}: ${((Date.now() - t0) / 1000).toFixed(1)}s verified=${r.verified} tools=${r.trace.map((t) => t.tool)}\n  ${r.answer}\n  caveat: ${r.caveat}`)
  } catch (e) {
    console.log(`${m}: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s — ${(e as Error).message.slice(0, 160)}`)
  }
}
