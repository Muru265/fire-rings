# Fire Rings — NASA Space Apps 2026 (solo build: Muru + Claude Code)

## What this is
Web app for the NASA Space Apps 2026 challenge "Harmonization of MODIS and VIIRS Hot Spots".
It harmonizes MODIS (2000→) and VIIRS (2012→) active-fire hotspots from NASA FIRMS into ONE consistent
monthly record (MODIS-equivalent "fire cell-days"), shows it as a beautiful interactive calendar
("Fire Rings" radial view + grid view), answers "is this month normal?", exports CSV, publishes the
harmonized dataset openly, and includes a grounded AI analyst.
Target award: BEST USE OF DATA. Full spec: docs/FIRE_RINGS_MASTER_PLAN.md — read it before any phase.
Early building is allowed by the local event. Event: 14–15 Nov 2026, Port Louis. Submit by Sun 15 Nov 14:00.

## Environment
- Windows + PowerShell + VS Code. Project root: C:\Users\User\Documents\nasa\PROJECT
- On Windows `DATA\` and `data\` are the SAME folder. Original FIRMS zips sit in DATA\ root — never delete them.
- Python venv at .venv (activate: .venv\Scripts\activate). Use `python`, not `python3`.
- No `make` on Windows: pipeline entry point is `python pipeline/run_all.py`.
- Keys in .env: FIRMS_MAP_KEY, GEMINI_API_KEY, GEMINI_MODEL. Load with python-dotenv locally; Vercel env vars in prod.
  Never print, log or commit key values.

## Raw data (already downloaded — FIRMS Archive Download, 2000-11-01 → 2026-11-08, CSV)
data/raw/{mauritius,madagascar,india,australia}/{modis,snpp,noaa20,noaa21}/
Each folder has TWO files: fire_archive_*.csv (standard/SP, quality-checked) and fire_nrt_*.csv
(recent months not yet reprocessed). Use both; where dates overlap prefer archive rows, drop NRT duplicates.
File codes: M-C61 = MODIS C6.1 (Terra+Aqua) · SV-C2 = VIIRS S-NPP · J1V-C2 = VIIRS NOAA-20 · J2V-C2 = VIIRS NOAA-21.
~5.3 GB total; australia/snpp archive is 1.37 GB → read CSVs with DuckDB, never pandas.read_csv on big files.
FIRMS data availability (checked 9 Nov 2026):
MODIS_SP 2000-11-01→2026-08-31 · MODIS_NRT →2026-11-09 · VIIRS_SNPP_SP 2012-01-20→2026-07-31 ·
VIIRS_SNPP_NRT →2026-11-02 (S-NPP ended) · VIIRS_NOAA20_SP 2018-04-01→2026-07-31 · VIIRS_NOAA20_NRT →2026-11-09 ·
VIIRS_NOAA21_SP 2023-03-01→2026-07-31 · VIIRS_NOAA21_NRT →2026-11-09.

## Regions (SOLO SCOPE — overrides the master plan where they conflict)
| id | source folder | clip box W,S,E,N |
|---|---|---|
| punjab | india | 73.8, 27.6, 77.6, 32.6 |
| madagascar | madagascar | whole file (already clipped to country) |
| se_australia | australia | 140.9, -39.2, 153.7, -28.1 |
| mauritius | mauritius | whole file (honest low-fire case) |
Optional later presets: india (whole), australia (whole).
Keep: pipeline + harmonization + validation, Fire Rings, grid calendar, seam slider, "Is this normal?"
headline + gauge, month drill-down, map (presets + rectangle draw + lat/lon box filtering hero data),
Proof page, Data page (open dataset), Ask Fire Rings AI with trace + cache, CSV/PNG export, sensor timeline.
Stretch in order: globe landing (hero regions only) → Madagascar story mode → live November NRT for Punjab.
Not doing: global cube, compare page, multilingual, burned-area cross-check.

## Hard rules
1. NEVER invent, hardcode or placeholder a scientific number in the UI. Every number comes from pipeline
   output in web/public/data/v1/. If data is missing, show an explicit missing state. (Fake JSON is allowed
   ONLY during early UI dev, must live in web/src/dev/, and must be removed before Phase 4.)
2. Calibration window is Jul 2012 – Dec 2019 ONLY (MODIS orbit drift after 2020). Never fit on 2020+.
3. Scale VIIRS DOWN to MODIS-equivalent. Never scale MODIS up.
4. Same filters for both sensors (drop low confidence; drop type 1/2/3 where present; same static mask).
5. Never commit .env, keys, data/ or zips. Browser never calls FIRMS or Gemini directly.
6. Before claiming a step works: run it, check outputs (row counts, value ranges), say what you verified.
7. If a decision is unclear or a validation metric fails, STOP and tell me with options. No silent fallbacks.
8. Cite every data source and library in DATA_SOURCES.md as you add it (Space Apps can strip awards otherwise).
9. Commit after every completed task with a clear message. Update PROGRESS.md at the end of every session.

## Stack
- pipeline/: Python 3.12, duckdb, polars, h3 (v4 API), numpy, scipy, pyyaml, requests, pyarrow, python-dotenv, pytest
- web/: Vite + React + TypeScript, Tailwind v4 (@tailwindcss/vite), maplibre-gl, d3, h3-js, @turf/turf,
  framer-motion (UI only), html-to-image, scrollama
- web/api/: Vercel serverless functions (TypeScript), @google/genai for Gemini function calling
- Vercel project Root Directory = web/. Static data in web/public/data/v1/.
- Basemap: OpenFreeMap (no key). Place search: Nominatim, max 1 req/s, cache results.

## Layout
pipeline/{config.yaml, run_all.py, 01_fetch_nrt.py, 02_unify.py, 03_mask.py, 04_cube.py, 05_calibrate.py,
          06_validate.py, 07_stats.py, 08_export.py, lib/, tests/}
data/{raw,clean,cube,out}/   (gitignored)
web/src/{styles/tokens.css, lib/, components/, pages/, dev/}  web/api/{ask.ts, tools.ts}
web/public/data/v1/{meta.json, regions/*.json, hotspots/*.csv, dataset/*, ask_cache.json}
docs/  README.md  METHODS.md  DATA_SOURCES.md  CITATION.cff  LICENSE (MIT)  PROGRESS.md

## Commands
Pipeline: python pipeline/run_all.py   ·   Tests: pytest pipeline/tests
Web: cd web; npm run dev | npm run build | npm run lint
Visual check: Playwright screenshots of key pages at 1440px and 390px into docs/screens/ after UI work;
review them yourself and fix layout issues before saying UI work is done.

## Science spec (summary — details in master plan §7)
- Unify columns: lat, lon, t_utc, solar_date (= UTC + lon/15 h), stream (TERRA/AQUA/SNPP/N20/N21),
  conf (L/N/H: MODIS 0–29/30–79/80–100; VIIRS l/n/h), frp, daynight, type, product (SP/NRT), region.
  Inspect real headers/codes first. Fail loudly on unknown satellite codes. Dedupe NRT vs SP (prefer SP).
- Static mask: H3 r9, ≥16 detection-days in ≥3 years AND seasonality S=(max monthly share−1/12)/(11/12) < 0.3;
  pooled across sensors. Report top 20 masked cells with coordinates for manual checking.
- Cube: H3 r6 daily presence per stream → monthly cell-days C. MODIS stream = Terra ∪ Aqua.
  Keep raw hotspot counts per stream too. Coverage adjust C*=C·D/O when O/D≥0.6 else flag "insufficient".
- Calibrate per region × calendar month on Jul 2012–Dec 2019: k_m=(A+0.5)/(B+0.5); shrink on log scale toward
  region-wide k with w=B/(B+τ), τ∈{10,30,100,300} chosen by leave-one-year-out.
  q = Terra→Terra∪Aqua (Jul 2002–Dec 2019). k' = NOAA-20→S-NPP over joint years (2018-04 → 2026-07).
- H: 2001-01..2002-06 q·Terra | 2002-07..2011-12 MODIS | 2012-01..2026-10 k·SNPP | 2026-11.. k·k'·N20.
- Bootstrap years ×500 (+Poisson) → P5/P95; flag "uncertain" if (P95−P5)/max(H,1) > 0.5.
- Validate: V1 LOYO annual error; V3 step test before/after 2012 raw vs harmonized; V4 yearly MODIS/VIIRS
  ratio 2012–2025 (drift); V9 famous seasons rank (Black Summer 2019–20, Punjab peak years). Write JSON.
- Stats: baseline 2003–2022; ratio to median; Weibull percentile range over bootstrap; return period
  (no extrapolation); rank; low-activity guard (median<5 & X<10); month-to-date vs same-day baseline;
  similar years (top-3 correlation of YTD monthly curve).
- Fallback ladder if validation fails: single region-wide ratio → within-era percentiles. Ask me first.
- Region JSON contract: master plan §6.3. Keep it stable; the frontend depends on it.

## Design spec (summary — master plan §4–5)
"Night Earth" dark theme; tokens in web/src/styles/tokens.css exactly as master plan §4.2.
Counts ramp d3.interpolateInferno t∈[0.18,0.98], 7 quantile classes per region, zero = --zero cell.
Anomaly ramp RdBu reversed, ±3 log2, mid #2A3442. Patterns: hatch=uncertain, cross-hatch=no data,
dotted outline=provisional. Fonts: Space Grotesk (headings), Inter (body), JetBrains Mono tabular (numbers).
Motion 180–420ms, respect prefers-reduced-motion. Every chart has "View as table". Keyboard nav on
rings + grid (role="grid", aria-labels). Never colour-only encoding. One decimal max ("2.1×").
Quality bar: should look like NASA Earth Observatory meets a premium data product. Polish matters.

## AI analyst (web/api/ask.ts)
Gemini function calling (model from GEMINI_MODEL; check the current model name). Tools read region JSON:
list_regions, get_month, get_season, get_rankings, get_similar_years, get_quality.
System rules: only numbers returned by tools; ≤4 sentences (responder) / ≤8 (scientist); always end with one
caveat; never forecast; say when data is missing. Return {answer, caveat, trace:[{tool,args,result_summary}]}.
Precompute ask_cache.json for 4 chips × 4 regions; frontend falls back to cache on any API error.
Simple per-IP rate limit in the function.

## Working style
- Work in phases tracked in PROGRESS.md. Start every session by reading PROGRESS.md + this file.
- Use plan mode for anything touching >3 files: show the plan, then execute.
- Small, testable steps. Simple, readable code over clever code.
- If something needs me (accounts, Vercel settings, manual checks), tell me exactly what to click.