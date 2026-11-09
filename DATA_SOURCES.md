# Data sources, libraries and acknowledgements

Every data source and software library used by Fire Rings. Updated as each is added.

## Data

| Source | Product / version | Use | Access | Licence / terms |
|---|---|---|---|---|
| NASA FIRMS â€” MODIS Collection 6.1 active fire (MCD14 hotspots, Terra + Aqua) | M-C61, standard (SP, versions 6.03 / 61.03) + NRT (6.1NRT), 2000-11-01 â†’ 2026-11-08 | Baseline sensor 2001â€“2011, calibration target | FIRMS Archive Download, https://firms.modaps.eosdis.nasa.gov/download/ (requested 2026-11-09) | NASA open data; acknowledgement below |
| NASA FIRMS â€” VIIRS 375 m active fire, Suomi-NPP (VNP14IMG) | SV-C2, SP (v2) + NRT (2.0NRT), 2012-01-20 â†’ 2026-11-02 | Harmonized record 2012 â†’ Oct 2026 | same | same |
| NASA FIRMS â€” VIIRS 375 m active fire, NOAA-20 (VJ114IMG) | J1V-C2, SP + NRT, 2018-04-01 â†’ 2026-11-08 | Continuity after S-NPP (kâ€² link) | same | same |
| NASA FIRMS â€” VIIRS 375 m active fire, NOAA-21 (VJ214IMG) | J2V-C2, SP + NRT, 2023-03-01 â†’ 2026-11-08 | Cross-check / continuity | same | same |

**FIRMS acknowledgement.** We acknowledge the use of data and/or imagery from NASA's Fire Information
for Resource Management System (FIRMS) (https://www.earthdata.nasa.gov/firms), part of NASA's Earth
Science Data and Information System (ESDIS).

MODIS: MODIS Collection 61 NRT Hotspot / Active Fire Detections MCD14ML distributed from NASA FIRMS.
DOI: 10.5067/FIRMS/MODIS/MCD14ML.
VIIRS: NRT VIIRS 375 m Active Fire product VNP14IMGT / VJ114IMGTDL / VJ214IMGTDL distributed from NASA FIRMS.
DOIs: 10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002, 10.5067/FIRMS/VIIRS/VJ114IMGTDL_NRT.002,
10.5067/FIRMS/VIIRS/VJ214IMGTDL_NRT.002.

## Scientific references
- Giglio, L., Schroeder, W., Justice, C.O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment* 178, 31â€“41.
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. (2014). The New VIIRS 375 m active fire detection data product. *Remote Sensing of Environment* 143, 85â€“96.
- MODIS C6/C6.1 Active Fire User Guide; VIIRS VNP14 User Guide (links in docs/FIRE_RINGS_MASTER_PLAN.md Â§12).

## Software â€” pipeline (Python 3.11)

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
| DuckDB H3 community extension (isaacbrodsky/h3-duckdb) | via INSTALL h3 FROM community | Apache-2.0 | H3 indexing inside DuckDB SQL (cross-checked against h3-py) |

## Software â€” web

| Library | Version | Licence | Use |
|---|---|---|---|
| Vite | 8.3.7 | MIT | Build tool / dev server |
| React + React DOM | 19.3.1 | MIT | UI |
| React Router | 7.18.5 | MIT | Routing |
| Tailwind CSS (+ @tailwindcss/vite) | 4.3.5 | MIT | Styling via design tokens |
| TypeScript | 7.0.2 | Apache-2.0 | Types |
| oxlint | 1.93.0 | MIT | Linting |
| Space Grotesk, Inter, JetBrains Mono (via Fontsource variable packages 5.3.0) | â€” | SIL Open Font License 1.1 (fonts), MIT (packages) | Typography, self-hosted |

## AI tools disclosure
- Claude Code (Anthropic) used as an AI coding assistant to build this repository.
- Google Gemini used in-app (Ask Fire Rings), grounded in pipeline outputs only (Phase 6).
