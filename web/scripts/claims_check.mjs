// Claims check: every number shown in headlines, KPI cards, gauges, validation cards, the globe panel and the Proof
// timing card must match the published JSON (same rounding as the app). Exits 1 on any mismatch.
// Usage: npm run build && node scripts/claims_check.mjs [baseUrl]   (starts `vite preview` unless a URL is given)
import { spawn, spawnSync } from 'node:child_process'
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
const nf2s = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 2 })
// #81b: parity % with 2 significant figures, computed here independently of the app
const parityPct = (p) => `${nf2s.format((Math.abs(p.api - p.record) / p.record) * 100)}%`
// #82: range over months with ≥ low_n_threshold fire-days; low-reliability months named separately
const kRange = (k) => {
  const ok = k.month.filter((_, i) => !k.low_n?.[i]); const low = k.month.map((v, i) => [v, i]).filter(([, i]) => k.low_n?.[i])
  return `${Math.min(...ok).toFixed(2)}–${Math.max(...ok).toFixed(2)}` + (low.length ? ` (${low.map(([v, i]) => `${MONTHS[i]} ${v.toFixed(2)}`).join(', ')} ${low.length === 1 ? 'rests' : 'rest'} on few fires, low reliability)` : '')
}
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
      check(P, 'calibration: range over reliable months (#82)', prov, kRange(d.k))
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

  // ---- Fire Watch: statuses, the N/X/M backtest numbers and the saved briefings ------------------------------------
  {
    const w = J('watch.json')
    const cache = J('watch_cache.json')
    const t = w.backtest.totals
    for (const P of ['/watch', '/proof']) {
      await page.goto(base + P, { waitUntil: 'load' })
      await page.getByTestId('watch-proof-headline').waitFor({ timeout: 15000 })
      const h = await page.getByTestId('watch-proof-headline').innerText()
      check(P, 'raw alerts N', h, `raised ${t.raw_alerts}`)
      check(P, 'switch-only alerts X', h, `${t.raw_only_alerts} of them caused only by the satellite switch`)
      check(P, 'harmonized alerts M', h, `harmonized data: ${t.harmonized_alerts}`)
    }
    await page.goto(base + '/watch', { waitUntil: 'load' })
    await page.getByTestId('watch-card').first().waitFor()
    for (const [id, r] of Object.entries(w.regions)) {
      const card = page.locator(`[data-testid="watch-card"][data-region="${id}"]`)
      check('/watch', `${id} status`, (await card.getAttribute('data-status')) ?? '', r.status)
      const b = cache.briefings[`${id}|responder`]
      if (r.status !== 'Normal') {
        check('/watch', `${id} briefing shown`, (await card.getByTestId('watch-briefing').innerText()).replace(/,(?=\d{3})/g, ''), b.answer.slice(0, 60).replace(/,(?=\d{3})/g, ''))
        // every number in a saved briefing appears in its lookups (same rule as the server-side check)
        for (const k of ['responder', 'scientist']) {
          const bb = cache.briefings[`${id}|${k}`]
          const pool = bb.trace.map((x) => JSON.stringify(x.result ?? x.result_summary)).join(' ').replace(/,(?=\d{3})/g, '')
          const nums = (bb.answer.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => s.replace(/,/g, ''))
          const bad = nums.filter((n) => !pool.includes(n) && !pool.includes(n.replace(/\.0$/, '')))
          check('/watch', `${id} ${k} briefing numbers all in its lookups`, bad.length ? `unverified ${bad.join(',')}` : 'ok', 'ok')
          const fc = /\b(expect(ed)? to|can expect|will (be|likely|continue|see|rise|fall|increase|decrease)|is likely to|are likely to|forecast(s|ed)?|coming (days|weeks|months)|upcoming|in the next|next (week|month|season))\b/i.test(bb.answer)
          check('/watch', `${id} ${k} briefing has no forecast language`, fc ? 'forecast wording' : 'ok', 'ok')
        }
      }
    }
    await page.goto(base + '/', { waitUntil: 'load' })
    await page.getByTestId('card-watch').first().waitFor({ timeout: 15000 })
    const badges = await page.getByTestId('card-watch').evaluateAll((els) => els.map((e) => e.querySelector('[data-status]')?.getAttribute('data-status')))
    check('/', 'home Fire Watch badges match watch.json', badges.join('|'), Object.values(w.regions).map((r) => r.status).join('|'), badges.join('|') === Object.values(w.regions).map((r) => r.status).join('|'))
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
    { // #82: exchange-rate sentence + "Method in six steps" use the reliable-months range
      const dk = J(`regions/${id}.json`); const main = await page.locator('main').innerText()
      if (dk.method !== 'pooled') {
        const n = main.split(kRange(dk.k)).length - 1
        check('/proof', `${id} k range (reliable months) in exchange-rate line + six steps`, String(n >= 2), 'true')
        const full = `${Math.min(...dk.k.month).toFixed(2)}–${Math.max(...dk.k.month).toFixed(2)}`
        if (dk.k.low_n?.some(Boolean)) check('/proof', `${id} no all-months range`, main.includes(full) ? `found ${full}` : 'ok', 'ok')
      }
    }
    if (id === 'se_australia') check('/proof', 'Black Summer rank', cards, `#${res.V9.black_summer_rank_harmonized}`)
    if (id === 'punjab') check('/proof', 'Punjab Oct–Nov top 3', cards, res.V9.octnov_top3_harmonized.join(' · '))
    if (id !== 'se_australia' && id !== 'punjab') check('/proof', `${id} top seasons`, cards, res.V9.top3_harmonized.slice(0, 2).join(' · '))
  }
  { // Round 5B: Tanzania study check (Proof tab + Explore) — every number from regions/tanzania.json study_check
    const sc = meta.regions.some((r) => r.id === 'tanzania') ? J('regions/tanzania.json').study_check : null
    if (sc) {
      const pc = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)}%`
      for (const P of ['/proof?region=tanzania', '/r/tanzania']) {
        await page.goto(base + P, { waitUntil: 'load' }); await page.waitForSelector('[data-testid="study-check"]'); await page.waitForTimeout(300)
        const card = await page.locator('[data-testid="study-check"]').innerText()
        check(P, 'study check harmonized change', card, pc(sc.harmonized.change_pct))
        check(P, 'study check MODIS-only change', card, pc(sc.modis_only.change_pct))
        check(P, 'study check raw step', card, pc(sc.raw_step_2012_pct))
        check(P, 'study check years', card, `${sc.years_a[0]}–${sc.years_a[1]} vs ${sc.years_b[0]}–${sc.years_b[1]}`)
        check(P, 'study check says areas differ', card, 'The areas differ')
      }
      await page.goto(base + '/proof', { waitUntil: 'load' }); await page.waitForTimeout(800)
    }
  }
  { // Round 5B: Proof "Prediction model, tested" — every number from api/model_card.json, same rounding as the app
    let mc = null; try { mc = J('api/model_card.json') } catch { /* model not published */ }
    if (mc) {
      const P = mc.evaluation.pooled, ab = mc.ablation, pc = (v) => `${Math.round(v)}%`, f2 = (v) => v.toFixed(2)
      const sg = (v, d) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`
      await page.goto(base + '/proof#model', { waitUntil: 'load' }); await page.waitForSelector('[data-testid="model-card"]'); await page.waitForTimeout(400)
      const card = await page.locator('[data-testid="model-card"]').innerText()
      const plain = await page.locator('[data-testid="model-plain"]').innerText()
      check('/proof', 'model top-10% capture (plain sentence)', plain, pc(P.model.capture10))
      check('/proof', 'climatology top-10% capture (plain sentence)', plain, pc(P.climatology.capture10))
      check('/proof', 'model gate wording', plain, mc.gate.passed ? 'Watching the top 10% of hexagons' : 'Does not beat the seasonal baseline yet')
      check('/proof', 'model PR-AUC', card, f2(P.model.pr_auc)); check('/proof', 'climatology PR-AUC', card, `usual season ${f2(P.climatology.pr_auc)}`)
      check('/proof', 'model ROC-AUC', card, f2(P.model.roc_auc)); check('/proof', 'model F1', card, f2(P.model.f1))
      check('/proof', 'persistence capture', card, `last month’s fire ${pc(P.persistence.capture10)}`)
      const abl = await page.locator('[data-testid="model-ablation"]').innerText()
      check('/proof', 'ablation raw PR-AUC', abl, f2(ab.raw.pr_auc)); check('/proof', 'ablation raw capture', abl, pc(ab.raw.capture10))
      check('/proof', 'ablation difference PR-AUC', abl, `${sg(ab.difference_harmonized_minus_raw.pr_auc, 2)} PR-AUC`)
      check('/proof', 'ablation difference capture', abl, `${sg(ab.difference_harmonized_minus_raw.capture10, 1)} percentage points`)
      const lo = Object.values(mc.leave_one_region_out).filter((x) => x.model && x.climatology)
      check('/proof', 'LORO wins', await page.locator('[data-testid="model-loro"]').innerText(), `in ${lo.filter((x) => x.model.pr_auc > x.climatology.pr_auc).length} of ${lo.length} held-out regions`)
      check('/proof', 'model version', await page.locator('[data-testid="model-version"]').innerText(), `version ${mc.version}`)
      const hist = J('api/model_history.json').runs.at(-1)
      check('/proof', 'model history last decision', await page.locator('[data-testid="model-history"]').innerText(), hist.decision)
      // Explore: the layer toggle exists exactly when a likelihood file exists, default OFF, labelled with the scored month
      const lk = (() => { try { return J('api/likelihood/tanzania.json') } catch { return null } })()
      await page.goto(base + '/r/tanzania', { waitUntil: 'load' }); await page.waitForSelector('[data-testid="map-legend"]'); await page.waitForTimeout(1500)
      const tog = page.locator('[data-testid="lik-toggle"]')
      if (lk) {
        const FULLM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
        check('/r/tanzania', 'likelihood toggle month', await tog.innerText(), `${FULLM[+lk.target_month.slice(5, 7) - 1]} ${lk.target_month.slice(0, 4)}`)
        check('/r/tanzania', 'likelihood layer default OFF', String(await tog.locator('input').isChecked()), 'false')
      } else check('/r/tanzania', 'no likelihood toggle without a published model', String(await tog.count()), '0')
      await page.goto(base + '/proof', { waitUntil: 'load' }); await page.waitForTimeout(800)
    }
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
  // ---- P1.7 Data page parity line, P1.1 range summary, P1.8 paper + slides ------------------------------------------
  {
    const par = J('api/hotspots_parity.json')
    const t = await page.getByTestId('open-api').innerText()
    check('/data', 'hotspots parity (API)', t, fmtInt(par.api)); check('/data', 'hotspots parity (record)', t, fmtInt(par.record)); check('/data', 'hotspots parity % (2 s.f.)', t, parityPct(par))
    const se = J('regions/se_australia.json')
    await page.goto(base + '/r/se_australia?from=2019-07&to=2020-03&mode=longterm', { waitUntil: 'load' })
    await page.getByTestId('range-total').waitFor({ timeout: 15000 })
    const sel = se.months.filter((r) => (r.y === 2019 && r.m >= 7) || (r.y === 2020 && r.m <= 3))
    check('/r/se_australia range', 'total fire-days', await page.getByTestId('range-total').innerText(), fmtInt(sel.reduce((a, r) => a + r.H, 0)))
    check('/r/se_australia range', 'typical', await page.getByTestId('range-typical').innerText(), fmtInt(sel.reduce((a, r) => a + se.climatology.median[r.m - 1], 0)))
    const docs = Object.fromEntries(meta.regions.map(({ id }) => [id, J(`regions/${id}.json`)]))
    const w = J('watch.json').backtest.totals
    for (const [path, sel2] of [['/paper', '[data-testid="paper"]'], ['/slides?print=1', '[data-testid="slides-print"]']]) {
      await page.goto(base + path, { waitUntil: 'load' })
      await page.locator(sel2).waitFor({ timeout: 20000 }); await page.waitForTimeout(800)
      const txt = await page.locator('main').innerText()
      check(path, 'no missing placeholder', txt.includes('⟨missing') ? 'missing' : 'ok', 'ok')
      for (const id of ['punjab', 'madagascar', 'se_australia']) check(path, `${id} V1 error`, txt, `${nf1.format(docs[id].validation.loyo_err_pct)}%`)
      check(path, 'Punjab raw step', txt, `${fmtInt(docs.punjab.validation.step_raw_pct)}%`)
      check(path, 'raw alerts', txt, String(w.raw_alerts)); if (path === '/paper') check(path, 'harmonized alerts', txt, String(w.harmonized_alerts))
      const ru = J('api/reunion.json').summary
      if (path.startsWith('/slides')) {
        check(path, 'exactly 7 slides', String(await page.getByTestId('slide').count()), '7')
        const tm = J('dataset/punjab_timing_v1.json').checks['punjab|Oct–Nov (rice residue)']
        check(path, 'Aqua ÷ VIIRS ratio (slide 3)', txt, `×${tm.aqua_rel_2022_2026.toFixed(1)}`)
        // insurance index recomputed independently from the open API file (Punjab, 90th percentile)
        const ser = J('api/series/punjab.json'), P = 0.9
        const q = (vs, p) => { const s2 = [...vs].sort((a, b) => a - b); const i = (s2.length - 1) * p, lo = Math.floor(i); return s2[lo] + (s2[Math.min(lo + 1, s2.length - 1)] - s2[lo]) * (i - lo) }
        const thr = (c) => Array.from({ length: 12 }, (_, m) => q(ser.months.filter((x) => x[1] === m + 1 && x[0] >= ser.baseline[0] && x[0] <= ser.baseline[1] && x[c] != null).map((x) => x[c]), P))
        const tH = thr(2), tR = thr(5)
        const rawOnly = ser.months.filter((x) => x[0] >= 2012 && x[0] <= 2025 && x[5] != null && x[5] > tR[x[1] - 1] && !(x[2] != null && x[2] > tH[x[1] - 1])).length
        check(path, 'insurance raw-only payouts after 2012 (slide 2)', txt, `${rawOnly} raw-only payouts`)
        check(path, 'raw-only alerts (slide 2)', txt, `${w.raw_only_alerts} caused only by the satellite switch`)
        check(path, 'projection wins (slide 6)', txt.includes(' of ') ? 'ok' : 'none', 'ok')
        check(path, 'author line', txt, 'Murugun Sharma Roma Rishi (Muru)')
      }
      if (path === '/paper') {
        const prov = docs.punjab.months.filter((r) => r.flags.includes('provisional'))
        const span = prov.length ? (prov[0].y === prov.at(-1).y ? `${MONTHS[prov[0].m - 1]}–${MONTHS[prov.at(-1).m - 1]} ${prov[0].y}` : `${MONTHS[prov[0].m - 1]} ${prov[0].y} – ${MONTHS[prov.at(-1).m - 1]} ${prov.at(-1).y}`) : 'none'
        check(path, 'provisional months from flags', txt, span)
        check(path, 'S-NPP wording', txt, 'data delivery ceased 2 Nov 2026')
        check(path, 'author line', txt, 'Murugun Sharma Roma Rishi (Muru)')
        check(path, 'no bare "Link" reference', /^\s*.*\.\s*Link\s*$/m.test(txt) ? 'Link' : 'ok', 'ok')
        if (ru.modis.median_lag_days === ru.viirs.median_lag_days) check(path, 'Réunion lag wording', txt, `median first-detection lag of ${ru.modis.median_lag_days} days for both sensors`)
      }
      check(path, 'Réunion MODIS detected', txt, `${ru.modis.detected}`); check(path, 'Réunion VIIRS detected', txt, `${ru.viirs.detected}`)
      check(path, 'hotspots parity % (2 s.f., same as /data)', txt, parityPct(J('api/hotspots_parity.json')))
      check(path, 'never prints negative zero', /(?<![\d.])-0(?![.\d])/.test(txt) ? 'found -0' : 'ok', 'ok')
      check(path, 'Black Summer rank', txt, `#${docs.se_australia.validation.v9.black_summer_rank_harmonized} of ${docs.se_australia.validation.v9.n_seasons}`)
    }
  }
} catch (e) {
  results.push({ page: '?', what: 'exception', expected: '', ok: false, shown: String(e.message).slice(0, 200) })
} finally {
  await browser.close()
  if (server) { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); server.kill() }
}
const bad = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.page.padEnd(16)} ${r.what}${r.ok ? '' : `\n      expected "${r.expected}" in: ${r.shown}`}`)
console.log(`\n${results.length - bad.length}/${results.length} claims match the published JSON`)
process.exitCode = bad.length ? 1 : 0
