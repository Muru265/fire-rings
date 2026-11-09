// Screenshots of the rings card under simulated colour-vision deficiencies (Chromium emulation) → docs/screens/cvd_*.png
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = 4179
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, reducedMotion: 'reduce' })
const cdp = await page.context().newCDPSession(page)
await page.goto(`http://localhost:${PORT}/r/punjab`, { waitUntil: 'load' })
await page.waitForSelector('svg[role="grid"] [role="gridcell"]')
for (const type of ['none', 'deuteranopia', 'protanopia', 'tritanopia']) {
  await cdp.send('Emulation.setEmulatedVisionDeficiency', { type })
  for (const mode of ['Fire-days', 'vs typical']) {
    await page.getByRole('button', { name: mode }).click()
    await page.waitForTimeout(300)
    const f = resolve(here, `../../docs/screens/cvd_${type}_${mode === 'Fire-days' ? 'counts' : 'anomaly'}.png`)
    await page.locator('section[aria-labelledby="rings-h"]').screenshot({ path: f })
    console.log('saved', f)
  }
}
await browser.close()
server.kill()
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
