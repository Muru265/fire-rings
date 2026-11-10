// Claims check: every number shown in headlines, KPI cards, gauges, validation cards, the globe panel and the Proof
// timing card must match the published JSON (same rounding as the app). Exits 1 on any mismatch.
// Usage: npm run build && node scripts/claims_check.mjs [baseUrl]   (starts `vite preview` unless a URL is given)
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(here, '../public/data/v1')
const J = (p) => JSON.parse(readFileSync(resolve(DATA, p), 'utf-8'))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })
const fmtInt = (v) => (v == null ? '—' : nf0.format(Math.round(v)))
const fmtRatio = (v) => (v == null ? '—' : `${nf1.format(v)}×`)
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}` }

const arg = process.argv[2]
const PORT = 4179
let server
if (!arg) {
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: resolve(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
  for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
}
const base = arg ?? `http://localhost:${PORT}`
const results = []
// Whole-token match: the expected text must not be glued to other digits (so "1" never matches inside "12,990").
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const contains = (shown, expected) => new RegExp(`(?<![\\d.,])${esc(expected)}(?![\\d]|[.,]\\d)`).test(shown)
const check = (page, what, shown, expected, ok = contains(shown, expected)) => {
  results.push({ page, what, expected, ok, shown: ok ? '' : shown.slice(0, 160) })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const meta = J('meta.json')
try {
  // ---- region pages ----------------------------------------------------------------------------------------------
  for (const { id } of meta.regions) {
    const d = J(`regions/${id}.json`)
    const P = `/r/${id}`
    await page.goto(base + P, { waitUntil: 'load' })
    await page.waitForSelector('svg[role="grid"] [role="gridcell"]')
    await page.waitForTimeout(900)
    const lc = d.latest_complete
    const lcRec = d.months.find((r) => r.y === lc.y && r.m === lc.m)
    const head = await page.locator('main p.font-display').first().innerText()
    check(P, 'headline month', head, `${FULL[lc.m - 1]} ${lc.y}`)
    if (lcRec.guard) check(P, 'headline guard', head, 'too little fire to judge')
    else check(P, 'headline ratio', head, `${fmtRatio(lcRec.ratio)} a typical ${FULL[lc.m - 1]}`)
    if (lcRec.flags.includes('overpass_timing')) {
      check(P, 'headline overpass caveat', await page.locator('[data-caveat="overpass_timing"]').first().innerText(), d.caveats.overpass_timing)
    } else {
      check(P, 'no overpass caveat outside Punjab Oct–Nov 2022+', String(await page.locator('[data-caveat="overpass_timing"]').count()), '0')
    }
    // KPI cards
    const card = (label) => page.locator('.card').filter({ has: page.locator('span.eyebrow', { hasText: label }) }).first().innerText()
    const lt = d.latest
    const tm = await card('This month')
    check(P, 'KPI this month value', tm, fmtInt(lt.value))
    check(P, 'KPI this month interval', tm, `90% ${fmtInt(lt.lo)}–${fmtInt(lt.hi)}`)
    const lastFull = lt.mtd ? lt.m - 1 : lt.m
    let ytd = 0, med = 0
    for (let m = 1; m <= lastFull; m++) { ytd += d.months.find((r) => r.y === lt.y && r.m === m).H; med += d.climatology.median[m - 1] }
    const yt = await card('Year to date')
    check(P, 'KPI YTD ratio', yt, fmtRatio(ytd / med))
    check(P, 'KPI YTD sums', yt, `${fmtInt(ytd)} vs typical ${fmtInt(med)}`)
    const peak = d.climatology.median.indexOf(Math.max(...d.climatology.median))
    const pk = await card('Peak month')
    check(P, 'KPI peak month', pk, MONTHS[peak])
    check(P, 'KPI peak median', pk, `typical median ${fmtInt(d.climatology.median[peak])}`)
    check(P, 'KPI static removed', await card('Static sources removed'), fmtInt(d.quality.masked_static_total))
    // gauge (Is this normal?) — last full month
    const g = await page.locator('section[aria-labelledby="normal-h"]').innerText()
    if (!lcRec.guard) {
      check(P, 'gauge ratio', g, fmtRatio(lcRec.ratio))
      const [p0, p1] = lcRec.pct
      const pl = p1 === 0 ? 'below every baseline year' : p0 === p1 ? `${ord(p0)} percentile` : `${ord(p0)}–${ord(p1)} percentile`
      check(P, 'gauge percentile', g, pl)
    }
    check(P, 'gauge baseline median', g, `median ${fmtInt(d.climatology.median[lc.m - 1])} fire-days`)
    if (lcRec.rp && lcRec.ratio > 1 && !lcRec.guard) {
      // QA #23: the return period shown must agree with the percentile next to it
      check(P, 'gauge return period', g, `about 1-in-${Math.round(lcRec.rp)} years`)
      const [p0, p1] = lcRec.pct
      check(P, 'rp consistent with pct', String(100 / (100 - p0) - 0.05 <= lcRec.rp && lcRec.rp <= 100 / (100 - Math.min(p1, 95.3)) + 0.05), 'true')
    }
    // validation badge
    const hdr = await page.locator('main header').first().innerText()
    if (d.validation) check(P, 'validation badge', hdr, d.validation.low_activity ? 'low-activity region' : `${d.validation.loyo_err_pct}% out-of-sample error`)
    if (d.detail) check(P, 'adds card ratio (native ÷ MODIS-eq)', await page.getByTestId('adds-card').innerText(), `${d.detail.adds.ratio.toFixed(1)}×`)
    // QA #67: the exchange-rate sentence covers every month and its range is the true min–max
    const prov = await page.locator('section[aria-labelledby="prov-h"]').innerText()
    if (d.method === 'pooled') check(P, 'calibration: single rate', prov, d.k.pool.toFixed(2))
    else {
      check(P, 'calibration: range min–max of all months', prov, `${Math.min(...d.k.month).toFixed(2)}–${Math.max(...d.k.month).toFixed(2)}`)
      const miss = MONTHS.filter((mn, i) => !contains(prov, `${mn} ${d.k.month[i].toFixed(2)}`))
      check(P, 'calibration: all 12 months listed', miss.length ? `missing ${miss.join(',')}` : 'ok', 'ok')
    }
  }

  // ---- High detail mode (QA #44): the same checks against the native VIIRS fields --------------------------------
  for (const { id } of meta.regions) {
    const d = J(`regions/${id}.json`)
    if (!d.detail) continue
    const P = `/r/${id}?mode=detail`
    await page.goto(base + P, { waitUntil: 'load' })
    await page.waitForSelector('svg[role="grid"] [role="gridcell"]')
    await page.waitForTimeout(900)
    const det = d.detail
    const lc = det.latest_complete
    const lcRec = d.months.find((r) => r.y === lc.y && r.m === lc.m)
    const head = await page.locator('main p.font-display').first().innerText()
    check(P, 'detail: mode chip', await page.getByTestId('mode-chip').innerText(), 'High detail')
    check(P, 'detail: headline month', head, `${FULL[lc.m - 1]} ${lc.y}`)
    if (lcRec.V_guard) check(P, 'detail: headline guard', head, 'too little fire to judge')
    else check(P, 'detail: headline ratio', head, `${fmtRatio(lcRec.V_ratio)} a typical ${FULL[lc.m - 1]}`)
    const card = (label) => page.locator('.card').filter({ has: page.locator('span.eyebrow', { hasText: label }) }).first().innerText()
    const lt = det.latest
    const tm = await card('This month')
    check(P, 'detail: KPI this month value', tm, fmtInt(lt.value))
    const peak = det.climatology.median.indexOf(Math.max(...det.climatology.median))
    check(P, 'detail: KPI peak median', await card('Peak month'), `typical median ${fmtInt(det.climatology.median[peak])}`)
    check(P, 'detail: baseline label', await page.getByTestId('detail-note').innerText(), `${det.baseline[0]}–${det.baseline[1]}`)
    const firstRing = await page.locator('svg[role="grid"] [role="gridcell"]').first().getAttribute('aria-label')
    check(P, 'detail: record starts 2012', firstRing ?? '', '2012')
  }

  // ---- stories (QA #51): numbers in the steps match the JSON -------------------------------------------------------
  {
    const P = '/story/punjab'
    const d = J('regions/punjab.json')
    await page.goto(base + P, { waitUntil: 'load' })
    await page.waitForSelector('[data-step]')
    const txt = (await page.locator('[data-step]').allInnerTexts()).join(' ')
    const yrs = d.annual.filter((a) => a.complete && a.rankable !== false && a.H != null)
    const peak = [...yrs].sort((a, b) => b.H - a.H)[0]
    check(P, 'story: biggest year', txt, `${peak.y} (${fmtInt(peak.H)} fire-days`)
    check(P, 'story: raw jump', txt, `+${fmtInt(d.validation.step_raw_pct)}%`)
    check(P, 'story: last year', txt, `${fmtInt(yrs.at(-1).H)} in ${yrs.at(-1).y}`)
    const S = '/story/se_australia'
    const a = J('regions/se_australia.json')
    await page.goto(base + S, { waitUntil: 'load' })
    await page.waitForSelector('[data-step]')
    const t2 = (await page.locator('[data-step]').allInnerTexts()).join(' ')
    const dec = a.months.find((r) => r.y === 2019 && r.m === 12)
    check(S, 'story: Dec 2019 fire-days', t2, `December 2019 had ${fmtInt(dec.H)} fire-days`)
    check(S, 'story: Dec 2019 ratio', t2, `${fmtRatio(dec.ratio)} a typical December`)
    const M = '/story/mauritius'
    const mu = J('regions/mauritius.json')
    await page.goto(base + M, { waitUntil: 'load' })
    await page.waitForSelector('[data-step]')
    const t3 = (await page.locator('[data-step]').allInnerTexts()).join(' ')
    const g = mu.months.filter((r) => !r.flags.includes('mtd')).slice(-24).filter((r) => r.guard).length
    check(M, 'story: guarded months', t3, `last 24 complete months, ${g} were`)
  }

  // ---- landing: globe panel + region cards ---------------------------------------------------------------------
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  const panel = await page.locator('div.rounded-card').filter({ hasText: 'fire-days (MODIS-equivalent)' }).first().innerText()
  const frame = panel.match(/([A-Z]{3}) (\d{4})/)
  if (!frame) check('/', 'globe frame counter', panel, 'MON YYYY', false)
  else {
    const fm = MONTHS.findIndex((x) => x.toUpperCase() === frame[1]) + 1
    const fy = Number(frame[2])
    for (const { id } of meta.regions) {
      const d = J(`regions/${id}.json`)
      const r = d.months.find((x) => x.y === fy && x.m === fm)
      check('/', `globe panel ${id} ${frame[0]}`, panel, `${d.name.split(' (')[0]}: ${fmtInt(r.H)}`)
    }
  }
  for (const { id } of meta.regions) {
    const d = J(`regions/${id}.json`)
    const lcRec = d.months.find((r) => r.y === d.latest_complete.y && r.m === d.latest_complete.m)
    const txt = await page.locator(`a[href="/r/${id}"]`).filter({ has: page.locator('svg') }).first().innerText()
    check('/', `region card ${id}`, txt, lcRec.guard ? 'too little fire' : fmtRatio(lcRec.ratio))
  }

  // ---- proof: validation cards per region + timing card -----------------------------------------------------------
  const val = J('dataset/validation_v1.json').regions
  await page.goto(base + '/proof', { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  for (const { id, name } of meta.regions) {
    await page.getByRole('tab', { name: name.split(' (')[0] === 'Mauritius' ? 'Mauritius' : (await page.getByRole('tab').allInnerTexts()).find((t) => name.startsWith(t.split(' ')[0])) }).click()
    await page.waitForTimeout(500)
    const s = val[id].summary
    const res = val[id].results[s.method]
    const cards = await page.locator('div.grid').filter({ hasText: 'Out-of-sample annual error' }).first().innerText()
    check('/proof', `${id} V1 MAPE`, cards, `${res.V1.mape_pct}%`)
    check('/proof', `${id} V1 bias`, cards, `bias ${res.V1.bias_pct}%`)
    check('/proof', `${id} V3 step`, cards, `${s.step_raw_pct > 0 ? '+' : ''}${fmtInt(s.step_raw_pct)}% → ${s.step_harm_pct > 0 ? '+' : ''}${s.step_harm_pct}%`)
    if (!s.low_activity) check('/proof', `${id} MODIS-only step`, cards, `old satellite alone (${s.step_modis_pct > 0 ? '+' : ''}${s.step_modis_pct}%)`)
    else check('/proof', `${id} low-activity state`, cards, 'Too few fires')
    check('/proof', `${id} shape r`, cards, s.shape_r.toFixed(2))
    if (id === 'se_australia') check('/proof', 'Black Summer rank', cards, `#${res.V9.black_summer_rank_harmonized}`)
    if (id === 'punjab') check('/proof', 'Punjab Oct–Nov top 3', cards, res.V9.octnov_top3_harmonized.join(' · '))
    if (id !== 'se_australia' && id !== 'punjab') check('/proof', `${id} top seasons`, cards, res.V9.top3_harmonized.slice(0, 2).join(' · '))
  }
  const t = J('dataset/punjab_timing_v1.json').checks['punjab|Oct–Nov (rice residue)']
  const tc = await page.locator('section[aria-labelledby="timing-h"]').innerText()
  check('/proof', 'timing Aqua÷S-NPP', tc, `×${t.aqua_rel_2022_2026.toFixed(1)}`)
  check('/proof', 'timing Aqua÷NOAA-20', tc, `×${t.aqua_n20_rel_2022_2026.toFixed(1)}`)
  check('/proof', 'timing night share', tc, `×${t.night_rel_2022_2026.toFixed(1)}`)
  const lastT = t.series.filter((s) => s.aqua_snpp_rel != null).pop()
  check('/proof', 'timing last year', tc, `×${lastT.aqua_snpp_rel.toFixed(1)} in ${lastT.y}`)

  // ---- data page -----------------------------------------------------------------------------------------------------
  await page.goto(base + '/data', { waitUntil: 'load' })
  await page.waitForTimeout(800)
  check('/data', 'data end', await page.locator('header').filter({ hasText: 'Harmonized Hotspot Record' }).innerText(), `Data through ${meta.data_end}`)
} catch (e) {
  results.push({ page: '?', what: 'exception', expected: '', ok: false, shown: String(e.message).slice(0, 200) })
} finally {
  await browser.close()
  if (server) { server.kill(); if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) }
}
const bad = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.page.padEnd(16)} ${r.what}${r.ok ? '' : `\n      expected "${r.expected}" in: ${r.shown}`}`)
console.log(`\n${results.length - bad.length}/${results.length} claims match the published JSON`)
process.exitCode = bad.length ? 1 : 0
