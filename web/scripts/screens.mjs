// Screenshot key pages at 1440px and 360px into ../docs/screens/.
// Usage: npm run build && node scripts/screens.mjs [path ...]   (starts `vite preview` itself)
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../../docs/screens')
mkdirSync(out, { recursive: true })
const PORT = 4179
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/r/punjab', '/r/madagascar', '/r/se_australia', '/r/mauritius', '/r/punjab?mode=detail', '/r/madagascar?mode=detail', '/proof', '/data', '/ask', '/story', '/story/madagascar', '/story/punjab', '/story/se_australia', '/story/mauritius', '/guide', '/watch', '/does-not-exist']
const widths = [{ w: 1440, h: 900, tag: 'desktop' }, { w: 360, h: 800, tag: 'mobile' }]

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32',
})
const base = `http://localhost:${PORT}`
for (let i = 0; i < 50; i++) {
  try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) }
}

const browser = await chromium.launch()
try {
  for (const { w, h, tag } of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    for (const p of pages) {
      await page.goto(base + p, { waitUntil: 'load' })
      if (p.startsWith('/r/')) await page.waitForSelector('svg[role="grid"]', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(p.startsWith('/r/') || p === '/' ? 3500 : 800)
      const name = (p === '/' ? 'landing' : p.slice(1).replace(/\//g, '_').replace('?mode=', '_').replace(/[?&=]/g, '_')) + `_${tag}.png`
      await page.screenshot({ path: resolve(out, name), fullPage: true })
      console.log('saved', name)
      if (p.startsWith('/r/') && tag === 'desktop') {
        const mapSec = page.locator('section[aria-labelledby="map-h"]')
        await mapSec.waitFor({ timeout: 15000 }).catch(() => {})
        if (await mapSec.count()) {
          await mapSec.scrollIntoViewIfNeeded()
          await page.waitForTimeout(2500)
          await mapSec.screenshot({ path: resolve(out, name.replace('.png', '_map.png')) })
        }
        const cell = page.locator('svg [role="gridcell"][aria-label^="Nov 2019"]').first()
        if (await cell.count()) {
          await cell.focus() // same tooltip + spoke/ring highlight as hover; also exercises keyboard path
          await page.keyboard.press('ArrowRight')
          await page.keyboard.press('ArrowLeft')
          await page.waitForTimeout(250)
          const box = await page.locator('svg[role="grid"]').first().boundingBox()
          const hn = name.replace('.png', '_hover.png')
          await page.screenshot({ path: resolve(out, hn), clip: { x: box.x - 40, y: box.y - 40, width: box.width + 80, height: box.height + 80 } })
          console.log('saved', hn)
        }
      }
    }
    if (errors.length) console.log(`[${tag}] console errors:`, errors)
    await ctx.close()
  }
} finally {
  await browser.close()
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  server.kill()
}
