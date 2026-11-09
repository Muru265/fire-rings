// Print console messages and page errors for a route. Usage: node scripts/console.mjs / [waitMs]
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const [path = '/', wait = '6000'] = process.argv.slice(2)
const PORT = 4179
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'load' })
await page.waitForTimeout(Number(wait))
const info = await page.evaluate(() => {
  const c = document.querySelector('.maplibregl-canvas')
  const g = window.__globe
  let extra = null
  if (g) {
    const src = g.getSource('fire')
    extra = { layers: g.getStyle().layers.filter((l) => l.id.startsWith('fire')).map((l) => l.id), hasSource: !!src,
      data: src && src._data ? JSON.stringify(src._data).slice(0, 300) : null,
      rendered: g.queryRenderedFeatures({ layers: ['fire-core'] }).length, proj: JSON.stringify(g.getProjection?.()) }
  }
  return c ? { w: c.clientWidth, h: c.clientHeight, extra } : null
})
console.log('canvas:', JSON.stringify(info))
await page.screenshot({ path: '../docs/screens/_debug.png' })
await browser.close()
server.kill()
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
