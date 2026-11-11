// QA #9: every chart/section on the site has a Guide entry, every ⓘ deep-links to an existing entry, and search works.
import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = 4181
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
const B = `http://localhost:${PORT}`
let failed = false
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !extra ? '' : `  → ${extra}`}`); if (!ok) failed = true }

// entries the QA list requires (Home, Explore, Proof, Story, Data, Ask)
const REQUIRED = ['globe', 'region-cards', 'live-line', 'satellite-timeline', 'mode-toggle', 'header-badges', 'headline', 'kpi-cards', 'seam-slider',
  'fire-rings', 'calendar', 'seasonality', 'annual-totals', 'gauge', 'similar-years', 'ask-chips', 'provenance', 'map', 'month-drawer',
  'daily-fire-days', 'baseline-strip', 'where-map', 'export', 'v1-error', 'v3-step', 'seasonal-shape', 'v9-peaks', 'before-after', 'orbit-drift',
  'calibration-ratio-by-month', 'outages', 'static-sources', 'detection-time', 'limitations', 'method-steps', 'story', 'data-page', 'ask-page',
  'fire-watch', 'raw-vs-harmonized', 'fire-day', 'percentile', 'return-period', 'exchange-rate', 'problem', 'fix', 'two-views', 'live-vs-record', 'punjab-caveat', 'five-satellites', 'glossary']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
try {
  await page.goto(`${B}/guide`, { waitUntil: 'load' })
  await page.waitForSelector('[data-guide-entry="fire-rings"] svg')
  const ids = new Set(await page.locator('[id]').evaluateAll((els) => els.map((e) => e.id)))
  const missing = REQUIRED.filter((id) => !ids.has(id))
  check(`guide has all ${REQUIRED.length} required entries/sections`, missing.length === 0, missing.join(', '))
  const examples = await page.getByTestId('example-reading').count()
  check(`worked example readings from data (${examples})`, examples >= 15)

  // every ⓘ on the site points at an existing guide anchor; every chart card title has one
  const pages = ['/', '/r/punjab', '/r/punjab?mode=detail', '/proof', '/data', '/ask', '/story', '/story/punjab', '/watch']
  const helpIds = new Set()
  for (const p of pages) {
    await page.goto(B + p, { waitUntil: 'load' })
    await page.waitForTimeout(p.startsWith('/r/') ? 1500 : 900)
    for (const id of await page.locator('[data-help]').evaluateAll((els) => els.map((e) => e.getAttribute('data-help')))) helpIds.add(id)
    const cards = await page.locator('section:has([data-chart-body])').count()
    const withHelp = await page.locator('section:has([data-chart-body]):has(h2 [data-help])').count()
    if (cards) check(`${p}: ${cards} chart cards all have an ⓘ`, cards === withHelp, `${withHelp}/${cards}`)
    if (p === '/r/punjab') {
      await page.locator('svg[role="grid"] [role="gridcell"]').first().click()
      await page.waitForSelector('[role="dialog"]')
      for (const id of await page.locator('[role="dialog"] [data-help]').evaluateAll((els) => els.map((e) => e.getAttribute('data-help')))) helpIds.add(id)
      await page.keyboard.press('Escape')
    }
  }
  const bad = [...helpIds].filter((id) => !ids.has(id))
  check(`all ${helpIds.size} ⓘ ids resolve to a guide anchor`, bad.length === 0, bad.join(', '))
  check('ⓘ count covers the main charts', ['fire-rings', 'calendar', 'seasonality', 'annual-totals', 'gauge', 'map', 'before-after', 'calibration-ratio-by-month'].every((x) => helpIds.has(x)))

  // ⓘ popover opens and deep-links into the guide
  await page.goto(`${B}/r/punjab`, { waitUntil: 'load' })
  await page.locator('[data-help="fire-rings"] button').click()
  await page.getByRole('link', { name: 'Learn more in the Guide →' }).click()
  await page.waitForTimeout(800)
  check('ⓘ “Learn more” deep-links to /guide#fire-rings', page.url().endsWith('/guide#fire-rings'))

  // search: synonyms, typo tolerance, enter → hash, no-results
  await page.goto(`${B}/guide`, { waitUntil: 'load' })
  const s = page.getByTestId('guide-search')
  for (const [q, want] of [['exchange rate', 'Calibration ratio by month'], ['pie chart', 'Fire Rings'], ['speedometer', '“Is this normal?” gauge'], ['calibraton ratio by month', 'Calibration ratio by month'], ['fire-day', 'Fire-day'], ['false alarms', 'Why harmonization matters'], ['agent', 'Fire Watch'], ['alerts', 'Fire Watch']]) {
    await s.fill(q)
    await page.waitForTimeout(150)
    const first = await page.locator('#guide-results [role="option"]').first().innerText().catch(() => '')
    check(`search “${q}” → ${want}`, first.startsWith(want), first)
  }
  await s.fill('exchange rate')
  await s.press('Enter')
  await page.waitForTimeout(700)
  check('Enter scrolls + updates URL hash', page.url().endsWith('#calibration-ratio-by-month'))
  // QA #68: the same result a second time still scrolls back; the sticky search sits below the header
  const inView = () => page.locator('#calibration-ratio-by-month').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight * 0.6 })
  check('first Enter: entry in view', await inView())
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await s.fill('exchange rate')
  await s.press('Enter')
  await page.waitForTimeout(900)
  check('same result again: scrolls back to the entry', await inView())
  await page.evaluate(() => window.scrollTo(0, 2500))
  await page.waitForTimeout(300)
  const [hb, st] = await page.evaluate(() => [document.querySelector('header').getBoundingClientRect().bottom, document.querySelector('[data-testid="guide-search"]').getBoundingClientRect().top])
  check('sticky search sits below the site header', st >= hb - 1, `header ${hb} search ${st}`)
  await s.fill('zqxjv')
  await page.waitForTimeout(150)
  check('no-results message with suggestions', await page.getByTestId('guide-noresults').isVisible())
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('/')
  check('"/" focuses the search box', await s.evaluate((el) => el === document.activeElement))
} catch (e) {
  console.log('FAIL  exception', e.message)
  failed = true
} finally {
  if (errors.length) { console.log('page errors:', errors); failed = true }
  await browser.close()
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  server.kill()
  process.exitCode = failed ? 1 : 0
}
