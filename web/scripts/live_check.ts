// Run the live-layer core locally. Usage: npx tsx --env-file=../.env scripts/live_check.ts punjab madagascar
import { readFile } from 'node:fs/promises'
import { fetchLive } from '../api/_lib/live.js'
import { DATA } from './ask_local.js'

const key = process.env.FIRMS_MAP_KEY
if (!key) throw new Error('FIRMS_MAP_KEY missing')
for (const region of process.argv.slice(2).length ? process.argv.slice(2) : ['punjab', 'madagascar', 'se_australia', 'mauritius']) {
  const file = JSON.parse(await readFile(`${DATA}/live/${region}.json`, 'utf-8'))
  const t0 = Date.now()
  const r = await fetchLive({ key, region, file })
  console.log(`${region}: ok=${r.ok} ${Date.now() - t0} ms count=${r.count} last=${r.last_acq_utc} sources=${JSON.stringify(r.sources)} dropped=${JSON.stringify(r.dropped)}`)
}
