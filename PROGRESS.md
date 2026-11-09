# Fire Rings — PROGRESS

Resume any session with: **"Continue from PROGRESS.md"** (read this file + CLAUDE.md first).
Status keys: `todo` · `doing` · `done` · `blocked`
Live: https://fire-rings.vercel.app (Vercel, root = web, auto-deploys on push to main)

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
| 3.1 05_calibrate.py | todo | |
| 3.2 06_validate.py | todo | |
| 3.3 07_stats.py | todo | |
| 3.4 full 08_export.py + run_all.py | todo | |
| 3.5 validation decision (no stop) | todo | |

## Phase 4 — Region dashboard · Phase 5 — Proof + Data · Phase 6 — Ask AI · Phase 7 — Wow + polish (v0.9) · Phase 8 — Ship (v1.0)
todo

## Decisions for Muru to review
1. **Python 3.11** instead of 3.12. Approved by Muru.
2. **Punjab type 2: dropped as planned** (review item 2). Oct+Nov share of type-2 vs type-0: MODIS 0.558 vs 0.728 (ratio 0.77), S-NPP 0.210 vs 0.651 (ratio 0.32). Both are far below the 2× threshold, so type 2 doesn't follow the crop season. Data: data/out/punjab_type2.json, docs/pipeline_report.md.
3. **Persistence rule reading.** "≥16 detection-days in ≥3 years" is implemented as *≥16 detection-days in each of at least 3 years* (plus S < 0.3), with detection-days pooled across sensors. *Why:* the looser reading (16 days total across ≥3 years) would put many Punjab crop cells over the threshold, and two crop seasons (Apr–May + Oct–Nov) can bring S close to 0.3, so it risks masking real fire. *Effect:* our rule adds no cells beyond FIRMS' own static flags (5 cells in Punjab and 5 in SE Australia, all already known-static). *Alternative:* the looser reading. It's a one-line change in `build_masks`.
4. **Known-static mask** = any H3 r9 cell with ≥1 archive row of type 2 or 3, pooled across sensors (review item 1). It drops all rows in those cells, including type-0 archive rows and NRT rows. Punjab has 5,627 such cells, and the mask removes 20,303 rows beyond the type filter (0.8%). *Alternative:* require ≥2 type-2/3 rows per cell, which would be less aggressive.
5. **Coverage operating-days proxy**: a stream counts as operating on a UTC day if it has ≥1 detection in *any* raw file (whole Australia, India, Madagascar and Mauritius). Small regions alone can't tell an outage from "no fire". MODIS (Terra ∪ Aqua) uses O = mean(O_Terra, O_Aqua).
6. **Regional gap detection (new).** The Aqua Aug 2020 hole is *not* a global outage: Aqua kept detecting over India and Australia, but over Madagascar it recorded zero detections from 17 Aug to 2 Sep 2020 at peak season, while Terra saw 3–270 per day. Rule: a run of ≥7 globally-active days with 0 detections where the **sibling satellite** (Terra↔Aqua, or the other VIIRS satellites) has a median of ≥20/day, *and* the stream's local ratio to its sibling predicts ≥100 detections over the run. That region's operating days then exclude the run. A first version compared against all streams, VIIRS included, and wrongly flagged 21 Terra "gaps" in Punjab, which are really Terra's drifted morning overpass missing afternoon crop fires. The final rule flags exactly one gap across all regions. *Alternative:* ignore regional gaps. Aqua Aug 2020 in Madagascar would then be undercounted by about half.

## Blockers
none

## Log
- 2026-11-09 — Phase 0 done. Toolchain, repo, venv, inventory, config, web scaffold, Vercel live.
- 2026-11-09 — Phase 1 done. Unify (DuckDB + H3 community extension), masks, reports. 10 pytest tests pass. Note: Terra NRT is sparse (Punjab 73 rows vs Aqua 4,438); to check in 2.1 coverage.
