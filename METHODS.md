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
| Suomi-NPP VIIRS | VNP14IMG 375 m (SV-C2) | 2012-01-20 → 2026-11-02 (end of mission) |
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

**S-NPP end-of-life check (`tools/snpp_endcheck.py`, `docs/snpp_endcheck.md`).** S-NPP stopped delivering data in early
November 2026. We checked whether it degraded in its final months by comparing Aug–Oct 2026 MODIS-equivalent values from
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
- **k′** = S-NPP ÷ NOAA-20 (Apr 2018 – Jul 2026, both VIIRS on stable orbits) carries the record past the end of S-NPP.
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
- return period (n+1)/#{baseline ≥ x} for above-median months, never extrapolated beyond the record;
- rank among all years; **low-activity guard**: baseline median < 5 and value < 10 → "too little fire to judge";
- the current partial month is compared with the **same days** of baseline years (month to date);
- similar years = top-3 Pearson correlation of the year-to-date monthly curve (analogues, not forecasts).

## 9. Lat/lon boxes in the app

Drawing a box inside a hero region sums the region's H3 res-6 cell-days inside the box and applies the same ratios and
coverage factors. Boxes have no bootstrap interval or percentiles (stated in the UI).

## 10. Limitations

MODIS drift and end of life; MODIS-equivalent units hide small fires that only VIIRS sees; ratios vary with fire type
and season; pre-July-2002 months rely on Terra × q; Aug–Nov 2026 are provisional NRT without FIRMS static flags;
low-fire regions are noisy. Each is mitigated as described on the app's Proof page.

## 11. Reproducibility

`python pipeline/run_all.py` rebuilds everything from the raw CSVs (about 1 minute on a laptop) and then runs the test
suite (`pytest pipeline/tests`). Random seeds are fixed in `pipeline/config.yaml`.
