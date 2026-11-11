// Screenshot each companion app page in embed mode (the Use Cases fallback images) → public/use-cases/{page}.png.
// Usage: node scripts/usecase_shots.mjs [companionBaseUrl]
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../public/use-cases')
mkdirSync(out, { recursive: true })
const base = process.argv[2] ?? 'https://fire-rings-apps.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, reducedMotion: 'reduce' })
for (const p of ['expect', 'factcheck', 'insurance', 'smoke', 'volcano', 'land']) {
  await page.goto(`${base}/${p}?embed=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(out, `${p}.png`) })
  console.log('saved', p)
}
await browser.close()
