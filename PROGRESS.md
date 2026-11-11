# Fire Rings — PROGRESS

Resume any session with: **"Continue from PROGRESS.md"** (read this file + CLAUDE.md first).
Status keys: `todo` · `doing` · `done` · `blocked`
Live: https://fire-rings.vercel.app (Vercel, root = web, auto-deploys on push to main)

## Round 3 (11 Nov) — running log (P1 main app → P2 companion + control room)
- **P1.1 ✅ date range** on Explore: From/To months (URL `?from=YYYY-MM&to=YYYY-MM`), summary card (total, typical = sum of monthly medians, busiest month, rank among the same months in other complete years when ≤12 months), range highlighted on rings/calendar/annual bars, CSV/PNG limited to the range, Guide entry, e2e. Black Summer Jul 2019–Mar 2020 ranks 1st of 23.
- **P1.2 ✅ `/api/hotspots`**: FIRMS Area API (SP where processed, NRT after; MODIS + VIIRS as in the record, `satellites=all` adds NOAA-20/21), the record's filters, ≤31 days. Decision: FIRMS now allows **≤5 days per call** (API answered "Expects [1..5]"), so 31 days = 7 calls per source. Cache: in-memory per warm instance + CDN `s-maxage` (7 days for SP-only ranges, 30 min with NRT); Vercel KV/Blob is not connected (needs Muru's account) so no persistent cache. Per-IP 30 uncached/10 min, ≤300 FIRMS calls/10 min/instance, calm 503 "busy" message. Demo months are static files made from the record (Punjab Oct 2016, SE Australia Dec 2019, Madagascar Sep 2019). Parity vs record, Punjab Oct 2016: 48,666 vs 48,595 detections (0.15%). Production checked: miss → hit, 307 for demo months, CORS.
- **P1.3 ✅ map dots** for any month at zoom ≥9 (visible 0.5° tiles, cached), demo months static. Res-8 Mauritius hexes skipped (Mauritius already shows every detection as a dot).
- **P1.4 ✅** #72 opinion/advice rejection (briefings regenerated: no "ease strain…", no "planning agency responses"); #73 numbers in AI text formatted (years never); #74 trace lines shown once with ×N, region names on status lines, briefings in parallel, labelled fallback with reason; #75 badge "Unusually low (Nov so far, Oct)".
- **P1.7 ✅ (Réunion pending)** CORS on `/data/v1/*` + `/api/hotspots|live|health`; `api/series`, `api/projection` (backtest), `api/power` (NASA POWER, 9 points/region), `api/index.json`; Data page lists every endpoint.
  - ⚠ **FIRMS budget incident**: one Area-API call costs ~15 transactions. The first full Réunion download hit the 5,000/10 min key limit for a few minutes (the live layer/hotspots would have answered "busy" meanwhile). Decision: Réunion downloads only the windows around each GVP eruption (start −35 d → end +5 d), one call every 6 s (~30% of the budget).
  - Eruption dates: **Smithsonian GVP** VOTW Holocene eruptions (volcano 233020), 30 eruption periods since 2000, each with its source link.

## Summary for Muru — Round 2 + Fire Watch (10 Nov, evening)

**In one line:** all ten re-check items (#62–71) are fixed and Fire Watch is live: rules decide, AI explains. Long-term numbers are unchanged (snapshot test green). Everything is pushed to main.

**What changed, by item**
- #62 Years are never shown as “2,015” in Ask’s “Numbers used”.
- #63 The map footer says ~5 km² in High detail and ~36 km² in Long-term.
- #64 The Long-term map explains fractions with the month’s rate from the data (e.g. Punjab Oct: 1 VIIRS fire-day ≈ 0.36 MODIS-equivalent).
- #65 Globe: zoomed in, it switches to ~36 km² hexagons, and the lowest values are no longer near-black holes.
- #66 No more ▲▼ scroll arrows. All 7 nav items, including Fire Watch, fit on one row at 1280–1920 px and wrap at 360.
- #67 The Mauritius exchange-rate sentence was “0.20–0.20” and is now “0.12–0.35”, listing all 12 months (* = few fires). Checked for every region.
- #68 Guide: clicking the same result again scrolls back, and the search bar no longer slides under the header.
- #69 Phone home page: the text sits above the globe, which is clearly visible at 360–430 px (e2e check).
- #70 Globe honesty: colour still breathes per region, but glow size now shows the real number of fire-days, so Mauritius is a tiny dot, not a big glow. Hover shows counts, and the caption explains colour vs size.
- #71 Ask v2:
  - two columns: chat on the left, “What the AI can see” on the right (mini rings, 4 key numbers, a live step trace)
  - one set of suggestions, clear segmented controls, a single ⓘ
- **Fire Watch** (`/watch`, in the nav):
  - Each region gets a status (Normal / Watch / Alert / Unusually low) from fixed rules in one config file, with the low-activity guard applied first.
  - Each card has “Why this alert?”, “Numbers used”, a Responder/Scientist briefing and a “Relevant for:” line.
  - “▶ Run the agent now” streams every step live.
  - “Coming next” panel and a disclaimer.
  - A badge on every Home card links to /watch.
- **Why harmonization matters** (on /watch and /proof): the same rules on raw data would have raised **99** alerts since 2012, **53** of them caused only by the satellite switch. On harmonized data: **46**. Raw data also hides real drops: 5 “far below normal” months vs 33.

**Current Fire Watch statuses (data through 9 Nov 2026)**
- Punjab–Haryana: **Unusually low**. Both the month so far and October are below every baseline year. The detection-time caveat is shown in the briefing.
- Madagascar: **Unusually low** (October at the 5th percentile).
- SE Australia: **Normal**.
- Mauritius: **Normal** (too little fire to judge this month).

**Numbers that changed (before → after)**
- Long-term H, lo and hi: unchanged.
- Mauritius calibration sentence: “0.20–0.20” → “0.12–0.35”. A display bug: the range ignored the low-reliability months and October was missing from the list. The rates themselves did not change.
- Tests:
  - pytest 61 → 74 (new rule and backtest tests)
  - claims_check 131 → 159 (new: exchange-rate lists, N/X/M, Fire Watch statuses, briefing numbers, no forecast wording)

**Decisions and things not done**
- Globe fine zoom uses ~36 km² hexagons (res 6, existing files), not ~5 km² (res 7, about 24 MB). Res 6 already removes the giant blocks.
- The live rule’s “expected 72-hour count” is an approximation: the record has one VIIRS satellite and the live feed has two. So it can only raise **Watch**, never Alert, and is skipped when fewer than 20 detections are expected. Documented in METHODS §8e.
- In a live run only the Responder briefing is written live, to fit Vercel’s 60-second limit. The Scientist version is the saved one, labelled “⚡ saved briefing”.
- Briefings that sound like a forecast (“will…”, “expect…”, “coming weeks”) are rejected and regenerated. This came up once (“Fire services can expect…”).
- Scientist-style Ask answers no longer echo the prompt text “Point to the Proof page…”. They end with “Method: see the Proof page.” The 60-question Ask quality set was not re-run after this small prompt change.

**Checked on production after deploy (10 Nov):**
- `/api/watch?stream=1&brief=1` streamed 51 steps in 17 s.
  - Live 72 h counts were used (Punjab 1,625 vs ~9,072 expected → normal).
  - Punjab got a **live** Gemini briefing, 6 numbers verified.
  - Madagascar’s live attempts ran out of time, so it showed the **saved** briefing, labelled as such.
- `/api/ask` streaming: “How many fire-days did Mauritius have in 2015?” with Punjab selected → switched to Mauritius, 23 fire-days, 3 numbers verified.

**What to check first**
1. `/watch` → press **▶ Run the agent now**. Steps should stream, two regions should be Unusually low, and the briefings should appear.
2. `/watch` → scroll to “Why harmonization matters”: 99 / 53 / 46, with striped vs solid bars per year.
3. Home on a phone: the globe is visible under the text; the region cards show Fire Watch badges.
4. Globe: zoom into Mauritius (hexagons appear) and hover a region (counts appear).
5. `/ask`: ask “Worst year on record?” and watch the live trace on the right.
6. `/r/mauritius` → Provenance: all 12 monthly rates, range 0.12–0.35.
7. `/r/punjab?mode=detail` → map footer says ~5 km²; Long-term → the fraction line under the map.
8. `/guide`: search “false alarms”, click the result twice; it should scroll back each time.
9. Desktop nav at 1280 px: 7 items, no scroll arrows.

## Round 2 (Muru’s re-check, items #62–71) — running log
- **Part A ✅**
  - #62: years and months are never thousands-separated in “Numbers used”; checked in ask_e2e.
  - #63: the map footer follows the mode (~5 km² in High detail, ~36 km² in Long-term).
  - #64: the Long-term map explains fractions with the month’s rate from the data, e.g. Punjab Oct: “1 VIIRS fire-day ≈ 0.36 MODIS-equivalent fire-days”.
  - #65/#70, globe:
    - Colour stays relative to each region’s own record, so seasons still breathe.
    - Glow size now uses one global scale (absolute fire-days), so tiny places stay tiny.
    - Mauritius is a small soft dot at world zoom.
    - From zoom 3.6, ~36 km² res-6 hexagons load lazily, scaled to H per month like the res-4 layer.
    - The ramp starts brighter, so no near-black “holes”.
    - Hover shows absolute counts, and the caption explains colour vs size.
  - #66: the nav is no longer a scroll container (no ▲▼); it fits on one row at 1280/1440/1920 (e2e) and wraps at 360.
  - #67: the exchange-rate sentence’s range now covers all 12 months, every month is listed and low-reliability months are starred. Example: Mauritius went from “0.20–0.20” to “0.12–0.35 … Oct 0.20”. claims_check covers all regions.
  - #68: the same Guide result a second time scrolls back. The sticky search sits below the header at any width (`--header-h`), plus an e2e check.
  - #69: on phones the hero text is stacked above the globe, the globe opens zoomed out and the control panel sits under it; e2e checks at 360 and 430.
  - #71: Ask v2:
    - two columns: the chat thread with a large chat bar, and a “What the AI can see” panel (mini rings, 4 key numbers for the region and mode, a live trace)
    - `/api/ask` streams NDJSON steps (“Looking up the ranking of years… highest 2016: 15,346 fire-days… Verified 2 numbers ✓”)
    - saved answers replay their lookups on the published data, clearly labelled
    - one set of suggestions, segmented controls, a single ⓘ
  - Tests: 61 pytest · claims 138/138 · e2e incl. nav/globe/map/guide checks · ask_e2e 32/32 (now also checks the trace and year formatting).

## Summary for Muru — QA run, 10 Nov (docs/QA_ISSUES.md, items 1–61)

**In one line:** all 61 QA items are done or done with a stated limit. Long-term (harmonized) numbers are unchanged. Every test is green: 61 pytest, 195 Playwright checks, 131/131 on-screen numbers match the JSON, 32/32 Ask chips, Ask quality 60/60. All of it is pushed to main, and the production checks below pass.

**Done, by item (details in the running log below)**
- Numbers (Phase 0): #23 return period fixed · #29 hotspot counts per satellite · #30 outage days hatched · #35 one calibration sentence everywhere · #37 status on every Proof card · #43 Mauritius “too little fire to validate” · #45 Punjab August explained · #48 real sources.
- Bugs (Phase 1): #12 chart width · #15 charts in box view · #16 box clipping · #52 cache style label · #58 errors stay with their own question.
- Ask (Phase 2): #59 longer time budget, logging, model fallback · #60 direct lookups + 60-question quality set · #61 named region switches · #54 `/api/health` · #56 flags in answers · #53 two styles · #33 cache 32/32 · #55 calm “Instant answer” chip.
- Plain language (Phase 3): #3 #4 #5 #6 #7 #8 #10 #11 #13 #14 #22 #24 #25 #26 #27 #28 #31 #32 #34 #36 #39 #40 #41 #42 #46 #47 #49 #50.
- #38 before/after shows the 2012 cliff, plus “▶ Show the fix”.
- ★#44 Long-term vs High detail mode, and #19 map in the page’s unit.
- Map: #17 #18 #20 #21.
- Home: #1 globe hexagons · #2 maritime rings removed.
- ★#9 Guide with search, worked examples, glossary and ⓘ everywhere.
- #51 stories for all 4 regions.
- #57 Ask page redesign.

**Skipped or partial, and why**
- **Phase 11 (new regions), skipped.** Adding the whole India and Australia presets means re-running 02–08 on about 4 GB, reviewing new calibration and validation by hand (CLAUDE.md rule 7), and 16 more Gemini cache answers. Too risky this close to submission. The pipeline is config-driven, so it’s a post-event job.
- **#44:**
  - Res-8 hexagons (~0.7 km²) not exported: about 7× the 24 MB of res-7 files. Res 7 (~5 km²) is used.
  - High detail percentiles are coarser, because the baseline is only 10 years (top possible percentile is 91). The UI says so.
- **#20:** no real country or region polygons exist in our data. Instead the clip-box outline is drawn only where the data really is a box (Punjab, SE Australia); Madagascar and Mauritius follow the coastline.
- **#2:** maritime rings are hidden, but small-island land shapes come from the OpenFreeMap basemap itself, so they stay.
- **#32:** the drawer mini map shows a silhouette of every hexagon that ever burned, not a basemap. That keeps it light and offline-safe.
- **#9:** five entries render the real chart with numbered markers (Fire Rings, Calendar, Seasonality, Annual totals, gauge). The other entries are text plus a data example. The marker positions are fixed percentages: check them by eye.
- **Punjab August:** native VIIRS is below MODIS-equivalent there, because the small-sample k is 1.20 > 1. This is documented, not changed.

**Numbers: before → after**
- **Long-term H / lo / hi:** unchanged. The snapshot test covers 311 months × 4 regions.
- **Return periods (#23):** 60 months now agree with their percentile. Example: SE Australia Jul 2025 (66–71st percentile) went from “1-in-4” to “about 1-in-3”.
- **V9:** scored only where there is a sourced event (SE Australia Black Summer = #1). The other regions show “info” with a reason.
- **New published numbers, all from the pipeline:**
  - High detail values V for 2012+.
  - “What the new satellite adds”: Punjab 2.9×, Madagascar 3.8×, SE Australia 2.4×, Mauritius 4.6×.
  - `globe.json` (res-4 hexagons, scaled to H).
  - `quality.rows_read` and `quality.cell_days` (e.g. Punjab: 18,029,309 detections read → 2,408,576 kept).
- **Tests:**
  - pytest 48 → 61
  - claims_check 93 → 131
  - Ask answer-quality 43/60 → 60/60 (fixed: the model sent years as text, incomplete-year wording, a missing caveat on refusals)

**Muru to do**
1. **Gemini billing or quota decision.** Production works now (`/api/health`: gemini-3.5-flash-lite ok). The free tier hit 429s on other models earlier, and `gemini-flash-latest` kept timing out. Keep `GEMINI_MODEL=gemini-3.5-flash-lite` in Vercel. Paid quota is safer for the live demo; the saved answers cover every chip either way.
2. Re-check by eye:
   - the Guide markers ①–④ on the Fire Rings and gauge examples
   - the 360 px layout on a real phone
   - the High detail map at Punjab field scale
3. After the next data refresh: re-run `npx tsx --env-file=../.env scripts/ask_cache.ts` (the cache is dated 10 Nov), then `npm run test:e2e`.
4. Decide on Phase 11 (India and Australia whole-country presets) after the event.
5. Optional: have a fire scientist read the High detail wording (“S-NPP-equivalent native VIIRS fire-days”) and the SE Australia story (its typical peak months are Apr, May and Sep).

**What to check first on the live site (10)**
1. `/r/punjab`: click **High detail (2012–now)**. Check the chip, the note, rings starting in 2012, the ~5 km² map hexagons, then switch back.
2. `/proof`: press **▶ Show the fix** on the before/after chart.
3. `/guide`: search “pie chart” and “exchange rate”; then click any ⓘ on Explore and use “Learn more”.
4. Home: press ▶ on the globe. Madagascar should breathe Sep–Oct, and SE Australia should flare in Dec 2019.
5. `/ask`:
   - “Worst year on record?”: a mini bar chart and the Numbers-used table should appear.
   - With Punjab selected, ask “How many fire-days did Mauritius have in 2015?”: it should switch to Mauritius and answer 23.
6. `/story`: open the picker, then the Punjab and SE Australia stories.
7. SE Australia: click Jul 2025. The gauge should say “about 1-in-3 years” next to the 66–71st percentile.
8. Map: the legend sits under the map and the live layer is off by default. On Mauritius there should be no ocean rings and the Rodrigues button should work.
9. Click a month to open the drawer. Check the dot-strip labels, the “Where” silhouette, the legend and the scale bar.
10. Phone width: the six nav items fit, Guide “Show contents” works, and the KPI cards wrap cleanly.

## QA run — 10 Nov (docs/QA_ISSUES.md items) — running log
- **Phase 0 (numbers) ✅** #23 return period now = 100/(100−p) from the shown percentile range (60 months disagreed before; e.g. SE Australia Jul 2025 66th–71st pct: "1-in-4" → "about 1-in-3"); unit + output tests. Long-term snapshot test added — harmonized values unchanged. #29 drawer shows "VIIRS n · MODIS n". #30 satellite gap days hatched in the daily chart; SE Aus 26–27 Jul 2025 checked = real low (S-NPP operating, normal counts elsewhere in Australia). #35 one plain calibration sentence per region shared by Provenance/Proof/METHODS. #37 every Proof card has a status; V9 scored only against a sourced event (Black Summer → Royal Commission tabling release), other regions "info" with a reason. #43 Mauritius shows "too little fire to validate reliably". #45 Punjab August k=1.20 = small-sample noise (126 vs 92 fire-days in 8 years, 0.13% of fire-days), labelled "few fires — low reliability" (months < 200 fire-days); documented in METHODS + validation_report. #48 timing reports now real checked links (NASA Earth Observatory; ISRO via ThePrint; iFOREST via The Tribune).
- **Phase 1 (bugs) ✅** #12 charts stay mounted when the table shows (no shrink) + e2e; #15 Seasonality/Annual totals recomputed for a box (no vanishing) + e2e; #16 box clipped to the region with a warning, outside/empty boxes refused + e2e; #58 Ask keeps each question with its own answer/error; #52 cached answers are labelled with the style they were written in (both styles regenerated in Phase 2).
- **Phase 2 (Ask reliability) ✅** #59 per-model budget 22 s, 55 s total, `maxDuration` 60, JSON log lines with per-step timings (no keys), "Thinking… looking up numbers" state; a circuit breaker benches a model that keeps failing for 10 min (`GEMINI_MODEL=gemini-flash-latest` timed out repeatedly in testing → see Muru to do). #60 direct tools `get_year_total`, `get_month`, `get_typical`, `compare_years` (each returns 90% range, flags and full-sentence caveats); verified: "How many fire-days did Mauritius have in 2015?" → 23, one lookup, low-activity caveat. Answer-quality set `scripts/ask_quality.ts` (15 questions × 4 regions, expected numbers read from JSON) → `docs/ask_quality.md`. #61 region names in the question switch the region ("Switched to Mauritius"). #54 `GET /api/health` classifies Gemini (ok / invalid_key / model_not_found / quota_exceeded / timeout) and FIRMS, never returns keys; error class logged. #56 answers carry the same flags as charts (low activity, Terra-only, provisional, Punjab detection time); caveat forced to one sentence from a fixed list. #53 Responder vs Scientist prompts differ in depth, not numbers; ⓘ explains them; style badge on each answer. #33 cache regenerated: 32/32 (4 chips × 4 regions × 2 styles); `ask_e2e.mjs` checks all 32 through the fallback (32/32 pass, in `test:e2e`). #55 calm "⚡ Instant answer (saved …) ⓘ" chip replaces the yellow banner; uncached free text gets a friendly message + chips.
- **Phase 3 (plain language) ✅** #3 home cards lead with a plain chip ("Much lower than usual", colour + words), then ratio, then percentile. #4 LIVE everywhere reads "raw detections, last 72 h (not fire-days)". #5 region switcher under the title; Explore opens the last-viewed region. #6 headline prefix ("Last full month" / "Picked month") + card "This month so far · Nov 1–9". #7 "Area covered" + tooltip. #8 KPI plain ratios ("about half of normal (0.5×)"). #10 seam slider → "Raw ↔ Fixed" with end buttons, snapping, explanation. #11 calendar legend under the grid. #13 chart readouts under the plot, never over axes. #14 one generated takeaway line on Seasonality and Annual totals. #22 map: West/South/East/North (°), "N hexagons had fire", outline legend (data area vs your box). #24–#26 gauge end labels in full, active button state, caption for needle vs band. #27–#28 similar years in % words, clickable → highlighted on rings + overlaid on Seasonality. #31 drawer dot strip: median + this-month labels, hover year, axis title. #32 drawer "Where": faint silhouette of every hexagon that ever burned (no outline geometry in our data), box outline, colour legend with real min–max, km scale bar. #34 Provenance plain words + Mauritius local time. #36 every Proof card leads with a plain sentence. #39 before/after takeaway generated from the plotted lines + overlap note. #40 drift chart explained ("for every 100 S-NPP fire-days the old ones see ~34"), dashed lines labelled. #41 region exchange rate on Proof. #42 GitHub links to `06_validate.py` + `validation_report.md`. #46 outages: plain intro, mini timeline, readable dates. #47 static sources in plain words. #49 limitation cards "The problem / What we do about it" with icons; "can't add detail" card points to High detail mode. #50 visual six-step funnel with real counts (Punjab: 18,029,309 read → 2,777,208 in region → 2,408,576 kept → 779,594 fire-days → 383,932 harmonized). Also the "keep vs convert" note at the top of Proof (#19 partially; mode switch itself comes in Phase 5).
- **Phase 4 ✅** #38 before/after: the raw line is drawn on top (before 2012 it equals the old satellite, which used to hide it), 2012 is marked "skipped (partial VIIRS year, S-NPP from 20 Jan)" with a dotted bridge so the cliff is visible, and "▶ Show the fix" morphs the raw line onto the harmonized line in 2.2 s (instant with reduced motion) + e2e. "90% CI" → "90% range".
- **Ask fix (from the #60 quality run, 43/60 at first):** the model sometimes sends years as strings ("2015"), so lookups said "no data" (SE Australia 2015, compare_years) — numeric args are now coerced. Incomplete years (Punjab 2001: June outage) now say why there is no annual total. Answers with no tool call (refused forecast) now still end with a full-sentence caveat. Prompt rule: always state the key fire-day count. Test expectations fixed for incomplete years and forecast refusals. Re-run: **60/60** (was 43/60), docs/ask_quality.md.
- **Phase 5 ✅ ★#44 Long-term vs High detail + #19.** New step `pipeline/07b_detail.py`: native VIIRS fire cell-days V (S-NPP C*, NOAA-20 × k′ from Nov 2026), the same coverage-adjusted counts the record scales by k, so H = k·V (asserted + tested; no new fit, nothing on 2020+). Baseline 2013–2022, Poisson counting interval, same stats code (percentile, return period, guard, rank, month-to-date, similar years). Export: `V_*` fields on each 2012+ month + `detail` block; res-7 hexagons (~5 km²) in `hexes7/` (24 MB, 64 files; res 8 skipped, ≈7× bigger). Web: `?mode=detail` toggle under the region title (remembered), mode chip, one view doc so headline, KPIs, rings (start 2012), calendar, Seasonality, Annual totals, gauge, similar years, drawer, map (res 7), box view and Ask all switch together; shorter-baseline note; "What the new satellite adds" card (Punjab 2.9×, Madagascar 3.8×, SE Australia 2.4×, Mauritius 4.6×, from the pipeline); CSV always has `fire_days_modis_eq` and `fire_days_viirs_native`; open dataset adds `V_native, V_lo, V_hi`; Proof "Two views of the same data" (camera analogy) + METHODS §8d. #19 map values now in the page's unit (Long-term × the month's ratio → MODIS-equivalent; High detail native), legend states unit + month. Tests: `test_detail.py` (V = raw VIIRS cell-days, H = k·V, native ≥ MODIS-eq where k ≤ 1, annual = sum); Long-term snapshot unchanged; claims_check 125/125 (36 new High-detail checks); e2e mode toggle/URL/remembered. Note: Punjab August k = 1.20 > 1, so there native < MODIS-eq — the known low-reliability month (§5).
- **Phase 6 (map) ✅** #17 live layer off by default on the map; when on, small faint filled dots drawn beneath the hexagons (badge still shows the count). #18 map ramp = same Inferno ramp started brighter (0.34→0.98) so the lowest class shows on the dark basemap; stronger fill/outline. #20 dotted outline only for real clip boxes (Punjab, SE Australia); whole-country files (Madagascar, Mauritius) follow the coastline; Mauritius opens on the main island with the Rodrigues inset button; maritime boundary rings hidden (also on the globe, #2). #21 legend moved under the map with unit + month, ●/▲/live keys, outline keys.
- **Phase 7 (home) ✅** #1 globe now shows real fire hexagons (H3 res 4, ~1,770 km²) per region and month, glowing and coloured by MODIS-equivalent fire-days; each month's cells are scaled so they add up exactly to the published H (ratio + coverage adjustment), so there is no 2012 seam (test: globe sums = H). `globe.json` 1.2 MB (≈350 KB gzipped), loaded after the globe appears; the region dot now just anchors the label. #2 maritime boundary rings hidden and borders faded on the globe (and the region map). Small-island land shapes come from the basemap itself and are left as they are.
- **Phase 8 ✅ ★#9 Guide.** New `/guide` (nav “Guide”): sticky search (“/” shortcut, live dropdown, ↑↓/Enter, typo-tolerant, synonyms such as “pie chart” → Fire Rings, “speedometer” → gauge, “k”/“exchange rate” → Calibration ratio by month; Enter scrolls, highlights ~2 s and sets `/guide#id`; no-results message with suggestions), grouped table of contents (collapses on mobile). Basics sections (problem in 30 s with a “same fires, two cameras” drawing, the 3-idea fix, two views, LIVE vs record, Punjab caveat as a speed-camera analogy, what satellites do, the 5 satellites); 42 entries (Home/Explore/Proof/Story/Data/Ask) each with What it shows · How to read it · Example reading · Watch out for · Where to find it; the Fire Rings, Calendar, Seasonality, Annual totals and gauge entries render the real components with Punjab data and numbered markers; 28 glossary terms. Every example sentence is computed from the published JSON (17 on the page). Single source `src/lib/glossary.ts` feeds the search and every ⓘ. ⓘ popovers (one line + “Learn more” deep link) on all chart titles, KPI cards, headline, header badge, mode toggle, seam slider, gauge, similar years, provenance, adds card, map, drawer sections, Proof cards/charts/outages/static/limitations/method, Home sections, LIVE line, Story/Data/Ask titles and “Numbers used”. `scripts/guide_check.mjs` (in `test:e2e`): 49 required entries present, all 37 ⓘ ids resolve, every chart card has an ⓘ, deep link, search synonyms/typo/Enter/no-results/“/”. Nav tightened so six items fit at 360 px.
- **Phase 9 ✅ #51 stories.** “Story” nav opens `/story` with a picker (cards with mini rings). One stepper for all regions with a region switcher at the top and “Explore this region →” at the end. New stories: **Punjab–Haryana** (two harvests: Apr–May + Oct–Nov hold 95% of a typical year; the fake +199% 2012 jump and the fix; the decline 13,844 (2021) → 5,708 (2025); the detection-time caveat), **SE Australia** (Dec 2019 = 3,551 fire-days, 15.2× a typical December, #1 December; Jul 2019–Jun 2020 season #1 of 23), **Mauritius** (3 steps: very little fire; 20 of the last 24 complete months “too little fire to judge” — the guard working). Madagascar keeps its 6 steps. All numbers computed from the JSON at run time; 6 new claims_check lines (131/131). Note: SE Australia’s typical peak months are Apr, May and Sep (not midsummer), so that story says so instead of assuming a summer peak.
- **Phase 10 ✅ #57 Ask design.** Chat thread, newest at the bottom (question bubble → answer card), kept for the session, auto-scroll. Answer text larger and first, then caveat, then one inline visual built from the published data the answer used (annual bars with the year highlighted for rankings/year totals/compare; a 12-month typical strip with the month highlighted for season/typical/month). “Numbers used” open by default as a table (metric · value · source) — the lookups are re-run in the browser with the same `api/tools.ts` on the published JSON, so live and saved answers both get full tables. 2–3 follow-up questions under each answer. One control row: region · Responder/Scientist · Long-term/High detail · ⓘ styles · ⓘ who answers (the model line moved there). Ask button brand orange with a clear disabled state; Enter sends. Typing indicator + skeleton; empty state with example questions for the selected region; errors offer the chips. Disclaimer kept: planning tool, no forecasts, not an emergency service. ask_e2e now also requires the numbers table (32/32).

## ✅ RESOLVED (checked 10 Nov 12:29 UTC): live layer on production
`/api/live?region=punjab` → ok, 1,625 detections; `/api/health` → gemini ok (gemini-3.5-flash-lite, 572 ms), firms ok. Old note kept below for reference.

### (old) BLOCKER: live layer needed FIRMS_MAP_KEY in Vercel Production
Production `/api/live?region=punjab` returned `{"ok":false,"error":"not_configured"}`. The deployed function can't see `FIRMS_MAP_KEY` (deploy `cfe4170`, built after the push). The code works: locally with the same key it returns Punjab 1,921 and Madagascar 9,236 detections. The UI shows "LIVE · feed temporarily unavailable" as designed.
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
