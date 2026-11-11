# Data sources, libraries and acknowledgements

Every data source and software library used by Fire Rings. Updated as each is added.

## Data

| Source | Product / version | Use | Access | Licence / terms |
|---|---|---|---|---|
| NASA FIRMS — MODIS Collection 6.1 active fire (MCD14 hotspots, Terra + Aqua) | M-C61, standard (SP, versions 6.03 / 61.03) + NRT (6.1NRT), 2000-11-01 → 2026-11-08 | Baseline sensor 2001–2011, calibration target | FIRMS Archive Download, https://firms.modaps.eosdis.nasa.gov/download/ (requested 2026-11-09) | NASA open data; acknowledgement below |
| NASA FIRMS — VIIRS 375 m active fire, Suomi-NPP (VNP14IMG) | SV-C2, SP (v2) + NRT (2.0NRT), 2012-01-20 → 2026-11-02 | Harmonized record 2012 → Oct 2026 | same | same |
| NASA FIRMS — VIIRS 375 m active fire, NOAA-20 (VJ114IMG) | J1V-C2, SP + NRT, 2018-04-01 → 2026-11-08 | Continuity after S-NPP (k′ link) | same | same |
| NASA FIRMS — VIIRS 375 m active fire, NOAA-21 (VJ214IMG) | J2V-C2, SP + NRT, 2023-03-01 → 2026-11-08 | Cross-check / continuity | same | same |

**FIRMS acknowledgement.** We acknowledge the use of data and/or imagery from NASA's Fire Information
for Resource Management System (FIRMS) (https://www.earthdata.nasa.gov/firms), part of NASA's Earth
Science Data and Information System (ESDIS).

MODIS: MODIS Collection 61 NRT Hotspot / Active Fire Detections MCD14ML distributed from NASA FIRMS.
DOI: 10.5067/FIRMS/MODIS/MCD14ML.
VIIRS: NRT VIIRS 375 m Active Fire product VNP14IMGT / VJ114IMGTDL / VJ214IMGTDL distributed from NASA FIRMS.
DOIs: 10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002, 10.5067/FIRMS/VIIRS/VJ114IMGTDL_NRT.002,
10.5067/FIRMS/VIIRS/VJ214IMGTDL_NRT.002.

## Scientific references
- Giglio, L., Schroeder, W., Justice, C.O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment* 178, 31–41.
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. (2014). The New VIIRS 375 m active fire detection data product. *Remote Sensing of Environment* 143, 85–96.
- MODIS C6/C6.1 Active Fire User Guide; VIIRS VNP14 User Guide (links in docs/FIRE_RINGS_MASTER_PLAN.md §12).

## Software — pipeline (Python 3.11)

| Library | Version | Licence | Use |
|---|---|---|---|
| DuckDB | 2.0.0 | MIT | Reading multi-GB CSVs, SQL aggregation |
| Polars | 2.1.0 | MIT | DataFrames |
| h3 (h3-py) | 4.5.0 | Apache-2.0 | H3 hexagonal grid (Uber) |
| NumPy | 2.4.6 | BSD-3 | Numerics |
| SciPy | 1.17.1 | BSD-3 | Statistics |
| PyYAML | 6.0.3 | MIT | Config |
| Requests | 2.34.2 | Apache-2.0 | FIRMS API (NRT) |
| PyArrow | 26.0.1 | Apache-2.0 | Parquet I/O |
| python-dotenv | 1.2.4 | BSD-3 | Local secrets |
| pytest | 9.2.0 | MIT | Tests |
| DuckDB H3 community extension (isaacbrodsky/h3-duckdb) | via `INSTALL h3 FROM community` | Apache-2.0 | H3 indexing inside DuckDB SQL (cell ids cross-checked against h3-py) |

## Software — web

| Library | Version | Licence | Use |
|---|---|---|---|
| Vite | 8.3.7 | MIT | Build tool / dev server |
| React + React DOM | 19.3.1 | MIT | UI |
| React Router | 7.18.5 | MIT | Routing |
| Tailwind CSS (+ @tailwindcss/vite) | 4.3.5 | MIT | Styling via design tokens |
| TypeScript | 7.0.2 | Apache-2.0 | Types |
| oxlint | 1.93.0 | MIT | Linting |
| Space Grotesk, Inter, JetBrains Mono (via Fontsource variable packages 5.3.0) | — | SIL Open Font License 1.1 (fonts), MIT (packages) | Typography, self-hosted |
| D3 (d3-scale, d3-shape, d3-array, d3-interpolate, d3-scale-chromatic) | 7.9.2 | ISC | Scales, arcs, inferno ramp |
| MapLibre GL JS | 6.17.0 | BSD-3-Clause | Interactive map |
| h3-js | 4.5.0 | Apache-2.0 | H3 cell boundaries/centroids in the browser |
| html-to-image | 1.11.13 | MIT | PNG export |
| Playwright | (dev) | Apache-2.0 | Screenshots + interaction smoke tests |
| @google/genai (Google Gen AI SDK) | 2.32.0 | Apache-2.0 | Gemini function calling in web/api/ask.ts |
| scrollama | 3.2.0 | MIT | Story mode scroll steps |
| qrcode | 1.5.4 | MIT | QR code on the last slide (P1.8) |
| tsx | (dev) | MIT | Running TypeScript scripts (AI eval, cache) |
| gifenc, pngjs | (dev) | MIT | Seam-slider GIF for the README |

## Services
- **NASA FIRMS Area API** (https://firms.modaps.eosdis.nasa.gov/api/area/) — near-real-time VIIRS NOAA-20/21:
  (a) `pipeline/01_fetch_nrt.py` (last 60 days for Punjab, folded into the record as provisional NRT);
  (b) `web/api/live.ts` live layer (last 72 h, all regions, `VIIRS_NOAA20_NRT` + `VIIRS_NOAA21_NRT`, cached 45 min,
  shown separately as "near-real-time, provisional", never added to the harmonized numbers). MAP_KEY is server-side only (Vercel env `FIRMS_MAP_KEY`).
- **Google Gemini API** — in-app analyst (models listed in PROGRESS.md Decision 16); answers grounded only in Fire Rings data.
- **Vercel** — hosting and serverless functions.

## Basemap and design references
- **OpenFreeMap** "dark" style (https://openfreemap.org), no key. Map data © **OpenStreetMap contributors** (ODbL), tiles via OpenMapTiles schema.
- **ColorBrewer** RdBu diverging scheme (Cynthia Brewer, Apache-2.0 style licence) for the anomaly ramp; **inferno** colormap (Smith & van der Walt, CC0) for counts.
- **H3** hierarchical hexagonal grid (Uber Technologies, Apache-2.0); resolution 6 average cell area ≈ 36 km² (h3geo.org resolution table).

## AI tools disclosure
- Claude Code (Anthropic) used as an AI coding assistant to build this repository.
- Google Gemini used in-app (Ask Fire Rings), grounded in pipeline outputs only (Phase 6).
