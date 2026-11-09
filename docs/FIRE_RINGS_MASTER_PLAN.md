\# FIRE RINGS: Master Plan v2 (7-day build)

\*\*NASA Space Apps 2026 · "Harmonization of MODIS and VIIRS Hot Spots" · Port Louis (Rajiv Gandhi Science Centre) · build Mon 9 → submit Sun 15 Nov 2026\*\*

\*\*Target award: BEST USE OF DATA.\*\* Secondary: Best Use of Science, Local Impact.



> v2 changes: early building confirmed allowed by the local event (said on the Zoom call; keep a screenshot or note of who said it). The plan is now a 7-day build with a full design system, a screen-by-screen UI spec, a day-by-day schedule and a complete presentation kit. Other teams may already be weeks in, so the bar is "would a NASA data scientist bookmark this?"



\---



\## 0. The pitch in one line

\*\*"25 years of fire, two generations of satellites, one honest record, for any place on Earth. Ask it anything."\*\*



\## 1. Why Best Use of Data, and how we earn it

\- \*\*Definition:\*\* the project that best makes space data accessible, or leverages it for a unique application.

\- \*\*We earn it four ways.\*\* Each one is visible in the demo.

&#x20; 1. \*\*Accessible:\*\* a calendar a firefighter reads in 5 seconds, plus a plain-English AI analyst grounded in real numbers.

&#x20; 2. \*\*Unique application:\*\* the first 25-year, single-unit, uncertainty-aware fire calendar for any area, with the MODIS orbit drift handled.

&#x20; 3. \*\*Data rigour:\*\*

&#x20;    - 5 satellite streams (Terra, Aqua, Suomi-NPP, NOAA-20, NOAA-21).

&#x20;    - Validated out of sample.

&#x20;    - Cross-checked against an independent NASA product (MCD64A1 burned area, stretch).

&#x20; 4. \*\*Gives data back:\*\* we publish the \*\*harmonized dataset itself\*\* (CSV + Parquet + JSON API, versioned, with a citation). Other people can build on it. That's the strongest "Best Use of Data" move.

\- \*\*What the 2025 winners teach\*\* (from NASA's winner write-ups):

&#x20; - Twisters turned NASA Earth data + AI into an everyday assistant answering one simple question.

&#x20; - SpaceGenes+ won \*Science\* with design and visualisation that made complex data accessible.

&#x20; - Resonant Exoplanets won \*Data\* with AI working over large real datasets.

&#x20; - QUEÑARIS tied everything to one real place.

\- \*\*Our version:\*\* one question ("Is this fire season normal?") + real data at scale + beautiful accessible visuals + a real place (Madagascar / Indian Ocean).



\## 2. The idea, simply

\- \*\*Old camera, MODIS (2000→\~2027):\*\* blurry 1 km pixels; orbits drifting since 2020.

\- \*\*New camera, VIIRS (2012→):\*\* sharp 375 m pixels; sees many more, smaller fires and splits big fires into many pixels.

&#x20; - Suomi-NPP stopped delivering data in early Nov 2026.

&#x20; - NOAA-20/21 continue.

\- \*\*The naive mistake:\*\* join the two and fire "explodes" in 2012.

\- \*\*The fix:\*\* convert VIIRS into "what MODIS would have counted" (MODIS-equivalent units), so 2001 and 2026 use the same ruler. You can't add detail to the old data.

\- \*\*We still show raw VIIRS detail for 2012+.\*\*

\- \*\*Why NASA hasn't done it:\*\*

&#x20; - NASA ships the science products; FIRMS keeps the sensors as separate layers on purpose.

&#x20; - Harmonizing hotspot \*counts\* is still open research.

&#x20; - It only became urgent now (Suomi-NPP ended, MODIS ending, orbit drift).

&#x20; - Partial tools exist (CAMS for emissions, GFW VIIRS-only, GWIS admin units), but not this.



\---



\## 3. Feature list (final scope for 7 days)



\### 3.1 Core (must ship)

| ID | Feature |

|---|---|

| C1 | Harmonized monthly record, 2001→now, for \*\*6 hero regions\*\* + \*\*every country preset\*\* (§5.4) |

| C2 | \*\*Fire Rings\*\* hero chart (years = rings, months = clock) |

| C3 | \*\*Grid calendar\*\* (year × month) with uncertainty hatching, transition line, source badges |

| C4 | \*\*Seam slider\*\*: morph Raw ↔ Harmonized |

| C5 | \*\*"Is this normal?"\*\* headline sentence + gauge (ratio to median, percentile range, 1-in-X years, low-activity guard, month-to-date) |

| C6 | \*\*Map\*\*: MapLibre, presets, place search, rectangle/polygon draw, lat/lon box, hotspots of selected month |

| C7 | \*\*Proof page\*\*: before/after, drift chart, out-of-sample error, k-by-month with CI, limitations |

| C8 | \*\*Exports\*\*: hotspots CSV, calendar CSV, PNG of rings/grid with legend + caption burned in |

| C9 | \*\*Ask Fire Rings\*\*: AI analyst with function calling + visible "numbers used" trace |

| C10 | \*\*Data page\*\*: download the harmonized dataset, JSON API docs, citation, licence |



\### 3.2 Wow (ship by Friday)

| ID | Feature |

|---|---|

| W1 | \*\*Globe time-lapse landing\*\*: 3D MapLibre globe; monthly fire activity plays 2001→2026 with a year counter and scrubber; slow auto-rotate |

| W2 | \*\*Live "This November"\*\*: NOAA-20/21 near-real-time pulled during the event; Punjab crop burning compared against 25 Novembers |

| W3 | \*\*Story mode: Madagascar\*\*, a 6-step scrollytelling tour (rhythm → extremes → El Niño years → what it means → small islands → try it yourself) |

| W4 | \*\*Compare\*\*: two to four regions as small-multiple rings on a shared scale + seasonal fingerprint overlay |

| W5 | \*\*Similar years\*\*: "This season looks most like 2010, 2019, 2015", labelled analogue, not forecast |

| W6 | \*\*Sensor timeline\*\*: Terra / Aqua / S-NPP (ended Nov 2026) / NOAA-20 / NOAA-21 with drift and end dates |



\### 3.3 Stretch (only if Thursday's gate is green)

| ID | Feature |

|---|---|

| S1 | \*\*Any drawn area worldwide\*\* at H3 res 5 via precomputed global cube (§5.4) |

| S2 | \*\*Burned-area cross-check\*\* (MCD64A1) on the Proof page |

| S3 | \*\*Fire-season shift\*\* (start/peak/end per year, trend with p-value) |

| S4 | \*\*Multilingual UI\*\* (EN / FR) for Indian Ocean + Francophone Africa users |



\*\*Explicitly not doing:\*\* forecasting/ML prediction, user accounts, real alert emails, weather overlays.



\---



\## 4. DESIGN SYSTEM



\### 4.1 Mood

"Night Earth." Dark space-like background so fire glows. Calm, scientific, premium: think NASA Earth Observatory meets a Bloomberg terminal. \*\*No gradients on data, no 3D charts, no rainbow.\*\*



\### 4.2 Colour tokens (copy into `web/src/styles/tokens.css`)

```css

:root{

&#x20; --bg:#0A0E14; --surface:#111822; --surface-2:#18212E; --surface-3:#202B3A;

&#x20; --border:#263142; --border-strong:#34425A;

&#x20; --text:#E8EEF5; --text-muted:#93A1B3; --text-faint:#5D6B7E;

&#x20; --accent:#FF7A45;        /\* UI accent only (buttons, focus), never data \*/

&#x20; --accent-2:#5AC8FA;      /\* links, info \*/

&#x20; --ok:#3DDC97; --warn:#FFC145; --danger:#FF5C6C;

&#x20; --focus:0 0 0 3px rgba(255,122,69,.55);

&#x20; --zero:#1C2533;          /\* zero-activity cells \*/

&#x20; --nodata:transparent;    /\* + cross-hatch pattern \*/

&#x20; --radius:14px; --radius-sm:8px;

&#x20; --shadow:0 8px 30px rgba(0,0,0,.35);

}

```

\- \*\*Counts ramp:\*\* `d3.interpolateInferno` sampled from \*\*t = 0.18 → 0.98\*\*. The bottom of inferno is near-black and would vanish on the dark background. 7 quantile classes per region. Zero gets its own `--zero` cell with a 1 px border. Inferno is perceptually uniform and colour-vision-deficiency friendly.

\- \*\*Anomaly ramp:\*\* ColorBrewer \*\*RdBu reversed\*\*, 7 classes, limits ±3 on log₂ (= 8×). The middle "typical" class is `#2A3442` grey, not white, on dark.

\- \*\*Patterns:\*\*

&#x20; - Uncertain = diagonal hatch overlay, 35% white.

&#x20; - No data = cross-hatch.

&#x20; - Provisional = dotted outline.

&#x20; - Low-activity guard = grey + "\~".

\- \*\*Accessibility:\*\* glyphs ▲▼ on |log₂| ≥ 1; every chart has a "View as table" toggle.



\### 4.3 Typography (Google Fonts, free)

\- \*\*Display/headings:\*\* Space Grotesk 600/700.

\- \*\*Body:\*\* Inter 400/500.

\- \*\*Numbers:\*\* JetBrains Mono 500 with `font-variant-numeric: tabular-nums`.

\- \*\*Scale:\*\* 12 / 14 / 16 / 20 / 28 / 40 / 64 (hero headline on landing).



\### 4.4 Layout and spacing

\- 8 px grid; max content width 1440 px.

\- Desktop dashboard = left rail 280 px · centre fluid · right insight panel 360 px.

\- Tablet: panels stack. Mobile (≥ 360 px): headline → rings → gauge → grid → map.

\- Cards: `--surface`, 1 px `--border`, radius 14, padding 20–24.



\### 4.5 Motion

\- Durations 180–420 ms, `cubic-bezier(.2,.8,.2,1)`.

\- \*\*Ring draw-in:\*\* rings appear from the centre outward, staggered 40 ms per year (\~1 s total).

\- \*\*Seam slider:\*\* cell colours tween between the raw and harmonized scales in real time (no reflow).

\- \*\*Numbers:\*\* count up on first view (600 ms).

\- \*\*Globe:\*\* 0.6°/s auto-rotate; stops on interaction.

\- Everything respects `prefers-reduced-motion` (instant swaps).



\### 4.6 Voice and copy rules

\- Headline first, detail on demand.

\- Plain words: "fire-days" in the UI, "fire cell-days (MODIS-equivalent)" in tooltips and methods.

\- One decimal max ("2.1×"). Percentile as a range ("88th–97th").

\- Every number has a unit and a source badge.

\- Never "fires increased X%" without a CI.



\---



\## 5. UI SPEC, screen by screen



\### S0 Landing / Globe (`/`)

\- \*\*Layout:\*\* full-bleed MapLibre globe (`projection: 'globe'`) on `--bg`, with a starfield as a subtle CSS radial dots layer.

\- \*\*Layer:\*\* H3 res-3 hexes, coloured by MODIS-equivalent fire-days for the current month in the playback. Extruded height is OFF (flat is more honest); glow via a soft blur duplicate layer.

\- \*\*Bottom centre:\*\* timeline scrubber 2001──2026, play/pause, speed 1×/4×, big mono year+month counter ("SEP 2019").

\- \*\*Top left:\*\* wordmark "FIRE RINGS" + tagline. \*\*Top right:\*\* Explore · Proof · Data · Story · Ask.

\- \*\*Centre-left overlay card:\*\* "25 years of fire. One honest record." + buttons \[Explore a region] \[Watch the story].

\- \*\*Bottom-left:\*\* 4 region cards with \*\*mini rings\*\* (64 px) + a one-line stat.

\- \*\*Fallback:\*\* if the global cube isn't ready, the globe shows only the hero regions glowing, and the copy says "hero regions".



\### S1 Region dashboard (`/r/:regionId`)

```

┌ Rail ────────┬────────────────────── Centre ───────────────────────┬─ Insight ───────────┐

│ Search place │ MADAGASCAR · 587,000 km² · 2001–Nov 2026 · \[Raw|Harm]│ IS THIS NORMAL?      │

│ Presets      │ "October 2026: 2.1× a typical October — 93rd pct,    │  ◔ gauge (pct+arc)   │

│ Draw ▭ ⬠     │  about a 1-in-14-year October. Provisional."         │  2.1× · 88–97th pct  │

│ Lat/Lon box  │ \[KPI This month]\[KPI YTD vs median]\[KPI Peak month]  │  "1-in-14 yr"        │

│ Date range   │ \[KPI Masked detections]                              │ SIMILAR YEARS        │

│ Baseline     │ ┌──────────── FIRE RINGS (hero, 560px) ────────────┐│  2010 · 2019 · 2015  │

│ Mode:        │ │      12 months around · 25 rings · legend right   ││ ASK FIRE RINGS       │

│ Counts/Anom  │ └───────────────────────────────────────────────────┘│  \[chip]\[chip]\[chip]  │

│ /Raw         │  Seam slider:  RAW ●────────────○ HARMONIZED          │ EXPORT ▾             │

│ Compare +    │ Grid calendar (years × months + year totals + typical)│ Provenance ⓘ        │

│              │ Seasonality (box/month + this year) │ Annual bars + CI │                      │

│              │ Map: selected month hotspots (● MODIS ▲ VIIRS)       │                      │

└──────────────┴──────────────────────────────────────────────────────┴──────────────────────┘

```

\*\*Fire Rings interactions:\*\*

\- \*\*Hover a cell:\*\* it highlights. Its \*\*month spoke\*\* (same month, all years) and \*\*year ring\*\* dim-highlight. Tooltip: "Sep 2019 · 1,240 fire-days (CI 1,050–1,430) · 2.4× median · 96th pct · VIIRS calibrated · raw hotspots: MODIS 2,310 / VIIRS 15,880".

\- \*\*Click\*\* → S2 drill-down. \*\*Arrow keys\*\* move between cells; Enter opens; Esc closes. The SVG uses `role="grid"` and `aria-label` per cell.

\- \*\*Visual details:\*\*

&#x20; - Dashed ring between 2011 and 2012, labelled "MODIS → VIIRS (calibrated)".

&#x20; - Thin ring at Nov 2026, "S-NPP → NOAA-20".

&#x20; - Outer label ring with month initials.

&#x20; - Centre hole shows the region's annual total sparkline.

\- \*\*Mode toggle:\*\* Counts (inferno) / Anomaly (RdBu) / Raw (two half-rings: MODIS inner half-cell, VIIRS outer half-cell).



\### S2 Month drill-down (side drawer)

\- Daily bars for the month; grey band = P10–P90 of the same days in baseline years; median line.

\- Mini map of that month's hotspots, coloured by sensor with different shapes.

\- Dot plot: all baseline values for this month (grey dots), median bar, this month (big dot + CI).

\- Buttons: \[Download this month's hotspots CSV] \[Ask about this month].



\### S3 Proof (`/proof`), "How we know it works"

1\. \*\*Before/after line chart:\*\* raw concatenated (step at 2012, red annotation with the step size) vs harmonized (flat). Toggle region.

2\. \*\*Drift chart:\*\* yearly MODIS÷VIIRS ratio 2012–2025, a band for the calibration window 2012–2019, an annotation at 2020 ("Terra drift") and Dec 2021 ("Aqua free drift").

3\. \*\*Validation cards:\*\* out-of-sample annual error %, step test before/after + p, seasonal-shape r, famous seasons ranking (Black Summer #1?).

4\. \*\*k by month with CI bars\*\* + the overlap counts behind them.

5\. \*\*Limitations:\*\* three cards, each with its mitigation.

6\. Methods summary + link to METHODS.md.



\### S4 Ask Fire Rings (drawer from the right, also full page `/ask`)

\- Chat with region context auto-filled. Chips: "Is this month unusual?" · "Worst year on record?" · "When does the season peak?" · "How reliable is this?"

\- Each answer card shows: answer (≤4 sentences) → caveat line → collapsible \*\*"Numbers used"\*\* trace listing tool calls and values.

\- A voice toggle for "Responder" (short) vs "Scientist" (with CIs and method).



\### S5 Story mode (`/story/madagascar`)

\- Scrollytelling: sticky rings on the left, text steps on the right; each step animates the rings (highlight months, years, anomaly mode).

\- \*\*6 steps:\*\*

&#x20; 1. The clock of burning.

&#x20; 2. The peak months.

&#x20; 3. The extreme years.

&#x20; 4. Raw vs harmonized: why the old record mattered.

&#x20; 5. Small islands: Mauritius/Réunion and the honest "too little to judge".

&#x20; 6. "Now explore your own area."



\### S6 Data (`/data`), the Best Use of Data showcase

\- \*\*Hero:\*\* "Fire Rings Harmonized Hotspot Record v1.0: open, versioned, citable."

\- \*\*Downloads:\*\*

&#x20; - `harmonized\_monthly\_regions\_v1.csv`

&#x20; - `harmonized\_monthly\_h3r5\_v1.parquet` (if S1)

&#x20; - `calibration\_k\_v1.csv`

&#x20; - `validation\_v1.json`

\- \*\*Data dictionary table\*\* (every column, unit, meaning).

\- \*\*Static JSON API docs\*\* (`/data/v1/regions/{id}.json`) with a curl example.

\- \*\*Citation block\*\* (CITATION.cff text) + licence (data CC BY 4.0, code MIT) + NASA FIRMS acknowledgement.

\- Changelog.



\### S7 Compare (`/compare?r=madagascar,punjab`)

\- Small-multiple rings on a shared scale; a radial "fingerprint" overlay (normalised climatology per region); KPI table.



\### Global states

\- Skeleton rings while loading ("Reading 2001–2026…").

\- Empty: "No vegetation-fire hotspots detected here since 2001."

\- Over ocean: "No land cells."

\- Error: retry + cached fallback banner.

\- Provisional and stale-data banners.



\---



\## 6. ARCHITECTURE AND REPO



\### 6.1 Stack

\- \*\*Pipeline:\*\* Python 3.12, DuckDB, Polars, `h3` (v4), numpy, scipy.

\- \*\*Web:\*\* Vite + React + TypeScript, Tailwind (tokens via CSS vars), MapLibre GL JS v5 (globe), D3 v7, `@turf/turf` (area, point-in-polygon), `h3-js`, `terra-draw` (+ MapLibre adapter) or `@mapbox/mapbox-gl-draw` as fallback, `framer-motion` (UI transitions only), `html-to-image` (PNG export), `scrollama` (story mode).

\- \*\*AI:\*\* Vercel serverless function `/api/ask` → Gemini (current Flash model) with function calling; key in Vercel env vars only.

\- \*\*Hosting:\*\* Vercel. GitHub public repo. Licence: MIT (code), CC BY 4.0 (derived data).

\- \*\*Basemap:\*\* OpenFreeMap (no key).



\### 6.2 Repo layout (exact paths)

```

fire-rings/

├─ README.md  LICENSE  CITATION.cff  METHODS.md  DATA\_SOURCES.md

├─ pipeline/

│  ├─ requirements.txt

│  ├─ config.yaml                 # regions, windows, thresholds

│  ├─ 01\_fetch\_nrt.py             # FIRMS API (NOAA-20/21 NRT)

│  ├─ 02\_unify.py                 # raw CSV → data/clean/\*.parquet

│  ├─ 03\_mask.py                  # static-source mask

│  ├─ 04\_cube.py                  # H3 r6 daily presence → monthly cell-days

│  ├─ 05\_calibrate.py             # k, q, k', shrinkage, bootstrap

│  ├─ 06\_validate.py              # LOYO, step test, drift, rankings

│  ├─ 07\_stats.py                 # baselines, percentiles, return periods, similar years

│  ├─ 08\_export.py                # web/public/data/v1/\*.json, \*.csv

│  ├─ 09\_global\_cube.py           # stretch: H3 r3/r5 global

│  └─ lib/ (h3utils.py, stats.py, io.py)

├─ data/ (gitignored) raw/ clean/ cube/ out/

├─ web/

│  ├─ index.html  vite.config.ts  tailwind.config.ts

│  ├─ public/data/v1/ regions/\*.json  hotspots/\*.csv  global/\*.json  meta.json

│  └─ src/

│     ├─ styles/tokens.css

│     ├─ lib/ (scales.ts, format.ts, stats.ts, api.ts, exportPng.ts, csv.ts)

│     ├─ components/

│     │  FireRings.tsx  GridCalendar.tsx  SeamSlider.tsx  Gauge.tsx  Headline.tsx

│     │  KpiCard.tsx  Legend.tsx  MonthDrawer.tsx  SeasonalityChart.tsx  AnnualBars.tsx

│     │  MapView.tsx  DrawTools.tsx  PlaceSearch.tsx  GlobeTimelapse.tsx  SensorTimeline.tsx

│     │  AskDrawer.tsx  AnswerCard.tsx  ProvenanceDrawer.tsx  TableView.tsx  Banners.tsx

│     └─ pages/ Landing.tsx  Region.tsx  Proof.tsx  Story.tsx  Data.tsx  Compare.tsx  Ask.tsx

└─ api/

&#x20;  ├─ ask.ts                      # Vercel function: Gemini + tools

&#x20;  └─ tools.ts                    # get\_month, get\_season, get\_rankings, get\_similar, get\_quality, list\_regions

```



\### 6.3 Data contract (`web/public/data/v1/regions/{id}.json`)

```json

{

&#x20; "id":"madagascar","name":"Madagascar","area\_km2":587000,"bbox":\[43.2,-25.7,50.5,-11.9],

&#x20; "baseline":\[2003,2022],"calib\_version":"v1","updated":"2026-11-14T06:00Z",

&#x20; "months":\[{"y":2015,"m":10,"H":0,"lo":0,"hi":0,"raw\_modis":0,"raw\_viirs":0,

&#x20;            "hot\_modis":0,"hot\_viirs":0,"src":"M|T|V|V2","flags":\["uncertain","provisional","insufficient","mtd"]}],

&#x20; "k":{"month":\[],"lo":\[],"hi":\[],"B":\[]},

&#x20; "validation":{"loyo\_err\_pct":0,"step\_raw\_pct":0,"step\_harm\_pct":0,"step\_p":0,"shape\_r":0,

&#x20;               "drift":\[{"y":2012,"ratio":0}]},

&#x20; "climatology":{"median":\[],"p10":\[],"p90":\[]},

&#x20; "latest":{"y":2026,"m":11,"mtd":true,"value":0,"median":0,"ratio":0,"pct":\[0,0],"return\_period":null,"rank":0,"guard":null},

&#x20; "annual":\[{"y":2001,"H":0,"lo":0,"hi":0}],

&#x20; "similar\_years":\[],

&#x20; "daily":{"2026-11":\[0]}

}

```



\### 6.4 Data acquisition (start TONIGHT)

1\. \*\*FIRMS Archive Download\*\* (Earthdata login; delivered by email, can take hours):

&#x20;  - MODIS C6.1 standard 2000-11 → latest

&#x20;  - VIIRS S-NPP 375 m standard 2012-01 → end

&#x20;  - VIIRS NOAA-20 standard 2018/2020 → latest

&#x20;  - NOAA-21 → latest

&#x20;  - Request the hero regions as bounding boxes first (small, fast).

&#x20;  - Request global per sensor as a second batch for S1.

2\. \*\*FIRMS yearly country CSVs\*\* (download page) for India, Madagascar, Australia, Mauritius, Indonesia, Brazil: the fastest route.

3\. \*\*FIRMS Area API\*\* (MAP\_KEY) only for the last \~2 months of NRT (NOAA-20/21), at ≤5 days per call. Re-pull Saturday morning for the live demo.

4\. Check `/api/data\_availability/` for the real start/end dates of each source.



\### 6.5 Hero regions

| Region | Why |

|---|---|

| Punjab–Haryana (IN) | Biggest raw 2012 jump; burning in season during the event (live W2) |

| Madagascar | Local Impact + story mode |

| SE Australia (NSW+VIC) | Black Summer 2019–20 inside the VIIRS era |

| Kalimantan + Sumatra (ID) | Peat fires; El Niño 2015/2019 |

| Amazon arc (Rondônia/Pará, BR) | 2019 global headline; land clearing |

| Mauritius + Réunion | Honest low-fire case |



Plus \*\*country presets\*\* (every country in the yearly files you download, harmonized with a per-country monthly k shrunk toward a pooled biome/global k).



\---



\## 7. SCIENCE SPEC (what the pipeline computes)

1\. \*\*Unify:\*\* columns `lat, lon, t\_utc, solar\_date (UTC + lon/15 h), stream, conf (L/N/H), frp, daynight, type, product (SP/NRT)`.

&#x20;  - MODIS conf 0–29 L / 30–79 N / 80–100 H; VIIRS l/n/h.

&#x20;  - \*\*Fail loudly on unknown satellite codes.\*\*

2\. \*\*Filter:\*\* drop L for both sensors; drop `type` 1/2/3.

3\. \*\*Static mask:\*\* H3 r9 cell with ≥16 detection days in ≥3 years AND seasonality index S = (max monthly share − 1/12)/(11/12) < 0.3. Union over sensors. Spot-check the top 20 masked cells on imagery (don't mask sugarcane).

4\. \*\*Cube:\*\* H3 r6 daily presence per stream → monthly cell-days `C`. MODIS stream = Terra ∪ Aqua. Coverage adjust: `C\* = C·D/O` if O/D ≥ 0.6, else flag "insufficient".

5\. \*\*Calibrate\*\* (per region/country, per calendar month). Window \*\*Jul 2012 – Dec 2019\*\*:

&#x20;  - `k\_m = (A\_m+0.5)/(B\_m+0.5)`; pooled `k\_pool` (biome or global).

&#x20;  - `ln k\*\_m = w·ln k\_m + (1−w)·ln k\_pool`, `w = B\_m/(B\_m+τ)`, τ ∈ {10, 30, 100, 300} chosen by leave-one-year-out.

&#x20;  - \*\*q\*\* (Terra→Terra∪Aqua) over Jul 2002 – Dec 2019.

&#x20;  - \*\*k'\*\* (NOAA-20→S-NPP) over their joint years.

6\. \*\*Harmonized H:\*\*

&#x20;  - 2001-01–2002-06: q·Terra.

&#x20;  - 2002-07–2011-12: MODIS.

&#x20;  - 2012-01–2026-10: k\*·SNPP.

&#x20;  - 2026-11→: k\*·k'·N20.

7\. \*\*Uncertainty:\*\* year-block bootstrap ×500 (+ Poisson draw on counts). CI = P5–P95. Hatch if (P95−P5)/max(H,1) > 0.5.

8\. \*\*Validate:\*\*

&#x20;  - V1 LOYO annual error (target |bias| < 10%, MAPE < 20% in active regions).

&#x20;  - V3 step test (raw step large, harmonized within CI, Pettitt p > 0.05).

&#x20;  - V4 drift.

&#x20;  - V9 famous seasons rank top-3.

9\. \*\*Stats:\*\*

&#x20;  - Baseline 2003–2022.

&#x20;  - Ratio to median, Weibull percentile (range over bootstrap), return period (no extrapolation), rank.

&#x20;  - Low-activity guard (median < 5 \& X < 10).

&#x20;  - Month-to-date vs same-day baseline.

&#x20;  - Similar years = top-3 Pearson correlation of the YTD monthly curve.

10\. \*\*Fallback ladder:\*\* per-region single ratio → within-era percentiles only. Never fake numbers.



\### 7.1 AI design (`api/ask.ts`)

\- \*\*Tools:\*\*

&#x20; - `list\_regions()`

&#x20; - `get\_month(region,y,m)`

&#x20; - `get\_season(region)`

&#x20; - `get\_rankings(region, by:'year'|'month')`

&#x20; - `get\_similar\_years(region,y)`

&#x20; - `get\_quality(region)`

\- \*\*System prompt rules:\*\*

&#x20; - Use ONLY numbers returned by tools in this conversation.

&#x20; - ≤4 sentences (Responder) or ≤8 (Scientist).

&#x20; - Always end with one caveat (provisional / low activity / MODIS-equivalent units).

&#x20; - Never forecast; similar years are "analogues".

&#x20; - If data is missing, say so and list available regions.

\- The response JSON includes `trace: \[{tool, args, result\_summary}]` → rendered as "Numbers used".

\- \*\*Demo safety:\*\* precomputed answers for the 4 chips × 6 regions in `web/public/data/v1/ask\_cache.json`; used if the API errors or rate-limits.

\- \*\*Disclosure:\*\* state on the project page which AI tools were used (in-app Gemini + any AI coding assistants).



\---



\## 8. THE 7-DAY SCHEDULE



\*\*Roles.\*\* If solo, one person takes everything in priority order.

\- \*\*D:\*\* data/science (pipeline, calibration, validation)

\- \*\*F:\*\* frontend (app shell, map, pages, state)

\- \*\*V:\*\* viz + design (rings, grid, globe, design system, motion)

\- \*\*A:\*\* AI + API + story/pitch (ask function, copy, video, slides)



Daily rhythm: \*\*stand-up 10 min at start\*\*, \*\*integration + deploy at end of day\*\*, `git tag day-N`.



\### MON 9 Nov (tonight, 18:00–00:00): foundations

| Time | D | F | V | A |

|---|---|---|---|---|

| 18:00–19:00 | Earthdata + MAP\_KEY; data\_availability; \*\*request archive downloads\*\* (hero bboxes, then global) | Create repo + layout §6.2; Vite React TS + Tailwind + MapLibre; deploy hello page to Vercel | Fonts + `tokens.css`; colour scales in `lib/scales.ts` | Gemini key; Vercel function `/api/ask` hello-world with one fake tool |

| 19:00–21:00 | Download yearly country CSVs (6 countries); `02\_unify.py` on Madagascar | AppShell: top nav, routes for all pages, dark theme | \*\*FireRings.tsx on fake JSON\*\* (contract §6.3) | Write the data contract + tool schemas; fake region JSON generator for the frontend |

| 21:00–23:30 | `02\_unify.py` all regions; check codes and row counts | MapView + presets + rectangle draw | Ring hover, tooltip, keyboard | README / METHODS / DATA\_SOURCES skeletons; reference list |

| 23:30 | \*\*Gate M1:\*\* deployed shell; rings on fake data; unified Parquet for ≥2 regions | | | |



\### TUE 10 Nov: data to raw calendar

| Block | D | F | V | A |

|---|---|---|---|---|

| Morning (if free) / 17:00–19:00 | `03\_mask.py` + spot-check | Region page layout (rail / centre / insight) | GridCalendar.tsx + Legend + patterns | Tool functions reading the region JSON (`tools.ts`) |

| 19:00–22:00 | `04\_cube.py`: H3 r6 daily → monthly per stream; coverage table | PlaceSearch (Nominatim, 1 req/s) + lat/lon box + polygon draw | SeamSlider morph (raw ↔ harmonized scales) | Gemini function calling end-to-end on fake JSON; trace UI (AnswerCard) |

| 22:00–23:30 | Export \*\*raw\*\* JSON for all hero regions | Wire real JSON → rings + grid | Polish rings: transition rings, month labels, centre sparkline | Story mode copy draft (Madagascar) |

| 23:30 | \*\*Gate M2:\*\* real raw Punjab and Madagascar calendars live on Vercel; the 2012 jump visible | | | |



\### WED 11 Nov: harmonization (the scientific heart)

| Block | D | F | V | A |

|---|---|---|---|---|

| 17:00–20:00 | `05\_calibrate.py` (k, shrinkage, τ by LOYO, q, k'); bootstrap | Headline + KPI cards + Gauge wiring | Gauge.tsx (percentile + uncertainty arc) | `07\_stats.py` with D: baselines, percentile, return period, guard, MTD, similar years |

| 20:00–22:30 | `06\_validate.py`: V1, V3, V4, V9 → validation JSON | MonthDrawer (daily bars + band + mini map) | SeasonalityChart + AnnualBars | AI system prompt + Responder/Scientist voices |

| 22:30–23:30 | `08\_export.py` v1 harmonized JSON + CSVs | CSV + PNG export | Uncertainty hatching, provisional styles | Test 30 questions against the AI; log failures |

| 23:30 | \*\*Gate M3 (go/no-go):\*\* harmonized calendars + V1/V3 numbers. If validation is bad → fallback ladder tonight, not Saturday | | | |



\### THU 12 Nov: the complete product

| Block | D | F | V | A |

|---|---|---|---|---|

| 17:00–19:30 | Country presets (all downloaded countries) with pooled-k shrinkage; QA famous seasons | Proof page: before/after, drift, validation cards, k chart, limitations | Proof page charts (D3) | Data page: downloads, dictionary, API docs, citation, licence |

| 19:30–22:00 | \*\*Decide S1 (global):\*\* if the global archives arrived and `09\_global\_cube.py` runs < 2 h → go; else drop | AskDrawer integrated across pages; chips; caching | SensorTimeline; Compare page small multiples | `ask\_cache.json` generation; 30-s video storyboard v2 |

| 22:00–23:30 | Global H3 r3 monthly for the globe (if go) | Banners, empty/error states | Mobile layout pass | Pitch script v1 with real numbers |

| 23:30 | \*\*Gate M4: FEATURE-COMPLETE CORE\*\* (C1–C10 working on Vercel) | | | |



\### FRI 13 Nov: wow day

| Block | D | F | V | A |

|---|---|---|---|---|

| 17:00–18:00 | \*\*All: read the 2026 Project Submission Guide + Judging \& Awards Guide (released 13 Nov).\*\* Adjust anything (video length, slide limit, fields) | | | |

| 18:00–21:00 | NRT fetch for the live November (`01\_fetch\_nrt.py`); MCD64A1 cross-check if time (S2) | Story mode page (scrollama) | \*\*GlobeTimelapse\*\* (H3 hexes, scrubber, play, auto-rotate) | Story steps animation hooks with V; slides v1 |

| 21:00–23:30 | Re-run full pipeline clean from raw (reproducibility check) | Performance: lazy-load map, code-split pages, preload hero JSON | Motion polish: ring draw-in, count-ups, reduced-motion | Record a rough demo walkthrough; collect feedback from 2 friends |

| 23:30 | \*\*Gate M5: ALL WOW FEATURES IN.\*\* `git tag v0.9`. Sleep ≥ 7 h tonight | | | |



\### SAT 14 Nov: hackathon day 1 (09:00): polish, test, content

| Time | Do |

|---|---|

| 08:30–09:00 | Arrive, set up, Wi-Fi, second screen |

| 09:00–09:30 | Create/confirm the Space Apps project page; all members on the team at the Port Louis event |

| 09:30–11:00 | \*\*Fresh NRT pull\*\* (live November) + re-export; verify "provisional" labelling |

| 11:00–13:00 | \*\*Bug bash:\*\* each member tests a different flow on a phone, a laptop and a slow connection. Fix list on a shared board |

| 13:00–14:00 | Lunch + \*\*user test with 3 people at the venue\*\* (a mentor, a non-tech person, a judge-type). Watch them; don't help. Note confusion |

| 14:00–18:00 | Fix the top 10 issues from testing. Accessibility pass: keyboard through everything, aria labels, table views, contrast check, colourblind simulator |

| 18:00–21:00 | \*\*Presentation build:\*\* 30-s video recording + edit (§9.3), 7 slides, project page text |

| 21:00–23:00 | Rehearse the 3-min pitch ×3 with a timer; Q\&A drill; record a backup demo video |

| 23:00 | Sleep |



\### SUN 15 Nov: final day

| Time | Do |

|---|---|

| 08:00–10:00 | Last NRT refresh; final fixes (P0 bugs only) |

| \*\*10:00\*\* | \*\*CODE FREEZE.\*\* `git tag v1.0`. Re-deploy. Screen-record the full demo |

| 10:00–12:00 | Finalise README (screenshots, GIF of the seam slider), METHODS.md, citations, licence. Project page complete |

| 12:00–14:00 | Rehearse ×3 more; prepare the demo laptop (tabs pre-opened, cache warm, offline fallback on desktop) |

| \*\*14:00\*\* | \*\*SUBMIT\*\* (official deadline 23:59 local, but local judging is likely earlier; confirm the time) |

| After | Pitch. Breathe. |



\*\*Hard rules:\*\* no new features after Friday 23:30 · deploy every night · never demo from localhost · cite everything.



\---



\## 9. PRESENTATION KIT



\### 9.1 Local pitch: 3:00 demo choreography

| Time | Click / screen | Say |

|---|---|---|

| 0:00–0:20 | Landing globe playing 2001→2026 | "This is every fire satellites have seen since 2001. But there's a problem hiding in it." |

| 0:20–0:35 | Sensor timeline | "MODIS, our 25-year fire record, is switching off. Suomi-NPP stopped \*this month\*. The new satellites see fire so differently that history breaks." |

| 0:35–0:55 | Punjab rings, slider at RAW | "Join them naively and Punjab's burning explodes in 2012. It didn't. The camera changed." |

| 0:55–1:15 | Drag the slider to HARMONIZED → Proof page numbers | "We convert the new satellite into old-satellite units, calibrated only on 2012–2019. Out of sample, error is X%. The jump is gone." |

| 1:15–1:30 | Drift chart | "Why stop at 2019? MODIS's orbit drifted after 2020. Here's the evidence." |

| 1:30–2:05 | Live November headline → Ask "Is this November unusual?" → open "Numbers used" | "A responder asks in plain English. Every number comes from our data, and you can see which. 2.1× a typical November, 93rd percentile." |

| 2:05–2:30 | Madagascar story step 3 → Mauritius guard | "Our neighbour Madagascar burns like clockwork. You see the rhythm and the years that broke it. For small islands it says honestly when there's too little fire to judge." |

| 2:30–2:50 | Data page | "And we give the data back: the harmonized record is open, versioned and citable for anyone to build on." |

| 2:50–3:00 | Close on rings | "One honest fire record that outlasts both satellites. Fire Rings." |



\### 9.2 Seven slides

1\. \*\*Title:\*\* Fire Rings · tagline · team · URL + QR.

2\. \*\*Problem:\*\* raw rings with the 2012 jump + "MODIS ending · S-NPP ended Nov 2026 · orbit drift".

3\. \*\*Method:\*\* cell-days on H3 → monthly ratio (2012–2019) → shrinkage → bootstrap (one diagram).

4\. \*\*Proof:\*\* before/after + drift + 3 validation numbers.

5\. \*\*Product:\*\* 4 screenshots (globe, rings, gauge+AI, data page).

6\. \*\*Who it helps:\*\* responder flow (5 seconds to answer) · land manager · scientist · Indian Ocean region.

7\. \*\*Limits + open data + links:\*\* 3 limitations with mitigations · dataset · repo · licence.



\### 9.3 30-second video (shot list)

| Sec | Shot | On-screen text |

|---|---|---|

| 0–4 | Globe time-lapse | "25 years of satellite fire data…" |

| 4–9 | Punjab rings RAW, glowing 2012 jump | "…breaks in 2012. The satellites changed, not the fires." |

| 9–14 | Seam slider drag → calm rings | "Fire Rings harmonizes MODIS + VIIRS into one record." |

| 14–21 | Region dashboard → headline → AI answer with trace | "Is this season normal? Ask, and get real numbers." |

| 21–26 | Proof drift chart → Data page | "Validated. Open. Citable." |

| 26–30 | Logo + URL | "Fire Rings · NASA Space Apps 2026 · Port Louis" |

\- Export 1080p, English subtitles burned in, royalty-free or no music (copyright rules), team names only if allowed by the guide.



\### 9.4 Project page text template

\- \*\*Summary (≤150 words):\*\* problem → solution → who it helps → open data.

\- \*\*How it works:\*\* 5 bullets (data, harmonization, calendar, AI, open dataset).

\- \*\*NASA data used:\*\* FIRMS MODIS C6.1 (MCD14), VIIRS S-NPP / NOAA-20 / NOAA-21 375 m, (MCD64A1).

\- \*\*Tools:\*\* list libraries + Gemini.

\- \*\*AI use disclosure.\*\*

\- \*\*References\*\* (§11) and \*\*licence\*\*.



\### 9.5 Judge Q\&A (short answers)

\- \*\*Why not regression?\*\* Counts are zero-heavy and skewed; intercepts invent fire. A ratio of sums is the standard estimator for proportional counts, validated out of sample.

\- \*\*Why scale VIIRS down?\*\* We can't invent fires MODIS never saw in 2003. MODIS-equivalent is the only unit valid for 25 years; raw VIIRS is still shown for 2012+.

\- \*\*Orbit drift?\*\* Terra from 2020, Aqua from Dec 2021. The ratio chart shows the break, so calibration uses 2012–2019 only.

\- \*\*After MODIS ends?\*\* The record has been VIIRS-based since 2012 and is linked to NOAA-20/21.

\- \*\*Isn't this GFW/GWIS?\*\* GFW is VIIRS-only from 2012; GWIS uses admin units with a MODIS anomaly; CAMS is emissions. Ours is a 25-year, one-unit, uncertainty-aware calendar for any area, plus an open dataset.

\- \*\*Can the AI hallucinate?\*\* It can only state tool-returned numbers; the trace proves it.

\- \*\*Gas flares?\*\* Type flags + persistence/seasonality mask, both sensors.

\- \*\*Low-fire areas?\*\* Guard + hatching; no "+400%".



\---



\## 10. QUALITY BAR ("10/10" checklist; all must be ✅ by Saturday 18:00)

\- \[ ] Every brief item is visible in the demo (§3 + brief map)

\- \[ ] V1 and V3 numbers are real and shown in the app

\- \[ ] No number appears without a unit, source badge and (where relevant) CI

\- \[ ] Rings + grid usable by keyboard; screen-reader labels; table view

\- \[ ] Passes a colourblind simulator (deuteranopia/protanopia) and 4.5:1 text contrast

\- \[ ] Loads hero region < 2 s on 4G; works at 360 px width

\- \[ ] AI answers 30 test questions without inventing a number

\- \[ ] CSV opens cleanly in Excel with a header comment (region, dates, version, citation)

\- \[ ] Deployed URL + backup recording + offline fallback JSON

\- \[ ] README with GIF, METHODS.md, DATA\_SOURCES.md, CITATION.cff, LICENSE

\- \[ ] Submission meets the 2026 guide limits (video/slides)



\## 11. Risks

| Risk | Protection |

|---|---|

| Archive emails slow | Country yearly CSVs first; bbox requests; API for small boxes |

| Global data too big | S1 is a stretch with a Thursday gate; hero regions + countries are enough |

| Validation weak | Fallback ladder; show residuals honestly (that still scores on Science) |

| Globe performance | H3 r3 only, \~monthly frames preloaded as compact arrays; 2D map fallback |

| AI rate limits | Cache + chips; app fully works without AI |

| Over-scope | Gates every night; freeze Friday 23:30 for features, Sunday 10:00 for code |

| Burnout | Sleep ≥ 6 h every night, ≥ 7 h Friday |



\## 12. References

\- Space Apps terms: https://spaceappschallenge.org/legal · Submission guide: https://www.spaceappschallenge.org/resources/project-submission-guide/ · Judging guide: https://www.spaceappschallenge.org/resources/judging-awards-guide/

\- 2025 winners: https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/

\- FIRMS FAQ: https://www.earthdata.nasa.gov/data/tools/firms/faq · API: https://firms.modaps.eosdis.nasa.gov/api/area/ · Download: https://firms.modaps.eosdis.nasa.gov/download/

\- MODIS C6/C6.1 Fire User Guide: https://earthdata.nasa.gov/s3fs-public/2023-09/MODIS\_C6\_C6.1\_Fire\_User\_Guide\_1.0.pdf

\- VIIRS VNP14 User Guide: https://lpdaac.usgs.gov/documents/427/VNP14\_User\_Guide\_V1.pdf

\- Giglio 2016: https://www.earthdata.nasa.gov/s3fs-public/imported/Giglio2016\_C6\_Fire.pdf · Schroeder 2014: https://earthdata.nasa.gov/s3fs-public/imported/Schroeder\_et\_al\_2014b\_RSE.pdf

\- Csiszar 2012 slides: https://www.star.nesdis.noaa.gov/JPSS/documents/meetings/2012/AMS\_NewOrleans\_2012/Oral/2012\_AMS\_Csiszar\_Fire\_V1.pdf

\- CAMS MODIS drift / VIIRS in GFAS: https://atmosphere.copernicus.eu/drifting-away-modis-cams-global-fire-assimilation-system

\- Terra drift: https://terra.nasa.gov/about/terras-orbit-changes/terra-orbital-drift-information/a-message-from-the-project-scientist · Aqua: https://aqua.gsfc.nasa.gov/

\- Harmonized burned area (Boschetti et al.): https://modis.gsfc.nasa.gov/sci\_team/meetings/202204/presentations/session1/boschetti.pdf

\- MODIS–VIIRS FRP fusion 2026: https://www.mdpi.com/2072-4292/18/10/1650

\- GWIS: https://gwis.jrc.ec.europa.eu/applications · GFW: https://www.globalforestwatch.org/blog/fires/wildfire-trends-gfw-fire-data/

\- H3: https://h3geo.org/docs/core-library/restable/ · MapLibre globe: https://maplibre.org/maplibre-gl-js/docs/

\- Competitor repos (READMEs only): FireCal, FireLens, FireChronicle, Chronofire, pyfire-watch

