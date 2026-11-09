// Record the seam slider (raw → harmonized → raw) on Punjab as docs/screens/seam.gif.
// Usage: npm run build && node scripts/seam_gif.mjs
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'

const { GIFEncoder, quantize, applyPalette } = gifenc
const here = dirname(fileURLToPath(import.meta.url))
const PORT = 4179
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, reducedMotion: 'reduce' })
await page.goto(`http://localhost:${PORT}/r/punjab`, { waitUntil: 'load' })
await page.waitForSelector('svg[role="grid"] [role="gridcell"]')
await page.waitForTimeout(800)
const card = page.locator('section[aria-labelledby="rings-h"]')
const slider = page.locator('input.seam')
const steps = [...Array(11).keys()].map((i) => i * 10)
const seq = [0, 0, 0, ...steps, 100, 100, 100, ...[...steps].reverse()]
const gif = GIFEncoder()
for (const v of seq) {
  await slider.fill(String(v))
  await page.waitForTimeout(60)
  const png = PNG.sync.read(await card.screenshot({ scale: 'css' }))
  // downscale ×0.6 (nearest) to keep the file small
  const s = 0.6
  const w = Math.round(png.width * s)
  const h = Math.round(png.height * s)
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (Math.floor(y / s) * png.width + Math.floor(x / s)) * 4
    data.set(png.data.subarray(si, si + 4), (y * w + x) * 4)
  }
  const palette = quantize(data, 128)
  gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: v === 0 || v === 100 ? 500 : 110 })
}
gif.finish()
const out = resolve(here, '../../docs/screens/seam.gif')
writeFileSync(out, gif.bytes())
console.log('wrote', out, (gif.bytes().length / 1024).toFixed(0), 'kB', seq.length, 'frames')
await browser.close()
server.kill()
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
