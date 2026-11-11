// Interaction smoke test: keyboard-open month drawer, apply a lat/lon box, anomaly mode, seam frames.
// Saves screenshots to ../docs/screens/e2e_*.png and fails on console errors.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
  page.on('console', (m) => m.type() === 'error' && !(m.location()?.url ?? '').includes('fire-rings-apps') && !(m.location()?.url ?? '').includes('fire-rings.vercel.app') && errors.push(m.text()))
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

  // QA #12: table → chart keeps the chart at full card width (every ChartCard on the page)
  const cards = page.locator('section.card:has([data-chart-body])')
  const nCards = await cards.count()
  let shrunk = 0
  for (let i = 0; i < nCards; i++) {
    const c = cards.nth(i)
    await c.scrollIntoViewIfNeeded()
    const btn = c.getByRole('button', { name: 'View as table' })
    if (!(await btn.count())) continue
    await btn.click(); await page.waitForTimeout(150)
    await c.getByRole('button', { name: 'View as chart' }).click(); await page.waitForTimeout(300)
    const cw = (await c.boundingBox()).width
    const svg = c.locator('[data-chart-body] svg').first()
    if (await svg.count()) { const sw = (await svg.boundingBox()).width; if (sw < cw * 0.75) shrunk++ }
  }
  check(`table→chart keeps width on ${nCards} chart cards`, nCards >= 2 && shrunk === 0)

  // lat/lon box (Ludhiana–Sangrur area)
  const inputs = page.locator('input[aria-label$="edge (decimal degrees)"]')
  await inputs.nth(0).fill('75.0'); await inputs.nth(1).fill('29.8'); await inputs.nth(2).fill('76.2'); await inputs.nth(3).fill('31.0')
  await page.getByRole('button', { name: 'Apply box' }).click()
  await page.waitForSelector('text=Box view:', { timeout: 20000 })
  check('box view applied', await page.getByText('Box view:').isVisible())
  await page.waitForTimeout(800)
  // QA #15: every chart card still renders with non-zero size in box view
  const sizes = await page.locator('[data-testid="charts"] section.card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  check(`box view keeps ${sizes.length} chart cards visible`, sizes.length === 2 && sizes.every((h) => h > 100))
  // QA #16: a box far outside the region is clipped, never applied raw
  await inputs.nth(0).fill('60'); await inputs.nth(1).fill('20'); await inputs.nth(2).fill('76.5'); await inputs.nth(3).fill('31')
  await page.getByRole('button', { name: 'Apply box' }).click()
  await page.waitForTimeout(400)
  check('box outside region is clipped with a warning', await page.getByText('box clipped to').isVisible())
  await page.screenshot({ path: resolve(out, 'e2e_box.png'), fullPage: false })

  // QA #44: mode toggle switches everything, goes into the URL and is remembered
  await page.goto(`http://localhost:${PORT}/r/madagascar`, { waitUntil: 'load' })
  await page.getByTestId('mode-detail').click()
  await page.waitForTimeout(600)
  check('High detail toggle → URL + chip', page.url().includes('mode=detail') && (await page.getByTestId('mode-chip').innerText()).includes('High detail'))
  check('High detail: rings start 2012', ((await page.locator('svg[role="grid"] [role="gridcell"]').first().getAttribute('aria-label')) ?? '').includes('2012'))
  await page.goto(`http://localhost:${PORT}/r/punjab`, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  check('mode remembered across pages', (await page.getByTestId('mode-chip').innerText()).includes('High detail'))
  await page.getByTestId('mode-longterm').click()
  await page.waitForTimeout(400)
  check('back to Long-term', !page.url().includes('mode=detail') && (await page.getByTestId('mode-chip').innerText()).includes('Long-term'))

  // QA #63/#64: map text follows the mode; Long-term explains fractional values with the month's exchange rate
  await page.goto(`http://localhost:${PORT}/r/punjab?mode=detail`, { waitUntil: 'load' })
  await page.getByTestId('map-footer').waitFor({ timeout: 15000 })
  check('High detail map footer says ~5 km²', (await page.getByTestId('map-footer').innerText()).includes('~5 km²'))
  await page.goto(`http://localhost:${PORT}/r/punjab?mode=longterm`, { waitUntil: 'load' })
  await page.getByTestId('map-footer').waitFor({ timeout: 15000 })
  check('Long-term map footer says ~36 km²', (await page.getByTestId('map-footer').innerText()).includes('~36 km²'))
  check('Long-term map explains fractions with k', /1 VIIRS fire-day ≈ \d\.\d\d MODIS-equivalent/.test(await page.getByTestId('map-fraction-note').innerText()))
  // QA #66: the nav is never a scroll container and fits on one row at desktop widths
  for (const w of [1280, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 })
    const [sw, cw, rows] = await page.evaluate(() => { const n = document.querySelector('nav[aria-label="Main"]'); const lis = [...n.querySelectorAll('li')].map((l) => l.getBoundingClientRect().top); return [n.scrollWidth, n.clientWidth, new Set(lis.map(Math.round)).size] })
    check(`${w}px: nav fits on one row, no scrollbar`, sw <= cw && rows === 1)
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // P1.1: date range — URL keeps it, summary card, rings/calendar fade outside, works in High detail and with a box
  await page.goto(`http://localhost:${PORT}/r/se_australia?from=2019-07&to=2020-03&mode=longterm`, { waitUntil: 'load' })
  await page.getByTestId('range-summary').waitFor({ timeout: 15000 })
  check('range: summary card from the URL', (await page.getByTestId('range-summary').innerText()).includes('Jul 2019 – Mar 2020'))
  check('range: rank shown for a ≤12-month range', /\d+(st|nd|rd|th) of \d+/.test(await page.getByTestId('range-rank').innerText()))
  const dimmed = await page.locator('[role="grid"] [role="gridcell"].opacity-35').count()
  check(`range: calendar fades months outside the range (${dimmed})`, dimmed > 200)
  await page.getByTestId('range-from').selectOption({ label: 'Jan 2015' })
  await page.waitForTimeout(300)
  check('range: picker updates the URL', page.url().includes('from=2015-01'))
  await page.getByTestId('mode-detail').click(); await page.waitForTimeout(500)
  check('range: survives High detail', page.url().includes('from=2015-01') && (await page.getByTestId('range-summary').isVisible()))
  await page.getByTestId('mode-longterm').click(); await page.waitForTimeout(300)
  const dl = page.waitForEvent('download')
  await page.locator('section[aria-labelledby="rings-h"]').getByRole('button', { name: 'CSV', exact: true }).click()
  const csv = await (await dl).path().then((f) => import('node:fs').then((fs) => fs.readFileSync(f, 'utf-8')))
  const rows = csv.trim().split(/\r?\n/).slice(2)
  check(`range: CSV limited to the range (${rows.length} rows, first ${rows[0]?.slice(0, 7)})`, rows[0]?.startsWith('2015,1,') && rows.at(-1)?.startsWith('2020,3,'))
  await page.getByTestId('range-reset').click(); await page.waitForTimeout(200)
  check('range: Full record clears the URL', !page.url().includes('from='))
  await page.setViewportSize({ width: 1440, height: 900 })

  // P1.2/P1.3: demo month (static file, never NASA live) — hotspot CSV from the drawer, dots on the map when zoomed in
  await page.goto(`http://localhost:${PORT}/r/punjab?mode=longterm`, { waitUntil: 'load' })
  await page.waitForSelector('svg[role="grid"] [role="gridcell"]')
  await page.locator('[role="grid"] [role="gridcell"][aria-label^="Oct 2016"]').last().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
  const dl2 = page.waitForEvent('download', { timeout: 20000 })
  await page.getByTestId('hotspot-download').click()
  const f2 = await (await dl2).path()
  const csv2 = (await import('node:fs')).readFileSync(f2, 'utf-8')
  check('hotspots: drawer CSV for Oct 2016 (demo file) has source + filters line', csv2.startsWith('# Fire Rings hotspots · Punjab') && csv2.includes('filters:') && csv2.split(String.fromCharCode(10)).length > 1000)
  await page.keyboard.press('Escape')
  const mapSec = page.locator('section[aria-labelledby="map-h"]')
  await mapSec.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  for (let i = 0; i < 4; i++) { await mapSec.locator('.maplibregl-ctrl-zoom-in').click(); await page.waitForTimeout(450) }
  await page.getByText('VIIRS detection (375 m)').waitFor({ timeout: 20000 }).catch(() => {})
  check('map: zoomed-in detection dots for an old month (Oct 2016)', await page.getByText('VIIRS detection (375 m)').isVisible())
  await page.waitForTimeout(3500)
  await mapSec.screenshot({ path: resolve(out, 'e2e_map_dots_oct2016.png') })

  // Fire Watch: run the agent → steps appear → every region gets a status (local preview has no /api → offline replay)
  await page.goto(`http://localhost:${PORT}/watch`, { waitUntil: 'load' })
  await page.getByTestId('run-agent').click()
  await page.getByTestId('watch-trace').getByText('Done.').waitFor({ timeout: 20000 }).catch(() => {})
  const traceTxt = await page.getByTestId('watch-trace').innerText()
  const nStatus = (traceTxt.match(/Status: /g) ?? []).length
  check(`Fire Watch: agent steps appear (${nStatus} region statuses in the trace)`, nStatus === 4 && /Checking Punjab/.test(traceTxt))
  const statuses = await page.getByTestId('watch-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))
  check('Fire Watch: every region card has a status', statuses.length === 4 && statuses.every((s) => ['Normal', 'Watch', 'Alert', 'Unusually low'].includes(s)))
  const flaggedNoBrief = await page.locator('[data-testid="watch-card"]:not([data-status="Normal"])').evaluateAll((els) => els.filter((e) => !e.querySelector('[data-testid="watch-briefing"]')).length)
  check('Fire Watch: every flagged region shows a briefing', flaggedNoBrief === 0)
  const trig = await page.locator('[data-testid="watch-card"][data-region="punjab"] [data-testid="status-trigger"]').innerText().catch(() => '')
  check(`#75 status badge names the month (${trig.trim()})`, /\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(trig))
  const tr = await page.getByTestId('watch-trace').locator('li').allInnerTexts()
  check('#74 trace has no repeated identical lines', new Set(tr).size === tr.length)
  check('Fire Watch: raw-vs-harmonized proof shown', await page.getByTestId('watch-proof-headline').isVisible())

  // #86: a live run with interleaved parallel briefings → one block per region, each with only its own numbers
  {
    const D = resolve(here, '../public/data/v1')
    const RJ = (p) => JSON.parse(readFileSync(resolve(D, p), 'utf-8'))
    const nf = new Intl.NumberFormat('en-GB')
    const w = RJ('watch.json'), sv = RJ('watch_cache.json').briefings
    const last = (id) => RJ(`regions/${id}.json`).months.at(-1)
    const num = { punjab: nf.format(Math.round(last('punjab').H)), madagascar: nf.format(Math.round(last('madagascar').H)) }
    const lab = (id) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][last(id).m - 1]} ${last(id).y}`
    const ev = [{ type: 'step', kind: 'info', text: 'Rules: (mock stream for the test)' }]
    for (const id of Object.keys(w.regions)) {
      const flagged = id === 'punjab' || id === 'madagascar'
      ev.push({ type: 'step', region: id, kind: 'status', text: `Status: ${flagged ? 'Watch' : 'Normal'} — ${w.regions[id].name.split(' (')[0]}` })
      ev.push({ type: 'region', region: id, status: flagged ? 'Watch' : 'Normal', checks: w.regions[id].checks, relevant_for: w.regions[id].relevant_for, flags: w.regions[id].flags })
    }
    for (let i = 0; i < 3; i++) for (const id of ['punjab', 'madagascar']) ev.push({ type: 'step', region: id, kind: 'tool', text: 'Looking up the latest month…' })
    for (let i = 0; i < 2; i++) for (const id of ['madagascar', 'punjab']) ev.push({ type: 'step', region: id, kind: 'tool_done', text: `${lab(id)}: ${num[id]} fire-days` })
    ev.push({ type: 'briefing', region: 'punjab', voice: 'responder', briefing: { ...sv['punjab|responder'], source: 'live' } })
    ev.push({ type: 'step', region: 'punjab', kind: 'tool_done', text: 'stray line after the block ended' })
    ev.push({ type: 'briefing', region: 'madagascar', voice: 'responder', briefing: { ...sv['madagascar|responder'], source: 'live' } })
    ev.push({ type: 'done', ms: 1, data_end: w.data_end })
    await page.route('**/api/watch*', (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ev.map((e) => JSON.stringify(e)).join('\n') + '\n' }))
    await page.goto(`http://localhost:${PORT}/watch`, { waitUntil: 'load' })
    await page.getByTestId('run-agent').click()
    await page.locator('[data-testid="trace-block"][data-region="madagascar"]').getByText('briefing ready').waitFor({ timeout: 10000 }).catch(() => {})
    const pj = await page.locator('[data-testid="trace-block"][data-region="punjab"]').innerText().catch(() => '')
    const md = await page.locator('[data-testid="trace-block"][data-region="madagascar"]').innerText().catch(() => '')
    check(`#86 Punjab block shows only its own numbers (${num.punjab}, never ${num.madagascar})`, pj.includes(num.punjab) && !pj.includes(num.madagascar))
    check(`#86 Madagascar block shows only its own numbers (${num.madagascar}, never ${num.punjab})`, md.includes(num.madagascar) && !md.includes(num.punjab))
    check('#86 each block ends with "briefing ready — N numbers verified"', /briefing ready — \d+ numbers verified\s*$/.test(pj.trim()) && /briefing ready — \d+ numbers verified\s*$/.test(md.trim()))
    check('#86 ×N only within a region (×3 per block, no stray line after the block ended)', /×3/.test(pj) && /×3/.test(md) && !pj.includes('stray line'))
    await page.getByTestId('watch-trace').screenshot({ path: resolve(out, 'e2e_watch_trace_blocks.png') })
    await page.unroute('**/api/watch*')
  }

  // P2.2 control room: six live windows; at least one reports its last API call via postMessage
  await page.goto(`http://localhost:${PORT}/use-cases`, { waitUntil: 'load' })
  await page.getByTestId('usecase-grid').waitFor({ timeout: 10000 })
  check('use-cases: 6 windows', (await page.getByTestId('cam').count()) === 6)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.locator('[data-testid="cam"][data-live="yes"]').first().waitFor({ timeout: 45000 }).catch(() => {})
  const live = await page.locator('[data-testid="cam"][data-live="yes"]').count()
  check(`use-cases: windows report live API calls (${live}/6)`, live >= 1)
  await page.waitForTimeout(6000)
  await page.screenshot({ path: resolve(out, 'e2e_use_cases.png'), fullPage: true })
  {
    const ph = await browser.newPage({ viewport: { width: 360, height: 800 } })
    await ph.goto(`http://localhost:${PORT}/use-cases`, { waitUntil: 'load' })
    await ph.getByTestId('usecase-list').waitFor({ timeout: 10000 })
    check('use-cases 360px: card list with 6 screenshots', (await ph.locator('[data-testid="usecase-list"] img').count()) === 6)
    await ph.close()
  }

  // P1.5: the globe's box never runs under the playback panel (1280–1920), style switcher works and is remembered
  for (const w of [1280, 1440, 1920]) {
    const pg = await browser.newPage({ viewport: { width: w, height: w === 1920 ? 1080 : 800 } })
    await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
    await pg.waitForSelector('[data-testid="globe-panel"]', { timeout: 20000 })
    await pg.waitForTimeout(1500)
    const [mapBottom, panelTop, globeR] = await pg.evaluate(() => {
      const mp = window.__frGlobe; const c = mp.getCanvas().getBoundingClientRect(); const p = document.querySelector('[data-testid="globe-panel"]').getBoundingClientRect()
      const r = (512 * 2 ** mp.getZoom()) / Math.PI / 2
      return [c.top + c.height / 2 + r, p.top, r]
    })
    check(`${w}px: globe (r=${Math.round(globeR)} px) ends above the playback panel`, mapBottom <= panelTop + 2, `${Math.round(mapBottom)} vs ${Math.round(panelTop)}`)
    if (w === 1440) {
      for (const k of ['Night lights', 'Day', 'Dark']) {
        await pg.getByTestId('globe-style').getByRole('button', { name: k }).click(); await pg.waitForTimeout(2500)
        await pg.screenshot({ path: resolve(out, `e2e_globe_${k.split(' ')[0].toLowerCase()}.png`) })
      }
      await pg.getByTestId('globe-style').getByRole('button', { name: 'Day' }).click()
      await pg.reload({ waitUntil: 'load' }); await pg.waitForSelector('[data-testid="globe-style"]', { timeout: 20000 })
      check('globe style remembered per visitor', (await pg.getByTestId('globe-style').getByRole('button', { name: 'Day' }).getAttribute('aria-pressed')) === 'true')
      await pg.getByTestId('globe-style').getByRole('button', { name: 'Dark' }).click()
    }
    await pg.close()
  }

  // P1.8 slides: ←/→ keys, counter, hidden presenter notes; paper + hero links
  await page.goto(`http://localhost:${PORT}/slides`, { waitUntil: 'load' })
  await page.getByTestId('slide-counter').waitFor({ timeout: 15000 })
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  check('slides: → moves to slide 3', (await page.getByTestId('slide-counter').innerText()).startsWith('3 /'))
  await page.keyboard.press('ArrowLeft')
  check('slides: ← goes back', (await page.getByTestId('slide-counter').innerText()).startsWith('2 /'))
  check('slides: notes hidden by default', (await page.getByTestId('slide-notes').count()) === 0)
  await page.keyboard.press('n')
  check('slides: N shows presenter notes', await page.getByTestId('slide-notes').isVisible())
  check('#87 exactly 7 slides', (await page.getByTestId('slide-counter').innerText()).trim().endsWith('/ 7'))
  { // #87: every slide has speaker notes; figures and text stay inside the slide; no UI chrome in slides
    const issues = []
    for (let i = 1; i <= 7; i++) {
      await page.goto(`http://localhost:${PORT}/slides?s=${i}`, { waitUntil: 'load' })
      await page.getByTestId('slide').waitFor({ timeout: 15000 }); await page.waitForTimeout(900)
      await page.keyboard.press('n')
      const notes = (await page.getByTestId('slide-notes').innerText().catch(() => '')).replace('Presenter notes', '').trim()
      if (notes.split(/\s+/).length < 40) issues.push(`slide ${i}: notes too short`)
      const out = await page.evaluate(() => { const r = document.querySelector('[data-testid="slide"]').getBoundingClientRect(); return [...document.querySelectorAll('[data-testid="slide-fig"] > div, [data-testid="slide-text"] > div')].some((el) => { const b = el.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1 }) })
      if (out) issues.push(`slide ${i}: content outside the slide`)
      const chrome = await page.getByTestId('slide').evaluate((el) => [...el.querySelectorAll('button, [data-help]')].filter((b) => b.offsetParent !== null).length + (/(View as table|Hover (a|the))/.test(el.innerText) ? 1 : 0))
      if (chrome) issues.push(`slide ${i}: UI chrome visible`)
    }
    check(`#87 slides: notes ≥ 40 words, figures inside the slide, no UI chrome${issues.length ? ` — ${issues.join('; ')}` : ''}`, issues.length === 0)
  }
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
  check('home: paper / slides / how it works links', (await page.getByTestId('hero-docs').locator('a').count()) === 3)

  // Final check: Mauritius on the globe — a small dot at world zoom, ~36 km² hexagons when zoomed in
  {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
    await pg.waitForSelector('[data-testid="globe-panel"]', { timeout: 20000 }); await pg.waitForTimeout(2500)
    const dot = await pg.evaluate(() => window.__frGlobe.querySourceFeatures('small').filter((f) => f.properties.name === 'Mauritius').length)
    check('globe: Mauritius is a small dot at world zoom', dot >= 1)
    await pg.evaluate(() => { const mp = window.__frGlobe; mp.fire('mousedown'); mp.jumpTo({ center: [57.55, -20.25], zoom: 7.5 }) })
    await pg.waitForTimeout(4000)
    const hexN = await pg.evaluate(() => window.__frGlobe.querySourceFeatures('hex6').filter((f) => f.properties.name === 'Mauritius').length)
    check(`globe: zoomed on Mauritius shows ~36 km² hexagons (${hexN})`, hexN >= 1)
    await pg.screenshot({ path: resolve(out, 'e2e_globe_mauritius_zoom.png') })
    await pg.close()
  }

  // QA #69: on phones the globe is not hidden behind the hero text
  for (const w of [360, 430]) {
    const ph = await browser.newPage({ viewport: { width: w, height: 900 } })
    await ph.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
    await ph.waitForSelector('[data-testid="hero-globe"] canvas', { timeout: 15000 })
    await ph.waitForTimeout(1500)
    const [txtBottom, globeTop, canvasH] = await ph.evaluate(() => [document.querySelector('main h1').parentElement.getBoundingClientRect().bottom,
      document.querySelector('[data-testid="hero-globe"]').getBoundingClientRect().top, document.querySelector('[data-testid="hero-globe"] canvas').getBoundingClientRect().height])
    check(`${w}px: globe below the hero text and ≥300 px tall`, globeTop >= txtBottom - 1 && canvasH >= 300)
    await ph.screenshot({ path: resolve(out, `e2e_home_globe_${w}.png`) })
    await ph.close()
  }

  // QA #38: Proof before/after — raw line drawn from 2001 with a 2012 bridge; "Show the fix" morphs it onto harmonized
  await page.goto(`http://localhost:${PORT}/proof`, { waitUntil: 'load' })
  const fix = page.getByTestId('ba-show-fix')
  await fix.waitFor({ timeout: 10000 })
  const pathLen = async () => page.locator('section:has([data-testid="ba-show-fix"]) svg path[stroke="#B45A93"]').evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? ''))
  const d0 = await pathLen()
  check('before/after raw line + 2012 bridge drawn', d0.length === 2 && d0.every((d) => d.length > 5))
  await fix.click()
  await page.waitForTimeout(2600)
  const d1 = await pathLen()
  check('Show the fix morphs the raw line', (await fix.getAttribute('aria-pressed')) === 'true' && d1[0] !== d0[0])
  await page.locator('section:has([data-testid="ba-show-fix"])').first().screenshot({ path: resolve(out, 'e2e_showfix.png') })
} catch (e) {
  console.log('FAIL  exception', e.message)
  failed = true
} finally {
  if (errors.length) { console.log('console errors:', errors); failed = true }
  await browser.close()
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  server.kill()
  process.exitCode = failed ? 1 : 0
}
