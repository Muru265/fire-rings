// QA #33: every chip × region × style answers on /ask even when the live AI is unavailable (local preview has no
// /api, so this exercises the saved-answer fallback). Checks the answer card appears and its style badge matches (#52).
// #85: run in both data modes; High detail answers never say "MODIS-equivalent" and do say "VIIRS"; Long-term never claims "native VIIRS".
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = 4179
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const CHIPS = ['Is this month unusual?', 'Worst year on record?', 'When does the season peak?', 'How reliable is this?']
// Round 5B: every published region (meta.json), incl. Northern Australia savanna, Northeast India, Tanzania
const REGIONS = JSON.parse(readFileSync(resolve(here, '../public/data/v1/meta.json'), 'utf-8')).regions.map((r) => r.id)
const browser = await chromium.launch()
let fail = 0
let n = 0
try {
  for (const mode of ['longterm', 'detail']) for (const region of REGIONS) {
    for (const voice of ['responder', 'scientist']) {
      const page = await browser.newPage()
      await page.goto(`http://localhost:${PORT}/ask?region=${region}`, { waitUntil: 'load' })
      await page.getByRole('button', { name: voice[0].toUpperCase() + voice.slice(1), exact: true }).click()
      await page.getByRole('button', { name: mode === 'detail' ? 'High detail' : 'Long-term', exact: true }).click()
      for (const chip of CHIPS) {
        n++
        await page.getByRole('button', { name: chip, exact: true }).click()
        // each chip adds its own turn; check the card for this question, not the first one on the page
        const card = page.locator('article[data-voice]').filter({ hasText: chip }).last()
        try {
          await card.waitFor({ timeout: 15000 })
          await card.locator('[data-testid="numbers-table"]').waitFor({ timeout: 8000 }) // QA #57: numbers used shown as a table
          const v = await card.getAttribute('data-voice')
          const q = await card.innerText()
          // QA #62: year/month values are never thousands-separated
          const badYear = await card.locator('[data-testid="numbers-table"] tr').evaluateAll((trs) => trs.some((tr) => {
            const td = tr.querySelectorAll('td'); return td.length > 1 && /^(year|month|y|m)$/i.test(td[0].textContent.trim()) && td[1].textContent.includes(',')
          }))
          // QA #71: the side panel shows the step trace (live, or replayed lookups for a saved answer)
          const traceN = await page.getByTestId('ask-trace').locator('li').count()
          const said = `${await card.getByTestId('answer-text').innerText()} ${await card.getByTestId('answer-caveat').innerText().catch(() => '')}`
          const unitOk = mode === 'detail' ? !/MODIS[- ]equivalent/i.test(said) && /VIIRS/.test(said) : !/native VIIRS/i.test(said)
          const ok = v === voice && q.includes(chip) && !badYear && traceN >= 3 && unitOk
          if (!ok) { fail++; console.log(`FAIL  ${mode} ${region} ${voice} ${chip}: badge=${v}${unitOk ? '' : ` unit wording: ${said.slice(0, 120)}`}`) }
          else console.log(`PASS  ${mode} ${region} ${voice} ${chip}`)
        } catch {
          fail++; console.log(`FAIL  ${mode} ${region} ${voice} ${chip}: no answer (${await page.locator('[data-turn="error"]').count() ? 'error shown' : 'timeout'})`)
        }
        await page.waitForTimeout(150)
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  server.kill()
}
console.log(`\n${n - fail}/${n} chip × region × style answered`)
process.exitCode = fail ? 1 : 0
