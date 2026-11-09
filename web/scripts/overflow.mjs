// Report elements wider than the viewport (horizontal overflow) at a given width.
// Usage: node scripts/overflow.mjs /r/mauritius 390   (expects `vite preview` on :4179 or starts one)
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const [path = '/r/punjab', width = '390'] = process.argv.slice(2)
const PORT = 4179
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(width), height: 800 } })
await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'load' })
await page.waitForTimeout(2500)
const res = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1 && r.width > 0) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 90), right: Math.round(r.right), w: Math.round(r.width) })
  }
  return { vw, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 15) }
})
console.log(JSON.stringify(res, null, 1))
await browser.close()
server.kill()
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
