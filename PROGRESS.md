# Fire Rings — PROGRESS

Resume any session with: **"Continue from PROGRESS.md"** (read this file + CLAUDE.md first).
Status keys: `todo` · `doing` · `done` · `blocked`
Live: https://fire-rings.vercel.app (Vercel, root = web, auto-deploys on push to main)

## QA run — 10 Nov (docs/QA_ISSUES.md items) — running log
- **Phase 0 (numbers) ✅** #23 return period now = 100/(100−p) from the shown percentile range (60 months disagreed before; e.g. SE Australia Jul 2025 66th–71st pct: "1-in-4" → "about 1-in-3"); unit + output tests. Long-term snapshot test added — harmonized values unchanged. #29 drawer shows "VIIRS n · MODIS n". #30 satellite gap days hatched in the daily chart; SE Aus 26–27 Jul 2025 checked = real low (S-NPP operating, normal counts elsewhere in Australia). #35 one plain calibration sentence per region shared by Provenance/Proof/METHODS. #37 every Proof card has a status; V9 scored only against a sourced event (Black Summer → Royal Commission tabling release), other regions "info" with a reason. #43 Mauritius shows "too little fire to validate reliably". #45 Punjab August k=1.20 = small-sample noise (126 vs 92 fire-days in 8 years, 0.13% of fire-days), labelled "few fires — low reliability" (months < 200 fire-days); documented in METHODS + validation_report. #48 timing reports now real checked links (NASA Earth Observatory; ISRO via ThePrint; iFOREST via The Tribune).
- **Phase 1 (bugs) ✅** #12 charts stay mounted when the table shows (no shrink) + e2e; #15 Seasonality/Annual totals recomputed for a box (no vanishing) + e2e; #16 box clipped to the region with a warning, outside/empty boxes refused + e2e; #58 Ask keeps each question with its own answer/error; #52 cached answers are labelled with the style they were written in (both styles regenerated in Phase 2).
- **Phase 2 (Ask reliability) ✅** #59 per-model budget 22 s, 55 s total, `maxDuration` 60, JSON log lines with per-step timings (no keys), "Thinking… looking up numbers" state; a circuit breaker benches a model that keeps failing for 10 min (`GEMINI_MODEL=gemini-flash-latest` timed out repeatedly in testing → see Muru to do). #60 direct tools `get_year_total`, `get_month`, `get_typical`, `compare_years` (each returns 90% range, flags and full-sentence caveats); verified: "How many fire-days did Mauritius have in 2015?" → 23, one lookup, low-activity caveat. Answer-quality set `scripts/ask_quality.ts` (15 questions × 4 regions, expected numbers read from JSON) → `docs/ask_quality.md`. #61 region names in the question switch the region ("Switched to Mauritius"). #54 `GET /api/health` classifies Gemini (ok / invalid_key / model_not_found / quota_exceeded / timeout) and FIRMS, never returns keys; error class logged. #56 answers carry the same flags as charts (low activity, Terra-only, provisional, Punjab detection time); caveat forced to one sentence from a fixed list. #53 Responder vs Scientist prompts differ in depth, not numbers; ⓘ explains them; style badge on each answer. #33 cache regenerated: 32/32 (4 chips × 4 regions × 2 styles); `ask_e2e.mjs` checks all 32 through the fallback (32/32 pass, in `test:e2e`). #55 calm "⚡ Instant answer (saved …) ⓘ" chip replaces the yellow banner; uncached free text gets a friendly message + chips.

## ⚠ BLOCKER: live layer needs FIRMS_MAP_KEY in Vercel Production
Production `/api/live?region=punjab` currently returns `{"ok":false,"error":"not_configured"}`. The deployed function can't see `FIRMS_MAP_KEY` (deploy `cfe4170`, built after the push). The code works: locally with the same key it returns Punjab 1,921 and Madagascar 9,236 detections. The UI shows "LIVE · feed temporarily unavailable" as designed.
**To fix (2 min):**
1. Vercel → project **fire-rings** → **Settings → Environment Variables**.
2. Check that a variable named exactly `FIRMS_MAP_KEY` (no spaces) exists, with **Production** ticked. Add it if missing, using the value from your local `.env`.
3. **Deployments** → latest → **⋯ → Redeploy**. Env changes only apply to new deployments.
4. Check https://fire-rings.vercel.app/api/live?region=punjab: you should see `"ok":true` and a `count`.

## ⚠ TODO for Muru
- ~~ask_cache missing entry~~ **done**: 16/16 cached (Mauritius chip regenerated with gemini-3.5-flash-lite; Punjab chips regenerated so they carry the detection-time caveat).
- **Gemini quota.** Most models hit 429 (free-tier quota) yesterday; `gemini-3.5-flash-lite` still works and is first in the cache script. For a smooth live demo, consider a paid key or a quota increase before Saturday.

## Update 2 — overnight run (map fixes, live layer, QA)
- **Fixes:**
  - Globe markers now sit at the median detection position (Mauritius on the main island).
  - Annual-bar labels no longer collide.
  - Map hexagons are softer (lower fill, thin outline) so place names stay readable. MODIS ● / VIIRS ▲ detection points show at any zoom for Mauritius (all months published) and from zoom 9 for the latest months elsewhere.
  - Mauritius opens on the main island, with a "Rodrigues →" toggle.
  - New line under the map: "Hexagons are ~36 km² on purpose…".
  - The Punjab detection-time caveat moved from the big headline to its own amber line, so the claim reads first.
  - Landing cards show a short "⚑ Detection-time caveat" note; the phone hero text has a backing panel; the 404 page is redesigned.
- **Live layer:** `/api/live?region=` returns the last 72 h of VIIRS NOAA-20/21 NRT from FIRMS (key server-side). It uses the same filters as the record (low confidence, known-static r9, region footprint: res-7 for Punjab drops Pakistani Punjab), a 45-min cache, a 10 s timeout and an empty state. The LIVE badge appears on region pages and the globe panel; points are cyan rings labelled "near-real-time, provisional". **Never mixed into the record.** Local check, 9 Nov: Punjab 1,921 detections in 72 h (381 outside India dropped), Madagascar 9,236, SE Australia 647, Mauritius 2.
- **QA:** `docs/QA_WALKTHROUGH.md` is generated from the JSON (`node web/scripts/qa_doc.mjs`, every expected value current). `web/scripts/claims_check.mjs` checks **93/93 on-screen numbers** against the published JSON; it's part of `npm run test:e2e`. An injected wrong value is caught, after I fixed a substring-matching flaw in the first version. Decision 20.
- Checked and not a bug: bright Punjab hexagons near the "Lahore" map label are Amritsar/Tarn Taran (India). Zero Pakistan-side detections exist in any raw file.
- Tests: **40 pytest** · e2e 7/7 · claims 93/93 locally **and on production** · all routes fit at 360 px.
- Live check on production: blocked by the missing Vercel env var (see BLOCKER at the top); the graceful empty state was verified live.

## Update — follow-up run (detection-time check, Terra-only rule)
- **Punjab satellite-evasion check: the signal is clear and specific to Punjab's autumn.** Daytime Aqua÷S-NPP fire cell-days relative to 2013–2019, Punjab Oct–Nov: 2022 ×1.05 · 2023 ×1.13 · 2024 ×1.28 · 2025 ×1.83 · 2026 ×2.02 (2022–26 mean ×1.46; ×1.34 against NOAA-20). Comparison seasons stay flat: Punjab Apr–May ×0.95, Madagascar Sep–Oct ×1.02, SE Australia Oct–Dec ×0.86. VIIRS night share in Punjab Oct–Nov rose ×6.2, and morning Terra fell ×0.35. Aqua passes later in the afternoon since Dec 2021, so this supports reports that burning moved after ~3 pm. Caveat: 2025–26 rest on few fires (4,257 and 1,138 S-NPP day cell-days). docs/punjab_timing.md · Decision 18.
  - The app now shows "Detected at satellite overpass times; burning has reportedly shifted to late afternoon, so recent seasons may be undercounted" on Punjab Oct–Nov 2022+. It appears on headlines, tooltips, the drawer, a new Proof card with chart, and in `get_month`/`get_rankings`/`get_quality`. **The harmonized numbers are unchanged.**
- **Terra-only months (2001-01 → 2002-06)** are now hatched, labelled "Terra only — wider uncertainty", and excluded from ranks, return periods, V9 season ranks, annual rankings and similar years. **Madagascar's top Jul–Jun seasons are now 2016–17, 2019–20, 2007–08** (2001–02 was #1 before). Mauritius: 2013–14, 2006–07, 2010–11. SE Australia (Black Summer #1) and Punjab (Oct–Nov top 3: 2016, 2005, 2021) are unchanged. Decision 19.
- Full rerun from raw: 73 s; **36 tests pass** (10 new output checks); e2e 7/7; lint and build clean.

## Summary for Muru (2026-11-09, end of unattended run)

**Live:** https://fire-rings.vercel.app. Tags `v0.9` and `v1.0` pushed. Pages: Landing (globe time-lapse, sensor timeline, region cards) · `/r/{punjab,madagascar,se_australia,mauritius}` (full dashboard) · `/proof` · `/data` · `/ask` · `/story/madagascar`.

**Done:** Phases 0–8. The pipeline rebuilds everything from raw in about 50 s (`python pipeline/run_all.py`, 26 tests pass). Data runs to 2026-11-08, and Punjab to 2026-11-09 via the FIRMS API.

**Validation** (docs/validation_report.md; calibration on Jul 2012 – Dec 2019 only):

| Region | Method | V1 out-of-sample annual error (bias) | V3 step at 2012: raw → harmonized (MODIS alone) | Pettitt p raw → harm | Verdict |
|---|---|---:|---|---|---|
| Punjab–Haryana | monthly ratios (τ=10) | 5.6% (−0.0%) | +199% → +3.1% (+4.2%) | 0.005 → 0.92 | ✅ V1 ✅ V3 |
| Madagascar | monthly ratios (τ=300) | 2.8% (0.0%) | +294% → +2.9% (+3.0%) | 0.005 → 1.0 | ✅ V1 ✅ V3 |
| SE Australia | **single ratio (fallback 1)** | 9.2% (+3.4%) | +168% → +9.2% (+10.2%) | 0.005 → 0.61 | ✅ V1 ✅ V3 · Black Summer #1 ✅ (monthly method failed V3 narrowly → Decision 8) |
| Mauritius | monthly ratios | 24.4% (+10.7%) | +405% → +11.1% (+5.9%) | 0.005 → 0.86 | low-activity: reported, not judged |

**Headline check (your item 1):** Punjab October 2026 = 0.08× median, the lowest October on record. It's genuine: S-NPP / NOAA-20 / NOAA-21 give 392 / 438 / 368 fire-days (Decision 13, docs/snpp_endcheck.md). The check also exposed a bug I've fixed: the API bbox included Pakistani Punjab (Decision 14).

**AI:** 30-question eval: **30/30 answered, 0 numbers outside tool results** (docs/ask_eval.md). Live `/api/ask` answered in 5.6 s. The time budget caps every call at about 26 s, and the UI shows "AI temporarily unavailable" plus cached answers.

**Decisions to review:** 1–17 below. The most important are #3 (persistence rule reading), #6 (regional gap detection), #8 (SE Australia fallback), #10 (pre-2002 Terra-only limitation), #13–14 (headline + API clipping), #15 (`--text-faint` contrast override) and #16 (Gemini model chain).

**Blocked / not done:** backup demo recording (needs you); the 2026 Submission/Judging guide check (released 13 Nov). Not built (per SOLO SCOPE): compare page, global cube, multilingual, burned-area cross-check.

**Next 5 things I'd do:**
1. Rerun `scripts/ask_eval.ts` once more with the final model and quota (the cache is complete; regenerate with `--only "region|*"` after any data change).
2. On Saturday morning: `python pipeline/01_fetch_nrt.py && python pipeline/run_all.py --from 02_unify`, check the "provisional" labels, and push (it auto-deploys).
3. Record the backup demo video and screenshots; rehearse with the 3-minute choreography (master plan §9.1).
4. Do a user test at the venue (non-tech person + mentor) and fix the top confusions. Candidates: the "vs typical" mode wording and the seam slider discoverability on mobile.
5. Optional science: replace the H3 footprint clip with a real India polygon, and add drift-chart annotations for each region on the Proof page.

## Phase 8 — Ship ✅ — master plan §10 checklist
| Item | Result | Evidence |
|---|---|---|
| Every brief item visible in the demo | ✅ | harmonized record (regions), Fire Rings + grid, seam slider, "is this normal" headline + gauge, map with presets/box, Proof, exports, Ask with trace, Data page; wow: globe, story, sensor timeline, similar years, live NRT |
| V1 and V3 numbers real and shown in the app | ✅ | /proof cards and charts read `dataset/validation_v1.json`; region header badge shows out-of-sample error |
| No number without unit, source badge and CI | ✅ with one exception | tooltips: unit + source + 90% interval + flags; KPIs/drawer show intervals; box view has no CI (stated in the UI banner) |
| Rings + grid usable by keyboard; screen-reader labels; table view | ✅ | `web/scripts/e2e.mjs` 7/7 (arrows, Enter, Esc); role=grid/row/gridcell with aria-labels; "View as table" on every chart |
| Colour-blind simulator + 4.5:1 contrast | ✅ | `docs/screens/cvd_*` (deuteranopia/protanopia/tritanopia, counts + anomaly); `web/scripts/contrast.mjs`: all text tokens ≥4.5:1 after Decision 15 |
| Hero region < 2 s on 4G; works at 360 px | ✅ (median) | `web/scripts/perf.mjs` live: 2.1 / 1.2 / 1.6 s (median 1.6 s; coldest run 2.1 s); local 1.0 s. `overflow.mjs`: all 7 routes 360 px wide |
| AI answers 30 test questions without inventing a number | ✅ | docs/ask_eval.md: 30/30, 0 unverified; server rejects unverified numbers anyway |
| CSV opens cleanly in Excel with a header comment | ✅ (note) | calendar/dataset/hotspot CSVs start with one `# Fire Rings v1 · region · dates · citation` line. Excel shows it as the first row; parsers use `comment='#'` |
| Deployed URL + backup recording + offline fallback JSON | ⚠ partial | URL ✅; ask_cache.json 16/16 ✅; backup recording ❌ (needs Muru) |
| README with GIF, METHODS.md, DATA_SOURCES.md, CITATION.cff, LICENSE | ✅ | all in repo root; GIF `docs/screens/seam.gif` |
| Submission meets 2026 guide limits | ❌ not checked | guide is released 13 Nov |

## Phase 0 — Foundations ✅
| Task | Status | Notes |
|---|---|---|
| 0.1 Toolchain check | done | Python 3.11.0, Node v20.20.2, npm 10.8.2, git 2.50.1 |
| 0.2 git init + pull `fire-rings` | done | Muru265/fire-rings, main; staged set verified (no .env/data/zips); claude.md→CLAUDE.md |
| 0.3 .venv + requirements | done | pinned versions; imports OK |
| 0.4 Raw CSV inventory | done | docs/data_inventory.md via pipeline/00_inventory.py; 11 flags |
| 0.5 config.yaml | done | 4 regions; thresholds/windows from CLAUDE.md |
| 0.6 web scaffold | done | Vite 8 / React 19 / TS 7 / Tailwind 4.3; build + lint OK; all routes 200 |
| 0.7 Push + Vercel | done | Muru confirmed live at https://fire-rings.vercel.app |

## Phase 1 — Data in ✅
| Task | Status | Notes |
|---|---|---|
| 1.1 02_unify.py + tests | done | 4 regions → data/clean/{region}.parquet. Punjab 2,776,560 · Madagascar 11,050,256 · SE Aus 4,005,563 · Mauritius 6,058 rows. 0 NRT/archive overlap, ≤2 exact dups. Spot checks: solar_date crosses midnight correctly, coords inside box, no null H3. 8 tests |
| 1.2 03_mask.py + mask_check.md | done | conf → type → known-static → persistence. Kept: Punjab 2,407,964 · Madagascar 9,504,201 · SE Aus 3,692,034 · Mauritius 5,039. Top masked cells = Port Kembla steelworks, Altona refinery, Hunter industrial, Hisar steel (no cropland). 2 tests |
| 1.3 pipeline_report.md | done | rows per region × stream × step + NRT removed by known-static (Punjab 840/15,457 = 5.4%) |

## Phase 2 — Raw calendar on screen
| Task | Status | Notes |
|---|---|---|
| 2.1 04_cube.py | done | Monthly cell-days for TERRA/AQUA/MODIS/SNPP/N20/N21 from 2000-11 to 2026-11 (313 months), plus raw hotspot counts and coverage (D, O, cov, flag). Global outages found: Terra 2001-06-16→07-03, S-NPP 2022-07-27→08-10, Aqua 2022-04-01→16, Terra 2022-10-11→23, etc. One regional gap: Aqua over Madagascar 2020-08-17→09-02. Punjab yearly cell-days MODIS ≈10–11k vs S-NPP ≈32k (2022), so the raw jump is present. 8 coverage tests |
| 2.2 interim 08_export.py (raw) | done | web/public/data/v1/regions/{id}.json (≈53 kB each, 311 months) + daily/{id}.json + meta.json. Harmonized fields null until Phase 3. Hot counts cast to int (DuckDB HUGEINT bug fixed) |
| 2.3 FireRings + GridCalendar + Legend on real JSON | done | Radial rings (2001 centre → 2026 edge, Jan at 12 o'clock), inferno t∈[0.18,0.98], quantile classes (ties merged, e.g. Mauritius), dashed 2012 ring, spoke + ring highlight, tooltip, roving-tabindex keyboard nav (role=grid/row/gridcell, aria-labels), linked hover with grid, View as table, loading/error states |
| 2.4 Playwright screenshots + review | done | web/scripts/screens.mjs → docs/screens/*.png (1440 + 390). Fixed after review: empty desktop space (added How-to-read panel), duplicate legend tiers, tooltip covering the cell (now radial offset), mobile tooltip overflow (readout panel under chart), small ring labels. Punjab raw 2012 jump clearly visible |

## Phase 3 — Harmonization + validation
| Task | Status | Notes |
|---|---|---|
| 3.1 05_calibrate.py | done | k/q/k′ per region × month, τ by LOYO Poisson deviance (Punjab 10, Madagascar 300, SE Aus 300, Mauritius 30), bootstrap ×500 + Poisson. Pooled k: Punjab 0.347, Madagascar 0.262, SE Aus 0.410, Mauritius 0.212. k′ (S-NPP/N20) ≈ 0.96–0.97 (Mauritius 0.85). Window end asserted ≤ Dec 2019. 8 calib tests |
| 3.2 06_validate.py | done | docs/validation_report.md + data/out/validation_{region}.json. All active regions pass V1 (MAPE 2.8–9.2 %) and V3 (raw step +168…+294 % → harmonized +3…+9 %, matching MODIS-only). Black Summer = #1 harmonized. SE Australia uses fallback 1 (pooled) — see Decisions |
| 3.3 07_stats.py | done | Baseline 2003–2022 climatology (median/p10/p90), per-month ratio, Weibull percentile range over bootstrap, return period (no extrapolation, `beyond_record`), rank, guard, MTD vs same days, similar years (Pearson YTD), annual totals + CI. Punjab Oct 2026 = 0.08× median, lowest October on record; confirmed by all 3 VIIRS satellites (real decline: S-NPP Oct cell-days 16,155 in 2016 → 1,096 in 2026) |
| 3.4 full 08_export.py + run_all.py | done | regions/*.json (harmonized + per-month stats), daily/, hexes/{region}/{year}.json (H3 r6 cell-days, primary stream), hotspots/{region}_{YYYY-MM}.csv (latest 2 months, header comment), dataset/ (CSV + Parquet + calibration_k_v1.csv + validation_v1.json), meta.json. `python pipeline/run_all.py` reruns raw → web in 47 s, then pytest (26 pass) |
| 3.5 validation decision (no stop) | done | See validation table in Summary. Active regions pass V1 + V3; SE Australia on fallback 1 (pooled); Mauritius low-activity (reported, not judged) |

## Phase 4 — Region dashboard ✅
| Task | Status | Notes |
|---|---|---|
| SeamSlider + colour morph | done | interpolates each cell between the raw and harmonized quantile colours; centre label Raw/Morphing/Harmonized |
| Headline + 4 KPI cards + Gauge | done | headline from per-month stats (ratio, pct range, rank "lowest/highest on record", 1-in-N, provisional/uncertain); KPIs: this month (MTD + CI), YTD vs typical, peak month, static sources removed; gauge = percentile range arc + needle |
| Anomaly mode, hatching, provisional | done | RdBu-7 reversed on log2(H/median), ▲▼ glyphs in grid, guard grey "~"; diagonal hatch = uncertain; dotted outline = provisional/MTD |
| MonthDrawer | done | daily bars vs baseline P10–P90 band + median, dot plot of baseline Months, SVG mini hex map, hotspot CSV (latest months) + daily CSV, Esc/focus handling |
| SeasonalityChart, AnnualBars | done | with tooltips + View as table |
| MapView | done | MapLibre 6 + OpenFreeMap dark, month hexes, region presets, rectangle draw, W/S/E/N inputs → box recomputes the whole calendar from H3 cells with the region's k/q/k′ + coverage (no CIs for boxes, stated in UI). Fixed MapLibre 6 worker URL under Vite |
| CSV + PNG export, View as table, states | done | calendar CSV with header comment line; PNG of rings card with legend + caption; table toggle on every chart; skeleton/error/empty states |
| Remove fake data | done | none was ever created; src/dev removed |
| Screens + self-review | done | docs/screens/*; fixed mobile horizontal overflow (charts at 600px → min-w-0), "0th percentile" wording. `node web/scripts/e2e.mjs`: 7/7 interaction checks pass, 0 console errors. Main bundle 119 kB gz (map/hex/drawer lazy) |

## Phase 5 — Proof + Data ✅
| Task | Status | Notes |
|---|---|---|
| Proof page | done | region tabs; V1/V3/shape/V9 cards with pass/fail; before/after annual chart (raw dashed vs MODIS-only vs harmonized, step annotation); drift chart (calibration band, Terra 2020 / Aqua Dec 2021 / MODIS 6.03→61.03 2023 annotations); k by month with CI + unshrunk ratio + overlap counts; known outages table (global + regional) + static-source counts; 6 limitation cards with mitigations; method summary → METHODS.md. Chart palette validated with the dataviz validator (dark): #D97706 / #3B8FCC / #B45A93 all checks pass |
| Data page | done | downloads (dataset CSV/Parquet, calibration CSV, validation JSON, meta, per-region JSON), data dictionary, static JSON API + curl example, CITATION.cff block with copy, licences (MIT code, CC BY 4.0 data), FIRMS acknowledgement, changelog |
| METHODS.md, CITATION.cff | done | full method incl. MODIS version change, regional gap rule, fallback rule |

## Phase 6 — Ask Fire Rings (AI) ✅ (cache pending — see TODO)
| Task | Status | Notes |
|---|---|---|
| web/api/ask.ts + tools.ts | done | 6 tools over the published region JSON (list_regions, get_month, get_season, get_rankings, get_similar_years, get_quality incl. famous seasons). Gemini function calling, model chain + time budget (≤12 s per model, ≤25 s per request, maxDuration 30 s), per-IP rate limit (8/min, 60/h). The server checks every number in the answer against the tool results and does one correction round; if a number still isn't found, the answer is withheld |
| AskDrawer/AnswerCard/AskPanel | done | collapsible "Numbers used" trace, Responder/Scientist, 4 chips, free text, /ask page + drawer from region chips and month drawer; 30 s client abort → "AI temporarily unavailable" (never an endless spinner); cache fallback |
| 30-question eval | done | `web/scripts/ask_eval.ts` → docs/ask_eval.md. Run 1: 29/30 answered, **0 invented numbers**, 1 timeout; found 2 empty answers + date confusion + Black Summer by calendar year → fixed (empty = retry next model, data-end in prompt, famous seasons in get_quality). Run 2 results: see docs/ask_eval.md |
| ask_cache.json | todo | see TODO at top |

## Phase 7 — Wow + polish
| Task | Status | Notes |
|---|---|---|
| SensorTimeline | done | landing; data spans from inventory, drift hatched, calibration window band |
| Globe landing | done | MapLibre 6 globe (OpenFreeMap dark), hero regions glow with monthly harmonized fire-days (relative to each region's max, labelled), scrubber 2001→2026, play/pause, 1×/4×, month-year counter, auto-rotate 0.6°/s stops on interaction / reduced motion; region cards with mini rings + live headline. Fixed: MapLibre CSS overriding absolute container (canvas 300 px) |
| Madagascar story | done | scrollama, 6 steps (§5 S5), all numbers computed from the data (peak months share, top years, raw vs harmonized step, Mauritius guard, last month) |
| 01_fetch_nrt.py | done | NOAA-20/21 NRT for Punjab, last 60 days via FIRMS Area API (13,713 rows) → clipped to India footprint (4,869 dropped) → Punjab data through 2026-11-09 (Nov 1–9 month-to-date, provisional) |
| S-NPP end check (Muru item 1) | done | docs/snpp_endcheck.md: Oct 2026 agrees across S-NPP / NOAA-20 / NOAA-21 → headline is genuine (Decision 13) |
| Motion | done | ring draw-in (40 ms stagger), count-ups (600 ms), fade-ups; all off under prefers-reduced-motion |
| Accessibility | done | keyboard: skip link, focus-visible ring, roving tabindex grids (e2e 7/7), Enter/Esc drawers, map box via inputs; aria grid/row/gridcell labels; "View as table" on every chart; contrast: all text tokens ≥4.5:1 after `--text-faint` fix (scripts/contrast.mjs); colour-blind: inferno (CVD-safe sequential), RdBu (blue/red diverging), categorical palette validated with the dataviz CVD validator; never colour-only (▲▼, ~, hatch, dotted, dashed raw line, direct labels) |
| Mobile 360 px | done | no horizontal overflow on all 7 routes (scripts/overflow.mjs); rings readout panel instead of tooltip on narrow screens |
| Performance | done | pages code-split, map/hex/drawer/PNG lazy, hero JSON preloaded; main JS 117 kB gz; time-to-rings on throttled 4G: 1.0 s local preview, 1.2–2.3 s live (includes real network RTT to Vercel; preload not yet deployed at measure time) |

## Decisions for Muru to review
1. **Python 3.11** instead of 3.12. Approved by Muru.
2. **Punjab type 2: dropped as planned** (review item 2). Oct+Nov share of type-2 vs type-0: MODIS 0.558 vs 0.728 (ratio 0.77), S-NPP 0.210 vs 0.651 (ratio 0.32). Both are far below the 2× threshold, so type 2 doesn't follow the crop season. Data: data/out/punjab_type2.json, docs/pipeline_report.md.
3. **Persistence rule reading.** "≥16 detection-days in ≥3 years" is implemented as *≥16 detection-days in each of at least 3 years* (plus S < 0.3), with detection-days pooled across sensors. *Why:* the looser reading (16 days total across ≥3 years) would put many Punjab crop cells over the threshold, and two crop seasons (Apr–May + Oct–Nov) can bring S close to 0.3, so it risks masking real fire. *Effect:* our rule adds no cells beyond FIRMS' own static flags (5 cells in Punjab and 5 in SE Australia, all already known-static). *Alternative:* the looser reading. It's a one-line change in `build_masks`.
4. **Known-static mask** = any H3 r9 cell with ≥1 archive row of type 2 or 3, pooled across sensors (review item 1). It drops all rows in those cells, including type-0 archive rows and NRT rows. Punjab has 5,627 such cells, and the mask removes 20,303 rows beyond the type filter (0.8%). *Alternative:* require ≥2 type-2/3 rows per cell, which would be less aggressive.
5. **Coverage operating-days proxy**: a stream counts as operating on a UTC day if it has ≥1 detection in *any* raw file (whole Australia, India, Madagascar and Mauritius). Small regions alone can't tell an outage from "no fire". MODIS (Terra ∪ Aqua) uses O = mean(O_Terra, O_Aqua).
6. **Regional gap detection (new).** The Aqua Aug 2020 hole is *not* a global outage: Aqua kept detecting over India and Australia, but over Madagascar it recorded zero detections from 17 Aug to 2 Sep 2020 at peak season, while Terra saw 3–270 per day. Rule: a run of ≥7 globally-active days with 0 detections where the **sibling satellite** (Terra↔Aqua, or the other VIIRS satellites) has a median of ≥20/day, *and* the stream's local ratio to its sibling predicts ≥100 detections over the run. That region's operating days then exclude the run. A first version compared against all streams, VIIRS included, and wrongly flagged 21 Terra "gaps" in Punjab, which are really Terra's drifted morning overpass missing afternoon crop fires. The final rule flags exactly one gap across all regions. *Alternative:* ignore regional gaps. Aqua Aug 2020 in Madagascar would then be undercounted by about half.

7. **V3 is tested out of sample.** In-sample, H for 2012–2019 equals k·S-NPP, which matches MODIS by construction, so the step test would be circular. V3 therefore uses leave-one-year-out ratios for 2012–2019. It passes if (a) Pettitt p > 0.05 on the harmonized 2003–2019 annual series and (b) the MODIS-only step lies inside the harmonized step's 90% bootstrap interval. That makes MODIS-only the "true change" reference.
8. **SE Australia uses fallback 1 (a single region-wide ratio).** The monthly method passes V1 (MAPE 8.5%) but narrowly fails V3: the MODIS-only step of +10.2% sits just outside the harmonized interval (−0.9 to +10.0). The pooled method passes both (MAPE 9.2%, step +9.2% with CI 1.6–18.5). I applied the default rule (use whichever validates better). The method is recorded in the JSON and will be shown on the Proof page. *Alternative:* keep monthly for SE Australia; it's arguably better on seasonal shape.
9. **Low-activity rule for regions.** A region counts as low-activity when its median baseline month (2003–2022) is under 5 MODIS cell-days, the same threshold as the month guard. Only Mauritius qualifies (V1 MAPE 24%). Its targets are reported but not judged.

10. **Limitation: seasons before July 2002 rest on Terra alone (×q).** In V9, 2001–02 ranks #1 harmonized in Madagascar and Mauritius. Terra alone did record its biggest early season then (Madagascar Terra 15,810 cell-days vs 10–14k in the following seasons), and q (≈3.4) scales it up. It could still be partly an early-Terra sensitivity effect. The bootstrap interval includes the uncertainty in q. I'll state this on the Proof page as a limitation rather than change the method.
11. **The partial month (Nov 2026)** is judged against the same days 1–8 of baseline years, both in `latest` and in that month's entry in `months[]`.
12. **Hotspot CSVs** are exported only for the latest 2 months (about 12.6 MB). Older months use H3 cell aggregates (`hexes/`) for maps, which keeps the repo small.

13. **Punjab October 2026 = 0.08× median is genuine (Muru item 1).** Cross-sensor check (`docs/snpp_endcheck.md`): October 2026 MODIS-equivalent fire-days are k·S-NPP 392, k·k′·NOAA-20 438 and k·k″·NOAA-21 368. S-NPP sits between the other two (−10% / +7%). Madagascar agrees within ±4%, and SE Australia within about −12% to +7%. S-NPP did **not** degrade before shutdown, so the harmonized source stays S-NPP through Oct 2026. Using NOAA-20 instead would give about 0.09×, still the lowest October on record. Raw MODIS shows 716 because its drifting afternoon overpass now catches more crop fires. That's exactly why MODIS isn't used after 2012.
14. **FIRMS API rows clipped to the India footprint.** My first comparison showed S-NPP 52% below NOAA-20 in Punjab. The cause was the API's plain bounding box, which also covers Pakistani Punjab; the archive download is India-only. API rows are now kept only inside H3 res-7 cells that have detections in the downloaded files. This dropped 4,869 of 13,713 rows. *Alternative:* a proper country polygon (needs a boundary file; DATA\raw\boundaries is empty).
15. **`--text-faint` raised from #5D6B7E to #8492A6.** The plan's value is only 2.6–3.6:1 on our surfaces; the new one is ≥4.5:1 on all four (`web/scripts/contrast.mjs`). The master plan token block is kept verbatim; the override lives in the additions block.
16. **Gemini models.** With this key on 2026-11-09, `gemini-flash-latest` (GEMINI_MODEL) and `gemini-3.8-flash` returned 503/504 (high demand), and `gemini-2.5-flash` returned 404 (retired for new keys). The chain is now GEMINI_MODEL → `gemini-3-flash-preview` → `gemini-3.6-flash` → `gemini-3.5-flash-lite`, with ≤12 s per model attempt, ≤25 s per request, `maxDuration` 30 s and a client abort at 30 s.
17. **Plan mode skipped for multi-file tasks during the unattended run** (you said not to wait for approval). The design notes are in commit messages and this file.
18. **Detection-time caveat, not a correction.** Test (`pipeline/tools/punjab_timing.py`): daytime-only cell-days, ratios relative to each season's own 2013–2019 mean (NOAA-20 vs 2018–19), and every stream compared on the same days up to 2026-11-01. That date cut fixes a bias: without it, 2026 showed Aqua÷S-NPP ×5.6 because S-NPP stops on 2 Nov while Aqua continues. Result: Punjab Oct–Nov ×1.46 vs flat elsewhere (details in the update above). Caveat flag `overpass_timing` on Punjab Oct–Nov, 2022 onwards. *Why 2022:* it's the year the published reports name, and our ratio starts rising in 2022–23. *Alternatives:* start the flag in 2024, when the rise becomes clear (×1.28); or try a correction model (no ground truth, so not done).
20. **Live layer and map choices.** (a) The live footprint is H3 res-7 only for Punjab (25.6k cells, 561 kB) and res-6 elsewhere: res-7 for SE Australia was 2.1 MB with no border to protect. (b) Markers and default views come from the detections themselves (median position, percentile box), not hand-placed coordinates. (c) Detection points for every month are published only for small regions (< 10,000 km² view: Mauritius, about 5k detections). Large regions get points for the latest 2 months; publishing all months would be about 60 MB for Punjab alone. (d) Live counts are "detections in 72 h", not fire-days, so they're never compared with the harmonized unit. *Alternatives:* a real country polygon for the Punjab footprint; per-month point files for large regions loaded on demand from object storage.
19. **Terra-only months excluded from rankings** (your rule). This applies to per-month rank and return period (`terra_only` flag), annual `rankable: false` for 2001 and 2002, V9 seasons containing any Terra-only month (2001–02), Punjab Oct–Nov ranking, similar-year analogues and the AI `get_rankings`. The months are still displayed, with intervals.

## Blockers
none

## Log
- 2026-11-09 — Phase 0 done. Toolchain, repo, venv, inventory, config, web scaffold, Vercel live.
- 2026-11-09 (late) — Phases 2–8 done in the unattended run; v0.9 and v1.0 tagged. Muru's mid-run notes handled: headline verified (13), API footprint fix (14), pipeline rerun with Punjab NRT to 9 Nov, Gemini budget + graceful fallback (16), stuck eval killed and rerun (30/30, 0 invented).
- 2026-11-09 — Phase 1 done. Unify (DuckDB + H3 community extension), masks, reports. 10 pytest tests pass. Note: Terra NRT is sparse (Punjab 73 rows vs Aqua 4,438); to check in 2.1 coverage.
