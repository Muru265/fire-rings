// P1.8 PDFs of the paper and the slides (Playwright print) → public/fire-rings-paper.pdf, public/fire-rings-slides.pdf.
// Run locally and commit the files (Vercel's build has no Chromium). Usage: npm run build && npm run pdf
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = 4184
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto(`http://localhost:${PORT}/paper`, { waitUntil: 'networkidle' })
  await page.getByTestId('paper').waitFor({ timeout: 20000 })
  await page.waitForTimeout(2000)
  if ((await page.innerText('main')).includes('⟨missing')) throw new Error('paper has a missing placeholder')
  await page.pdf({ path: resolve(here, '../public/fire-rings-paper.pdf'), format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } })
  console.log('saved public/fire-rings-paper.pdf')
  const deck = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce', colorScheme: 'dark' })
  await deck.goto(`http://localhost:${PORT}/slides?print=1`, { waitUntil: 'networkidle' })
  await deck.getByTestId('slides-print').waitFor({ timeout: 20000 })
  await deck.waitForTimeout(2500)
  if ((await deck.innerText('main')).includes('⟨missing')) throw new Error('slides have a missing placeholder')
  await deck.addStyleTag({ content: '@page{size:1280px 720px;margin:0} .slides-print{gap:0} .slides-print>*{margin:0!important} .slide{width:1280px!important;height:718px!important;aspect-ratio:auto!important} .min-h-dvh{min-height:0!important} main{padding:0!important;margin:0!important}' })
  await deck.emulateMedia({ media: 'print' })
  await deck.waitForTimeout(1500)
  // #87: every figure and text block sits inside its slide (FitBox scales them down when needed)
  const bad = await deck.evaluate(() => [...document.querySelectorAll('[data-testid="slide"]')].flatMap((sl, i) => {
    const r = sl.getBoundingClientRect()
    return [...sl.querySelectorAll('[data-testid="slide-fig"] > div, [data-testid="slide-text"] > div')].map((el) => {
      const b = el.getBoundingClientRect()
      return b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1 ? null : `slide ${i + 1}: ${el.parentElement.dataset.testid} ${Math.round(b.width)}×${Math.round(b.height)} outside ${Math.round(r.width)}×${Math.round(r.height)}`
    }).filter(Boolean)
  }))
  if (bad.length) throw new Error(`content overflows its slide: ${bad.join('; ')}`)
  const nSlides = await deck.locator('[data-testid="slide"]').count()
  const out = resolve(here, '../public/fire-rings-slides.pdf')
  await deck.pdf({ path: out, width: '1280px', height: '720px', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
  // #87: no blank trailing page — PDF page count must equal the slide count
  const pages = (readFileSync(out, 'latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
  if (pages !== nSlides) throw new Error(`slides PDF has ${pages} pages for ${nSlides} slides`)
  console.log(`saved public/fire-rings-slides.pdf — ${pages} pages = ${nSlides} slides, every figure inside its slide`)
} finally {
  await browser.close()
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  server.kill()
}
