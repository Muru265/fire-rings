// Interaction smoke test: keyboard-open month drawer, apply a lat/lon box, anomaly mode, seam frames.
// Saves screenshots to ../docs/screens/e2e_*.png and fails on console errors.
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../../docs/screens')
const PORT = 4179
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch()
const errors = []
let failed = false
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed = true }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`http://localhost:${PORT}/r/punjab`, { waitUntil: 'load' })
  await page.waitForSelector('svg[role="grid"] [role="gridcell"]')

  // keyboard: focus Nov 2019, move right, open with Enter
  await page.locator('svg [role="gridcell"][aria-label^="Nov 2019"]').first().focus()
  await page.keyboard.press('ArrowRight')
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  check('ArrowRight moves focus to Dec 2019', focused.startsWith('Dec 2019'))
  await page.keyboard.press('ArrowUp')
  const up = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  check('ArrowUp moves outward to Dec 2020', up.startsWith('Dec 2020'))
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
  await page.waitForTimeout(1500)
  check('Enter opens month drawer', await page.locator('#drawer-h').innerText().then((t) => t.includes('Dec 2020')))
  await page.screenshot({ path: resolve(out, 'e2e_drawer.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Esc closes drawer', (await page.locator('[role="dialog"]').count()) === 0)

  // anomaly mode
  await page.getByRole('button', { name: 'vs typical' }).click()
  await page.waitForTimeout(500)
  check('anomaly legend shown', await page.getByText('Ratio to typical month').first().isVisible())
  await page.locator('section[aria-labelledby="rings-h"]').screenshot({ path: resolve(out, 'e2e_anomaly.png') })
  await page.getByRole('button', { name: 'Fire-days' }).click()

  // seam slider halfway and raw
  const slider = page.locator('input.seam')
  await slider.fill('50')
  await page.waitForTimeout(300)
  await page.locator('section[aria-labelledby="rings-h"]').screenshot({ path: resolve(out, 'e2e_seam50.png') })
  await slider.fill('0')
  await page.waitForTimeout(300)
  await page.locator('section[aria-labelledby="rings-h"]').screenshot({ path: resolve(out, 'e2e_seam0.png') })
  check('seam at raw labels center', (await page.locator('svg[role="grid"] text').evaluateAll((els) => els.map((e) => e.textContent ?? ''))).some((t) => t.toLowerCase().includes('raw')))
  await slider.fill('100')

  // lat/lon box (Ludhiana–Sangrur area)
  const inputs = page.locator('input[aria-label$="bound (decimal degrees)"]')
  await inputs.nth(0).fill('75.0'); await inputs.nth(1).fill('29.8'); await inputs.nth(2).fill('76.2'); await inputs.nth(3).fill('31.0')
  await page.getByRole('button', { name: 'Apply box' }).click()
  await page.waitForSelector('text=Box view:', { timeout: 20000 })
  check('box view applied', await page.getByText('Box view:').isVisible())
  await page.waitForTimeout(800)
  await page.screenshot({ path: resolve(out, 'e2e_box.png'), fullPage: false })
} catch (e) {
  console.log('FAIL  exception', e.message)
  failed = true
} finally {
  if (errors.length) { console.log('console errors:', errors); failed = true }
  await browser.close()
  server.kill()
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  process.exitCode = failed ? 1 : 0
}
