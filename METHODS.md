# Fire Rings — Methods

How Fire Rings turns two generations of satellite fire detections into one consistent monthly record.
Code: `pipeline/` (run everything with `python pipeline/run_all.py`). Generated evidence: `docs/data_inventory.md`,
`docs/pipeline_report.md`, `docs/mask_check.md`, `docs/validation_report.md`.

## 1. Data

NASA FIRMS active-fire detections, Archive Download (standard "SP" files) plus near-real-time ("NRT") files, delivered
2026-11-09, covering 2000-11-01 → 2026-11-08:

| Stream | Product | Period used |
|---|---|---|
| Terra MODIS | MCD14 C6.1 (M-C61) | 2000-11 → |
| Aqua MODIS | MCD14 C6.1 (M-C61) | 2002-07 → |
| Suomi-NPP VIIRS | VNP14IMG 375 m (SV-C2) | 2012-01-20 → 2026-11-02 (data delivery ceased 2 Nov 2026; NOAA NESDIS, NASA Earthdata — see DATA_SOURCES.md) |
| NOAA-20 VIIRS | VJ114IMG 375 m (J1V-C2) | 2018-04 → |
| NOAA-21 VIIRS | VJ214IMG 375 m (J2V-C2) | 2023-03 → (cross-check only) |

Regions: Punjab–Haryana (box 73.8–77.6 E, 27.6–32.6 N), Madagascar (country file), SE Australia (box 140.9–153.7 E,
39.2–28.1 S), Mauritius (country file — includes Rodrigues, excludes Réunion).

Data quirks found during inventory (details in `docs/data_inventory.md`):
- NRT files have **no `type` column** (no FIRMS static-source flag).
- Archive and NRT never overlap in date (VIIRS archive ends 2026-07-31, MODIS 2026-08-31).
- The MODIS archive's processing label changes **6.03 → 61.03 on 2023-01-01** (same C6.1 product, same columns and confidence scale).
- S-NPP's `instrument` field reads "SNPP", so streams are derived from `satellite`, never `instrument`.

**Live near-real-time pull (`01_fetch_nrt.py`).** NOAA-20 and NOAA-21 NRT detections for the Punjab box are pulled from
the FIRMS Area API (last 60 days). The API returns a plain bounding box, whereas the archive download is clipped to the
country (India), so API rows are kept only inside the region's historical footprint (H3 res-7 cells, ~5 km², that have
detections in the downloaded files); this removed 4,869 of 13,713 rows (Pakistani Punjab). Exact duplicates of rows already
in the downloaded NRT files are removed, and Punjab's record is extended to the last fetched day (per-region `data_end`).

**S-NPP end-of-life check (`tools/snpp_endcheck.py`, `docs/snpp_endcheck.md`).** S-NPP data delivery to users ceased on
2 Nov 2026 (NOAA NESDIS notice; NASA Earthdata transition page). We checked whether it degraded in its final months by comparing Aug–Oct 2026 MODIS-equivalent values from
S-NPP (k·S-NPP), NOAA-20 (k·k′·N20) and NOAA-21 (k·k″·N21). In October 2026 they agree within about ±11 % in Punjab
(392 / 438 / 368 fire-days) and ±4 % in Madagascar, so S-NPP is kept as the source through October 2026 and NOAA-20 takes
over from November 2026 as planned.

## 2. Unify (`02_unify.py`)

One schema for all files: `lat, lon, t_utc, solar_date, stream, conf, frp, daynight, type, product, region, h3r9, h3r6`.
- `solar_date` = date of (UTC + longitude/15 h), so a night-time pass is assigned to the local day.
- `conf`: MODIS 0–29 → L, 30–79 → N, 80–100 → H; VIIRS l/n/h → L/N/H.
- Unknown satellite codes, a satellite in the wrong sensor folder, or an unknown confidence value **stop the pipeline**.
- Duplicates: NRT rows on dates the archive already covers for that stream are dropped (archive preferred), then exact duplicates.

## 3. Filters and static-source masks (`03_mask.py`) — identical for MODIS and VIIRS

1. Drop low confidence.
2. Drop FIRMS `type` 1/2/3 (volcano, other static land source, offshore) — archive rows only.
   We checked whether FIRMS type 2 in Punjab follows the crop-burning season (which would mean real fires were being
   flagged): its Oct+Nov share is 0.77× (MODIS) and 0.32× (S-NPP) that of type-0 detections, so it does not, and it is dropped.
3. **Known-static mask**: every H3 res-9 cell (~0.1 km²) where the archive ever flagged type 2 or 3 (pooled across sensors)
   is masked for *all* rows, including NRT rows that carry no flag.
4. **Persistence mask**: H3 res-9 cells with ≥16 detection-days in each of ≥3 years *and* seasonality
   S = (max monthly share − 1/12)/(11/12) < 0.3 (pooled across sensors). This catches unflagged flares/kilns while sparing
   seasonal burning.

The largest masked cells are steelworks, refineries and industrial sites (checked on satellite imagery, `docs/mask_check.md`).

## 4. Fire cell-days and coverage (`04_cube.py`)

Unit: a **fire cell-day** = one H3 resolution-6 hexagon (average ~36 km²) with ≥1 kept detection on one solar day.
Counting presence, not pixels, removes most of the effect of VIIRS's finer pixels splitting one fire into many detections.
Monthly cell-days `C` are computed per stream (Terra, Aqua, MODIS = Terra ∪ Aqua, S-NPP, NOAA-20, NOAA-21).

**Coverage.** A stream is "operating" on a UTC day if it delivered ≥1 detection anywhere in any downloaded file
(continental areas always have some fire). Additionally, a **regional gap** is declared when a stream has 0 detections in
a region for ≥7 consecutive operating days while its sibling satellite (Terra↔Aqua, VIIRS↔VIIRS) saw a median ≥20
detections/day there and the local ratio predicts ≥100 detections (found once: Aqua over Madagascar, 17 Aug – 2 Sep 2020).
With D = days in the month and O = operating days: `C* = C·D/O` if O/D ≥ 0.6, otherwise the month is "insufficient coverage"
and no value is produced. MODIS uses O = mean(O_Terra, O_Aqua). Outages found include Terra 16 Jun – 3 Jul 2001,
Aqua 1–16 Apr 2022 and S-NPP 27 Jul – 10 Aug 2022 (unit tests in `pipeline/tests/test_coverage.py`).

## 5. Calibration (`05_calibrate.py`)

Per region and calendar month m, on overlap months where both streams have valid coverage:

```
k_m     = (ΣA_m + 0.5) / (ΣB_m + 0.5)            A = MODIS (Terra∪Aqua) cell-days, B = S-NPP cell-days
k_pool  = (ΣA + 0.5) / (ΣB + 0.5)
ln k*_m = w·ln k_m + (1 − w)·ln k_pool,   w = ΣB_m / (ΣB_m + τ)
```

- **Window: July 2012 – December 2019 only.** After 2020 Terra and (from Dec 2021) Aqua drift to different overpass
  times; fitting on those years would import the drift. The window end is asserted in code.
- τ ∈ {10, 30, 100, 300} is chosen by **leave-one-year-out** Poisson deviance of monthly predictions.
- A ratio of sums (not a regression) is used because counts are zero-heavy and skewed, and an intercept would invent fire.
- **q** = MODIS ÷ Terra (Jul 2002 – Dec 2019) bridges the months before Aqua.
- **k′** = S-NPP ÷ NOAA-20 (Apr 2018 – Jul 2026, both VIIRS on stable orbits) carries the record past 2 Nov 2026, when S-NPP data delivery ceased.
- **Fallback 1** ("pooled"): one region-wide ratio for all months. It is computed for every region and used only where
  it validates better than the monthly method (see §7).

Harmonized record H (MODIS-equivalent fire-days):

| Months | H |
|---|---|
| 2001-01 – 2002-06 | q_m · Terra |
| 2002-07 – 2011-12 | MODIS (Terra ∪ Aqua) |
| 2012-01 – 2026-10 | k*_m · S-NPP |
| 2026-11 → | k*_m · k′_m · NOAA-20 |

VIIRS is scaled **down** to MODIS-equivalent; MODIS is never scaled up (detail that MODIS could not see in 2003 cannot be invented).

**Method per region (v1; same text in the app's Provenance and on Proof):**

| Region | Method | Rates |
|---|---|---|
| Punjab–Haryana | monthly rates with shrinkage (τ = 10) | 0.14–0.40 most months; region-wide 0.347; August 1.20 rests on few fires (low reliability) |
| Madagascar | monthly rates with shrinkage (τ = 300) | 0.12–0.29; region-wide 0.262 |
| SE Australia | one region-wide rate (fallback 1) | 0.41 for every month — monthly rates failed the 2012 step test narrowly, the single rate passed both tests |
| Mauritius | monthly rates with shrinkage (τ = 30) | all months rest on few fires (low-activity region) |

**Low-reliability months.** A monthly rate based on fewer than 200 S-NPP fire-days in the window is labelled
"few fires — low reliability". Punjab's August rate is above 1 (MODIS saw more than VIIRS), which is physically unusual.
Checked: only 4–23 fire-days a year per sensor in the monsoon month (126 MODIS vs 92 S-NPP cell-days over 2012–2019), the
MODIS detections are scattered single cells with no repeat location (not a missed static source), and 47 of 107 S-NPP
detections are at night. This is small-sample noise; August holds 0.13 % of Punjab's harmonized fire-days, so it changes
no season, ranking or validation result. The method is unchanged.

## 6. Uncertainty

Year-block bootstrap ×500: calibration years are resampled with replacement and all ratios refitted; each month's base
count gets a Poisson draw. The interval is the 5th–95th percentile of the draws. A month is "uncertain" (hatched) when
(P95 − P5)/max(H, 1) > 0.5. Annual intervals are percentiles of the summed draws.

## 7. Validation (`06_validate.py`, `docs/validation_report.md`)

- **V1** leave-one-year-out annual error over 2012–2019 (target |bias| < 10 %, MAPE < 20 % in active regions).
- **V3** step test: step = mean(2012–19)/mean(2003–11) − 1 for the raw concatenation, the harmonized series and MODIS alone.
  Harmonized 2012–2019 values use leave-one-year-out ratios (out of sample). Pass = Pettitt p > 0.05 on the harmonized
  series and the MODIS-only step inside the harmonized step's 90 % bootstrap interval.
- **V4** yearly MODIS ÷ S-NPP ratio 2012–2025 (orbit drift), also Terra and Aqua separately.
- **V9** famous seasons: Black Summer (Jul 2019 – Jun 2020) must rank top 3 in SE Australia (it ranks #1).
- Method choice: monthly ratios unless they fail V1 or V3 *and* the single ratio validates better (SE Australia, v1).
  Regions whose median baseline month is below 5 MODIS cell-days (Mauritius) are reported but not judged.

## 8. "Is this normal?" (`07_stats.py`)

Baseline 2003–2022, same calendar month:
- ratio to the baseline median; Weibull percentile 100·#{baseline ≤ x}/(n+1), reported as a range over the bootstrap draws;
- return period = 100 / (100 − p), taken from the **same** percentile range that is shown next to it (middle of the
  range → headline value, ends → range), for above-median months; never extrapolated — a month above every baseline year
  is labelled "beyond the 2003–2022 record" with no number. (Fixed 10 Nov 2026: the old formula (n+1)/#{baseline ≥ x}
  used the point value and a different rank, and could show "1-in-4" next to a 66th–71st percentile; it now reads
  "about 1-in-3". Only return periods changed; no harmonized value changed.)
- rank among all years; **low-activity guard**: baseline median < 5 and value < 10 → "too little fire to judge";
- the current partial month is compared with the **same days** of baseline years (month to date);
- similar years = top-3 Pearson correlation of the year-to-date monthly curve (analogues, not forecasts).
- **Terra-only months (2001-01 – 2002-06, Terra × q)** are shown, hatched and labelled "Terra only — wider uncertainty",
  but are excluded from rankings, return periods, Jul–Jun season ranks (V9), annual "worst year" rankings and similar-year
  analogues. (Before this rule, 2001–02 ranked #1 in Madagascar; the top three are now 2016–17, 2019–20, 2007–08.)

## 8b. Detection-time check: Punjab's late-afternoon burning (`tools/punjab_timing.py`, `docs/punjab_timing.md`)

Polar orbiters only see fires burning at overpass time (~13:30 for VIIRS and, originally, Aqua). Independent reports say
Punjab/Haryana stubble burning moved to the late afternoon in recent years:
[NASA Earth Observatory, "New Timing for Stubble Burning in India" (H. Jethva)](https://science.nasa.gov/earth/earth-observatory/new-timing-for-stubble-burning-in-india/);
[ISRO Space Applications Centre, Current Science, Nov 2025 (ThePrint report)](https://theprint.in/environment/are-farm-fires-going-uncounted-isro-study-suggests-farmers-have-figured-out-a-way-to-evade-satellites/2797583);
[iFOREST Stubble Burning Status Report 2025 (The Tribune report)](https://www.tribuneindia.com/news/delhi/satellites-miss-majority-of-stubble-fires-delhi-air-pollution-underestimated-report). Aqua's overpass has drifted
later since Dec 2021, so if fires are lit later, Aqua should now see relatively more of them than VIIRS. We computed daytime
Aqua ÷ S-NPP cell-day ratios per season (same days only, up to S-NPP's last day), relative to 2013–2019:

| season | Aqua ÷ S-NPP, 2022–26 vs 2013–19 | Aqua ÷ NOAA-20 (vs 2018–19) |
|---|---:|---:|
| Punjab Oct–Nov (rice residue) | ×1.46 (2022 ×1.05 → 2025 ×1.83 → 2026 ×2.02) | ×1.34 |
| Punjab Apr–May (wheat residue) | ×0.95 | ×0.90 |
| Madagascar Sep–Oct | ×1.02 | ×1.06 |
| SE Australia Oct–Dec | ×0.86 | ×0.71 |

The rise is specific to Punjab's autumn season; VIIRS night detections there also rose ×6.2 and morning Terra fell ×0.35.
This supports late-afternoon burning that the 13:30 overpasses increasingly miss. The 2025–26 ratios rest on few fires.
**Harmonized values are not adjusted** (burning between overpasses cannot be measured); Punjab Oct–Nov months from 2022
carry the caveat "Detected at satellite overpass times; burning has reportedly shifted to late afternoon, so recent seasons
may be undercounted" in the app, the AI tools and the Proof page.
They also carry the machine-readable flag value **`overpass_timing`** in the `flags` column of the open CSV/Parquet
(`dataset/harmonized_monthly_regions_v1.*`), the calendar CSV export, `regions/punjab.json` → `months[].flags` and
`api/series/punjab.json` → `flags` (Round 6). It is a flag only: no number changes because of it. Rule: region `punjab`,
months October and November, years 2022 onward (Aqua's overpass drift after Dec 2021 shifts the detection time).

## 8c. Live layer (`web/api/live.ts`) — separate from the record

For each region the server fetches the last 3 days of `VIIRS_NOAA20_NRT` and `VIIRS_NOAA21_NRT` from the FIRMS Area API
(region bounding box, 10 s timeout, cached 45 min in memory and at the CDN). It applies the record's filters: low-confidence
detections dropped; detections in known-static H3 r9 cells (from `03_mask.py`) dropped; detections outside the region's
historical footprint dropped (H3 res-7 for Punjab, so Pakistani Punjab inside the box is excluded; res-6 elsewhere). The
footprint and static cells ship as `web/public/data/v1/live/{region}.json`. Results are shown as a "LIVE" badge and a
provisional map layer only; they never enter the harmonized values, statistics or rankings.

**Map geography.** Globe markers sit at the median position of a region's detections (on the main landmass — e.g. the main
island of Mauritius rather than the ocean between it and Rodrigues). Country-file regions open on the 1.5–98.5 percentile box
of their detections; detections more than one view-width away form an inset (Rodrigues). Regions whose view is under
10,000 km² (Mauritius) publish every detection as map points; larger regions show points for the latest months from zoom 9.

## 8d. Two views of the same data: Long-term vs High detail (`07b_detail.py`, QA #44)

To compare 25 years fairly you must match the old camera's sharpness; to see today in full detail you use the new
camera as it is. The app therefore has two modes (URL `?mode=detail`, remembered per browser):

- **Long-term (2001–now, default)** — the harmonized record `H` above: VIIRS scaled *down* to MODIS-equivalent with
  ratios fitted on Jul 2012 – Dec 2019 only; baseline 2003–2022. We never invent detail for old years.
- **High detail (2012–now)** — `V`, native VIIRS 375 m fire cell-days, **not** converted:
  `V = C*(S-NPP)` for 2012-01 … 2026-10 and `V = k′ · C*(NOAA-20)` from 2026-11 (the existing VIIRS↔VIIRS bridge, so the
  end of S-NPP makes no new seam). `C*` is the same coverage-adjusted cell-day count the harmonized record uses, so
  `H = k · V` on every VIIRS month (asserted in `07b_detail.py`, tested in `tests/test_detail.py`). No ratio is fitted,
  nothing touches 2020+ calibration. Interval = 5th–95th percentile of Poisson counting noise (no calibration
  uncertainty exists in this view). Baseline for "typical"/percentiles = **2013–2022** (10 full VIIRS years; Jan 2012
  lacks coverage) — shorter, so percentiles are coarser (max 91st with 10 years) and uncertainty is wider; the UI says so.
  Return periods, ranks, the low-activity guard and month-to-date (same days 1..D of 2013–2022, S-NPP daily cell-days)
  use the same code as §8.
- **Map**: Long-term = H3 res 6 (~36 km²); High detail = H3 res 7 (~5 km²) native VIIRS cell-days, primary VIIRS stream
  per month (`web/public/data/v1/hexes7/`). Res 8 was not exported (≈7× larger files).
- **"What the new satellite adds"** = Σ V ÷ Σ H over 2013–2022 months with both values (Punjab 2.9×, Madagascar 3.8×,
  SE Australia 2.4×, Mauritius 4.6× in this run) — computed in the pipeline, never typed.
- Native ≥ MODIS-equivalent holds wherever k ≤ 1. Where a monthly k > 1 (Punjab August, 1.20 — flagged low-reliability,
  §5) the native value is below the MODIS-equivalent one; that is the small-sample k, not a data error.
- CSV exports always carry both columns (`fire_days_modis_eq`, `fire_days_viirs_native`); the open dataset adds
  `V_native, V_lo, V_hi`. Never mix the two in one comparison.

## 8e. Fire Watch: alert rules and the raw-vs-harmonized backtest (`09_watch.py`, `web/api/watch.ts`)

**Rules decide, AI explains.** Thresholds live in one place, `pipeline/config.yaml → watch`, and are published in
`/data/v1/watch.json`. The month rules use the published percentile *range* (bootstrap P5–P95 of the Weibull percentile vs
2003–2022, §8), so an alarm needs the whole range past the threshold:

| Status | Rule |
|---|---|
| Alert | the month is above every baseline year: percentile low end ≥ 95 (the top possible with 20 years) or beyond record |
| Watch | far above normal: percentile low end ≥ 90 (above P90); or live 72 h detections ≥ 3 × expected (live never raises an Alert) |
| Unusually low | far below normal: percentile high end ≤ 10 (below P10) |
| Normal | otherwise — and **always** when the low-activity guard applies (baseline median < 5 and value < 10) |

Checked: the month to date (vs the same days of baseline years) and the last full month; region status = the most severe check.
Live rule (`/api/watch`): expected 72 h detections = median S-NPP monthly detections for the calendar month over 2013–2022
× 3 / days in month × 2 (the live feed has two VIIRS satellites, NOAA-20 + NOAA-21). This is an approximation, so the live
rule can only raise Watch, and it is skipped when fewer than 20 detections are expected.

**Briefing agent.** For each flagged region, `/api/watch` asks Gemini with the Ask tools (function calling on the published
JSON) for a Responder briefing. The same server-side check as Ask applies: any number not in the tool results is rejected and
the briefing regenerated once; forecast wording ("will…", "expect…", "coming weeks") is rejected too. Otherwise the saved
briefing (`watch_cache.json`, made with `scripts/watch_cache.ts`, verified the same way) is shown as "⚡ saved briefing".
Each card adds a fixed "Relevant for:" line from config (Punjab Oct–Nov → air-quality and health agencies, etc.).

**Backtest ("why harmonization matters").** The same rules for every month 2012-01 … 2025-12, all regions, on (a) the raw
record (MODIS cell-days to 2011, unconverted VIIRS after) and (b) the harmonized record, each against its own 2003–2022
same-month baseline, using the point percentile (identical method for both, so the comparison is fair). Result in this run:
raw → 99 "far above normal" alerts, 53 of them only because of the satellite switch (raw-only months); harmonized → 46.
Raw data also hides real drops: 5 "far below normal" months vs 33 on the harmonized record. Recounted independently in
`pipeline/tests/test_watch.py`.

Fire Watch is situational awareness for planning, not an emergency alert service, and never a forecast.

## 9a. Hotspots for any search (`web/api/hotspots.ts`, P1.2)

`GET /api/hotspots?region|bbox&start&end` fetches NASA FIRMS Area-API detections for up to 31 days and applies the
record's filters: low confidence dropped; FIRMS type 1/2/3 dropped (SP rows; NRT has no type); the known-static +
persistent H3 res-9 mask of the region (`live/{region}.json`); the region footprint; days by solar date (one extra UTC day
is fetched at each end). Sources per day: the standard archive (`*_SP`) where FIRMS has processed it, NRT after;
satellites "as in the record" (MODIS Terra+Aqua; VIIRS S-NPP to Oct 2026, NOAA-20 after) or `satellites=all`.
FIRMS answers at most **5 days per call** (checked 11 Nov 2026) and one call costs ~15 transactions of the key's
5,000 / 10 min, so results are cached (in memory per warm instance + CDN, 7 days for archive-only ranges) and limited per IP.
**Parity:** Punjab, 1–31 Oct 2016: 48,666 detections from the API vs 48,595 in the record (+0.15%; per stream
+0.14% to +0.31%), `docs/hotspots_parity.md`. Demo months (Punjab Oct 2016, SE Australia Dec 2019, Madagascar Sep 2019)
are static files written from the record by `08b_demo_hotspots.py`.

## 9b. "What to expect": projection backtest (`10_api.py` → `api/projection/{region}.json`, P1.7b)

For each region, calendar month m and checkpoint day d ∈ {5, 10, 15, 20, 25}, each baseline year t (2003–2022) is left
out in turn and, using only the other years O:
- so_far(y) = H(y, m) × (daily cell-days on days 1..d) ÷ (daily cell-days in the month) — H's own daily shape;
- projection = so_far(t) ÷ median_O so_far(y) × median_O H(y, m)  ("on current pace");
- typical = median_O H(y, m).
Error = |estimate − H(t, m)| ÷ max(H(t, m), 1); the headline is the median over years (MdAPE). The method with the smaller
MdAPE at the nearest checkpoint is the one the companion app shows. Range = projection × P10–P90 of H(t,m) ÷ projection.
Months whose typical value is under 5 fire-days (low-activity guard) are not tested. Over all regions the projection beats
"typical" in the counts given in `api/projection/*.json` (summarised live on the paper page). The current month's
same-days baseline matches the app's "this month so far" baseline (pytest). It is not a weather-based forecast.

## 9c. Insurance-style index (companion app 3, on `api/series/{region}.json`)

Illustrative only. For each series (harmonized H, and raw = MODIS cell-days to 2011, VIIRS cell-days from 2012) and
calendar month, the trigger level is the chosen percentile (linear interpolation) of that month's 2003–2022 values; a month
"pays out" when its value is above the level. 2003–2025 is shown. The raw series' baseline mixes MODIS and VIIRS years, so
post-2012 months trigger for the sensor change (counted as "raw-only payouts after 2012"). Slide 2 quotes the same count
for Punjab at the 90th percentile, recomputed from `api/series/punjab.json` in `web/src/lib/content.ts` (claims_check
recomputes it independently).

## 9d. NASA POWER weather (`tools/fetch_power.py` → `api/power/{region}.json`, P1.7c)

Monthly PRECTOTCORR (mm/day × days = mm per month) and T2M (°C) from the POWER monthly point API (2001–2025) and daily
point API (2026 complete months), community AG, averaged over the region's most fire-active H3 res-3 cells (up to 9
points: the parents of the fire footprint, ranked by footprint cells). The fact-check app compares the three months before
a season with their 2003–2022 median and states no causal link.

## 9e. Piton de la Fournaise ground-truth check (`tools/fetch_reunion.py`, `tools/reunion_series.py`, P1.7d)

Box 55.60–55.86 E, 21.36–21.14 S. FIRMS standard products MODIS_SP (2000-11 →) and VIIRS_SNPP_SP (2012-01-20 →),
low confidence dropped, FIRMS type kept (1 = presumed volcano), days by solar date. Eruption periods: Smithsonian Global
Volcanism Program, *Volcanoes of the World* Holocene eruptions for volcano 233020 (WFS service), each with its source
link. Because one Area-API call costs ~15 transactions, only the windows around each eruption (start − 35 days to
end + 5 days, fixed 5-day grid) are downloaded; other days are null, never zero. Per eruption: detected by each sensor,
first-detection lag, detections and detection-days (days with ≥1 detection — the record's presence logic, which puts
both sensors on one scale). Pre-eruption test: detections in the 30 days before each start, excluding days inside another
eruption (+3 days); reported whatever the result. Not an eruption forecast. Results: `docs/reunion_check.md`.

## 9f. Presentation rules (Round 4)

- **Units in Ask (#85).** Long-term answers are MODIS-equivalent fire-days; High detail answers are native VIIRS fire-days
  (High detail, 2012–now, baseline 2013–2022) and never say "MODIS-equivalent" (system prompt, caveats, tool units and a
  deterministic guard on the final text; saved answers exist for both modes).
- **Exchange-rate ranges (#82).** Ranges are taken over months with ≥ 200 calibration fire-days (`k.low_n_threshold`);
  months below that are named separately as low reliability, e.g. Punjab "0.14–0.40 (Aug 1.20 rests on few fires)".
- **Parity % (#81).** |API − record| ÷ record with 2 significant figures, one formatter for the Data page, paper and slides.
  No value is ever printed as "-0".
- **Provisional months (#81).** Named from the `provisional` month flags (currently Aug–Nov 2026), not typed by hand.
- **Missing years/seasons (#83).** A year or season without a value (e.g. Jan 2012, before S-NPP's first full month) keeps
  an empty hatched slot labelled "not enough satellite data (Jan 2012)"; axes never skip it.
- **Cards vs Fire Watch (#84).** Home cards compare with the usual (median) value; Fire Watch flags a month only when even
  the edge of the uncertainty range is outside P10–P90. When they differ the card says so.

## 9g. Round 5B regions from the FIRMS world archive (`tools/clip_world.py`)

- **Source.** The complete FIRMS WORLD archive (yearly CSVs per sensor, MODIS C6.1 2000-11 → 2026-11, VIIRS S-NPP
  2012-01-20 → 2026-11-02, NOAA-20 2018-04 → , NOAA-21 2023-03 → ; standard + NRT; 58 zips, 662 M rows) downloaded with
  the FIRMS archive tool. No FIRMS API calls were used for history.
- **Clip.** Stage 1 streams every CSV straight out of its zip with pyarrow (never unzipped, never loaded whole) and keeps
  rows inside a generous box per region. Stage 2 keeps points inside the Natural Earth 10m v5.1.2 polygon (even-odd ray
  casting, holes respected) and writes `data/raw/{region}/{sensor}/fire_{archive|nrt}_world.csv`, the same layout as the
  per-country downloads, so `02_unify.py` reads them unchanged. Check: the same Northeast-India polygon applied to the
  FIRMS India country download gives 431,376 MODIS points vs 431,434 from the world clip (0.013 % difference, border pixels).
- **Regions.** Northern Australia savanna = Northern Territory (admin-1); Northeast India = Assam, Meghalaya, Tripura,
  Mizoram, Manipur, Nagaland, Arunachal Pradesh (admin-1); Tanzania (admin-0, incl. Zanzibar); Sudan (admin-0).
  **Sudan uses today's border for all years**, so South Sudan's 2011 separation does not create an artificial drop.
- **Same pipeline.** Same filters, static mask, H3 res-6 cube, coverage rule, k fitted on Jul 2012 – Dec 2019 only,
  shrinkage, bootstrap and High detail. The world files run to 12 Nov 2026, but the record ends on the same day as the
  other regions (`record.data_end`), and months after the last standard-processing date are provisional exactly as before.
- **Validation gate** (`gate: true` in config, `lib.common.gate_passed`). A new region is published only if its method
  passes V1 (MAPE < 20 %, |bias| ≤ 10 %) and V3 (harmonized 2012 step consistent with MODIS-only, Pettitt p > 0.05). The
  pooled-ratio fallback is used only if it validates better. Results: Northern Territory, Northeast India and Tanzania
  pass (monthly ratios); **Sudan fails V3** (harmonized Pettitt p = 0.013, change year 2009; harmonized step −14.6 % vs
  MODIS-only −14.5 %; the pooled fallback also fails) and is not shown anywhere. Numbers: `docs/validation_report.md`.
- **Existing regions untouched.** Steps 02–05 were run only for the new regions; steps 06+ recompute everything from
  unchanged inputs and `test_longterm_unchanged.py` confirms the four original regions' Long-term values are identical.
- **Tanzania study check.** See `docs/sources.md`.

## 9h. Prediction model: fire likelihood for the scored month (`11_model.py`, `lib/model_data.py`)

- **Unit and data.** H3 res-6 cell × month for all validated regions together (region is a feature): 16,366,896 cell-months,
  built only from committed files (`hexes/{id}/*.json` primary-stream fire-days, published k / q / k′, NASA POWER), so the
  monthly job can rebuild them. Cell universe = hexagons with at least one detection in the record.
- **Target.** At least one VIIRS fire-day in month m+1 (High detail: S-NPP; NOAA-20 after S-NPP data ended). Target years 2013–2025.
- **Features (known at the end of month m).** Harmonized MODIS-equivalent history of the same calendar month, 2001 to the year
  before the target: share of years with at least one MODIS-equivalent fire-day and mean fire-days; the cell's value in m, m−1, m−2;
  mean of ring-1 / ring-2 neighbours in m and their climatology; target month; region; NASA POWER rain and 2 m temperature
  in month m minus the median of that calendar month in all EARLIER years (no future information). Months flagged
  "insufficient" are missing values.
- **Models.** Logistic regression (log1p + standardised, one-hot month/region) and sklearn HistGradientBoosting (two
  settings), chosen once by PR-AUC on training years only (train targets 2013–2016, validate 2017, before the first test
  year): `hgb_small` (validation PR-AUC {'logit': 0.6785, 'hgb': 0.7118, 'hgb_small': 0.7128}). Training rows are
  subsampled to 1.5 M per fit with a fixed seed; output is deterministic (seed 20261114, tested).
- **Baselines.** b1 climatology = the cell's harmonized share of past years with fire in that calendar month; b2 persistence
  = fire in the cell in month m.
- **Evaluation (test data only).** Primary rolling origin: for each test year 2018–2025, train on target years before it
  (asserted in code and tested). Secondary leave-one-region-out (2018–2025, region feature removed). Metrics: ROC-AUC, PR-AUC,
  precision/recall/F1 at the F1-maximising threshold of each fold's TRAINING data, Brier, and capture = share of the following month's
  fire cells inside the top 10 % (20 %) of cells ranked within each region and month (seeded random tie-break). 90 %
  intervals: test years resampled with replacement (300 times; AUCs on a fixed 4 % row sample per year).
- **Results (pooled rolling origin).** Model PR-AUC 0.7271 (90 % [0.7167, 0.7418]), ROC-AUC 0.9214,
  F1 0.668, top-10 % capture 30.5 % ([29.7, 31.2]), top-20 % 49.7 %.
  Climatology: PR-AUC 0.5899, capture 27.2 %. Persistence: PR-AUC 0.3258,
  capture 19.9 %. Model minus climatology (90 %): PR-AUC [0.1287, 0.1511],
  capture [3.0, 3.5] points. The model beats climatology in every region and in 7 of 7
  leave-one-region-out tests. Capture is bounded: when more than 10 % of a region's cells burn in a month, the top 10 %
  cannot hold them all.
- **Harmonization ablation (headline, reported as found).** Same model and folds with RAW history (MODIS up to 2011 mixed with
  unconverted VIIRS): PR-AUC 0.735, capture 30.9 %. Harmonized minus raw: -0.0079 PR-AUC,
  -0.4 points. Harmonization does NOT improve this ranking task: cells are ranked within one region and month,
  where a fixed exchange rate changes little, and raw VIIRS counts keep small-fire detail. Harmonization matters for
  comparing amounts across years (the record).
- **Publish gate.** Likelihood maps are published only if the model beats b1 on pooled rolling-origin PR-AUC AND top-10 %
  capture: **passed**. Outputs: `api/likelihood/{id}.json` (scored month = `target_month`, the month
  after the last full month: during November it scores November using data up to October), `api/model_card.json`, `api/model_history.json`.
- **Limitations.** Ranks the likelihood of at least one detection, not size, timing, damage or cause; a planning aid, not a
  warning service; the Punjab Oct–Nov overpass-timing caveat applies; 7 regions only.

## 9i. Automatic monthly retraining (`retrain.py`, `.github/workflows/retrain.yml`)

- Runs on the 2nd of each month (03:17 UTC) and on demand. Uses committed files + small FIRMS API calls (FIRMS_MAP_KEY
  GitHub secret, never echoed): VIIRS_NOAA20_NRT, 5-day chunks (the API's limit), month ±1 day for solar dates, about 49 calls
  per run, hard budget 110, cached and resume-safe.
- Same filters as the record (low confidence dropped; known-static H3 res-9 cells and region footprint from `live/{id}.json`).
  Fire-days per res-6 cell go to `pipeline/assets/model/recent/{id}.json`; the model reads them with the FROZEN published
  ratios. The Long-term record files are never touched (checksummed in the workflow; only model files may change).
- Champion = the published model; challenger = same features, recipe chosen on training years only. Head-to-head on the
  newest complete target months that NEITHER model trained on (up to 3), plus the challenger's rolling-origin backtest.
  The challenger is published only if it beats BOTH the champion and climatology on PR-AUC and top-10 % capture and passes
  the climatology gate; otherwise the champion stays and scores the new month. Every run is appended to `model_history.json`.
- Then pytest and claims_check; commit as Muru265 and push (Vercel deploys). Any failure: no commit. This is automatic
  retraining with a fixed test, not reinforcement learning. Local test: `python pipeline/retrain.py --dry-run`
  (12 Nov: holdout Aug–Oct 2026, champion PR-AUC 0.7625 vs challenger 0.7596, so the current model was kept).

## 9j. Daily data update (`daily.py`, `.github/workflows/daily.yml`) — Round 6

Three speeds, never mixed:

| What | How often | Writes | Never touches |
|---|---|---|---|
| **Historical record** (Long-term, every month before `daily.first_month` = 2026-11) | fixed; changes only with a documented re-run of the full pipeline | — | — (guarded by `test_longterm_unchanged.py`, which must stay green) |
| **This month so far** (current month; the previous month until it is complete) | **daily**, 04:40 UTC + on demand | current-month row, `latest`/`latest_complete`, this year's annual total, `daily/`, current-month hexes/globe, `watch.json`, `api/series`, `api/projection`, `meta.json` (`last_update`), the open CSV/Parquet rows of that month | historical months, the model |
| **Fire-likelihood model** | **monthly**, 2nd of the month (§9i) | `api/likelihood`, `api/model_card.json`, `api/model_history.json` | the record |

- Fetches this month's FIRMS NRT detections for every region box: VIIRS NOAA-20 (the record's stream from Nov 2026,
  H = k · k′ · NOAA-20) and MODIS (shown next to it); 5-day chunks, hard budget 260 calls, FIRMS_MAP_KEY from the
  repository secret (never printed). Solar date, low-confidence/type filters, known-static H3 res-9 mask and region
  footprint exactly as the record (`live/{id}.json`). Coverage adjustment as in `04_cube` (operating days proxy: ≥1
  detection in any region box that day).
- Uses the FROZEN published ratios and bootstrap draws (`pipeline/assets/daily/{id}.json`, written once by
  `daily.py --build-assets` from the full pipeline and checked against the published k, k′ and intervals) — no
  recalibration. "Is this normal?" for the month so far = the same days 1..D of the 2003–2022 baseline years (07_stats).
- Then `09_watch.py` (Fire Watch status) and `10_api.py`. The Fire Watch AI briefing is regenerated only for regions whose
  status changed (`watch_cache.ts --only …`); if Gemini fails, the previous saved briefing is kept.
- Commits only if something other than timestamps changed (`Daily data update YYYY-MM-DD`, author Muru265), after pytest
  (incl. the snapshot test) and a check that only current-month output paths changed. Daily and monthly jobs share one
  concurrency group, so they never run at the same time.
- Months after the S-NPP end are NOAA-20 based; a month becomes complete on the first run of the next month and stays
  "provisional" until NASA reprocesses it.



Drawing a box inside a hero region sums the region's H3 res-6 cell-days inside the box and applies the same ratios and
coverage factors. Boxes have no bootstrap interval or percentiles (stated in the UI).

## 10. Limitations

MODIS drift and end of life; fires burning between overpasses are missed (measured for Punjab, §8b); MODIS-equivalent
units hide small fires that only VIIRS sees; ratios vary with fire type and season; pre-July-2002 months rely on Terra × q
(not ranked); Aug–Nov 2026 are provisional NRT without FIRMS static flags;
low-fire regions are noisy. Each is mitigated as described on the app's Proof page.

## 11. Reproducibility

`python pipeline/run_all.py` rebuilds everything from the raw CSVs (about 1 minute on a laptop) and then runs the test
suite (`pytest pipeline/tests`). Random seeds are fixed in `pipeline/config.yaml`.
