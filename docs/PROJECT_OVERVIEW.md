# Fire Rings — project overview

*NASA Space Apps 2026 · challenge "Harmonization of MODIS and VIIRS Hot Spots" · Murugun Sharma Roma Rishi*
Live app: <https://fire-rings.vercel.app> · Example apps on the open API: <https://fire-rings-apps.vercel.app>

Every number below comes from the published pipeline outputs in `web/public/data/v1/` (validation, model card, Fire
Watch backtest), as of the data end 2026-11-12. If the data changes, the app changes with it; this file is a snapshot.

---

## 1. The problem

NASA has watched fires from space with two generations of instruments:

- **MODIS** on Terra (2000→) and Aqua (2002→): ~1 km pixels.
- **VIIRS** on S-NPP (2012→), NOAA-20 (2018→) and NOAA-21 (2023→): 375 m pixels.

VIIRS sees many more small fires. If you simply join the two records, fire seems to explode in 2012: **+199 %** in
Punjab–Haryana, **+294 %** in Madagascar, **+183 %** in Tanzania. Nothing happened on the ground — the camera changed.
Meanwhile MODIS is ageing: Terra's orbit started drifting in 2020 and Aqua's in December 2021, so the old record can't
simply be continued either. Anyone asking "is this fire season normal?" over 25 years gets a wrong answer.

## 2. What Fire Rings does

Fire Rings turns MODIS and VIIRS into **one consistent monthly record per region, 2001 → today**, in MODIS-equivalent
units, with uncertainty — and then makes it useful:

- **Fire Rings + calendar**: one ring per year, months like a clock; a seam slider shows raw vs harmonized.
- **"Is this month normal?"**: a plain headline and gauge (ratio to typical, percentile, rank, 1-in-N years).
- **Month drill-down, map with region presets and any lat/lon box, CSV/PNG export.**
- **Fire Watch**: fixed, published rules flag unusual months; an AI only explains them, with verified numbers.
- **Agent check** (Round 7): every flagged month is verified with three independent tools — detection times, NASA
  burned area, geostationary satellites — and fixed rules give a verdict (Real change / Detection issue likely /
  Unclear / Not checkable yet). The AI explains the stored verdict; it never decides it.
- **Ask Fire Rings**: an AI analyst (Gemini function calling) that may only use numbers returned by its tools; the
  server rejects any answer containing a number not found in those tools' results.
- **Fire-likelihood model**: which hexagons are more likely to burn in the scored month, retrained monthly.
- **Open data + open API**: CSV/Parquet, JSON per region, no key, CORS open.
- **Stories**: guided scrolls for Madagascar, Punjab–Haryana, SE Australia, Mauritius and Tanzania.

**9 regions**: Punjab–Haryana (India), Madagascar, SE Australia (NSW + Victoria), Mauritius (incl. Rodrigues, an honest
low-fire case), Northern Australia savanna (NT), Northeast India (7 states), Tanzania, Sudan and Mato Grosso (Brazil).
Sudan and Mato Grosso were first hidden by the publish gate and are published since Round 8 under **gate v1.2** (see §5).

## 3. Data used

| Source | What | Use |
|---|---|---|
| NASA FIRMS — MODIS Collection 6.1 (Terra + Aqua) | active-fire detections, archive + near-real-time | the reference scale, 2001 → 2011 record |
| NASA FIRMS — VIIRS 375 m S-NPP | detections, archive + NRT | the record 2012 → Oct 2026 (×k) |
| NASA FIRMS — VIIRS 375 m NOAA-20 | detections | the record from Nov 2026 (×k·k′), after S-NPP data delivery ceased on 2 Nov 2026 |
| NASA FIRMS — VIIRS 375 m NOAA-21 | detections | cross-check of recent months |
| NASA POWER | monthly rainfall and 2 m temperature per region | model features and context |

About **54 million** detections are kept after filtering across the 9 regions (sum of `quality.rows_kept`). All
sources and libraries are listed in `DATA_SOURCES.md`.

## 4. Method in 6 steps

1. **Read and unify** every FIRMS file (archive preferred over NRT where both exist); each detection gets its local
   *solar* date (UTC + longitude/15 h) so a fire day is a real day on the ground.
2. **Filter the same way for both sensors**: drop low confidence, drop FIRMS volcano/static/offshore types, and mask
   persistent industrial hot spots (steelworks, refineries) found from the data itself.
3. **Count fire-days**: one fire-day = one H3 resolution-6 hexagon (~36 km²) with at least one detection on one solar
   day. Counting places instead of dots is what makes old and new sensors comparable. Months with satellite outages are
   coverage-adjusted; under 60 % coverage the month gets no value.
4. **Calibrate** VIIRS *down* to MODIS (never MODIS up) with ratios k = MODIS ÷ VIIRS per region and calendar month,
   fitted **only on July 2012 – December 2019**, when both families flew stable orbits. Monthly ratios are shrunk toward
   one region-wide ratio; the amount of shrinkage is chosen by leave-one-year-out tests.
5. **Uncertainty**: 500 year-block bootstrap re-runs plus Poisson counting noise → a 90 % range on every month.
6. **Validate and judge**: out-of-sample error, the 2012 step test, drift check and famous seasons; then "is this
   normal?" against the 2003–2022 baseline, with a guard that says "too little fire to judge" in low-fire places.

## 5. Validation results (out of sample)

| Region | Annual error (leave-one-year-out) | Step at 2012: raw → harmonized (MODIS alone) |
|---|---:|---|
| Punjab–Haryana | 5.6 % | +199 % → +3.1 % (+4.2 %) |
| Madagascar | 2.8 % | +294 % → +2.9 % (+3.0 %) |
| SE Australia (single ratio) | 9.2 % | +168 % → +9.2 % (+10.2 %) |
| Mauritius (low activity, reported not judged) | 24.4 % | +405 % → +11.1 % (+5.9 %) |
| Northern Australia savanna | 3.5 % | +75 % → −1.7 % (−0.9 %) |
| Northeast India | 5.6 % | +113 % → −17.9 % (−16.9 %) |
| Tanzania | 1.8 % | +183 % → −17.3 % (−17.1 %) |
| Sudan | 2.8 % | +123 % → −14.6 % (−14.5 %) |
| Mato Grosso, Brazil | 3.7 % | +4 % → −41.7 % (−42.0 %) |

- The goal (error under 20 %, bias within ±10 %) was **set by us before testing**; it is not an external standard. In
  every validated region the error is smaller than a normal year-to-year swing (about ±8 % to ±23 % depending on the region,
  2003–2022) and tiny next to the raw switch artefact.
- **Gate v1.2 (13 Nov 2026).** The 2012-step test V3 used to reject any change point in the harmonized series, even real
  fire history. Sudan (break 2009) and Mato Grosso (break 2007) were hidden for that reason, although MODIS alone shows
  the same break in the same year. v1.2 keeps the step test and accepts a break only if it lies outside 2011–2013 and
  MODIS alone shows it too. It was fixed before computing and checked on all 9 regions: no published region changed.
  Caveat: before 2012 the harmonized series is MODIS, so this is not an independent test of pre-2012 breaks.
- **Black Summer 2019–20** ranks **#1 of 23** fire seasons in SE Australia.
- **Tanzania study check**: Tarimo et al. (2015) reported fewer fires in Tanzania's miombo woodlands over the past
  decade; our harmonized record shows −20.9 % (2003–2011 vs 2016–2025) and MODIS alone −21.6 %, while the naive join
  would suggest an explosion. Different areas, so a consistency check, not a replication.
- **Why harmonization matters for alerts**: run the same Fire Watch rules on 2012–2025 (9 regions) and raw data raises
  **243** "far above normal" alerts, **128** of them caused only by the satellite switch; harmonized data raises **119**.
  Raw data also hides real drops: it flags **37** "far below normal" months, the harmonized record **125**.
- **Live API parity**: the hotspot API agrees with the record to 0.15 % (Punjab, October 2016: 48,666 vs 48,595).

## 6. The fire-likelihood model and how it retrains

- **What it does**: for every hexagon, a score for "at least one VIIRS fire-day" in the **scored month** — the month after
  the last complete month of data (during November it scores November using data up to October).
- **Inputs**: the hexagon's own fire history (harmonized), its neighbours, the season, and NASA POWER rain/temperature
  anomalies. **No weather forecasts.**
- **Tested on years it never saw** (each year 2018–2025 predicted by a model trained only on earlier years):
  watching the top 10 % of hexagons would have caught **31.9 %** of the following month's fire hexagons, vs **28.0 %**
  for the usual season (gain 3.8–4.1 percentage points, 90 % range) and 21.1 % for "last month's fire". PR-AUC
  **0.69** vs 0.53. Trained on the other regions only, it beat the usual season in **9 of 9** held-out regions
  (model version 2, retrained in Round 8 with all 9 regions).
- **Honest finding**: fed raw instead of harmonized history, PR-AUC changes by −0.008 — harmonization does not help this
  ranking task (it matters for comparing amounts across years, which is the record itself).
- **Monthly retraining** (GitHub Actions, 2nd of each month): a challenger is trained and tested on months neither model
  saw; it replaces the current model only if it beats both the current model and the usual season. Every run is logged
  in `api/model_history.json`.

## 7. Daily updates

A GitHub Actions job runs **every day at 04:40 UTC**: it fetches this month's NASA FIRMS near-real-time detections for
all 9 regions, recomputes *this month so far* with the frozen published ratios (no recalibration), the comparison with
the same days of past years, Fire Watch statuses, the end-of-month projection and the API files, and commits only if
something changed. Historical months are never touched (a snapshot test checks every value). AI briefings are
regenerated only when a region's status or agent verdict changes. The model stays monthly. The site shows "Updated daily · last update …".
The same job runs the **agent check** on the current flagged months: detection times every day; NASA MCD64A1 burned
area as soon as the month is published (about 1–2 months later — until then "Not checkable yet" unless the timing data
already show a shift); Meteosat once data access is granted.

## 8. Open API

No key, CORS open, static JSON under `/data/v1/` plus a few read-only endpoints — grouped on the Data page:
**Regions & history** (`meta.json`, `regions/{id}.json`, `api/series/{id}.json`), **This month** (`daily/`, `watch.json`,
`api/projection/`, `/api/live`, `/api/hotspots`), **Model** (`api/likelihood/`, `api/model_card.json`,
`api/model_history.json`) and **Extras** (`api/power/`, `api/reunion.json`, `hexes/`, `/api/health`). Six example apps
on a separate site use nothing but these calls.

## 9. Limitations

- **Fire-days are not burned area**: they count days with ≥1 detection per hexagon, not hectares, damage or emissions.
- **Overpass timing**: satellites see a place about twice a day. In Punjab, burning has reportedly moved to late
  afternoon; our data shows daytime Aqua ÷ VIIRS up ×1.46 in Oct–Nov 2022–26 vs 2013–19. Those months carry the
  `overpass_timing` flag; numbers are not adjusted.
- **MODIS drift and end of life**: calibration stops at 2019; after 2012 the record is VIIRS-based.
- **Before July 2002 only Terra** exists: shown, with wider ranges, but not ranked.
- **Recent months are provisional** (near-real-time data, may be revised).
- **Low-fire places** (Mauritius) get "too little fire to judge" instead of big percentages.
- **The model is a planning aid**: monthly, per hexagon, modest gain over the usual season, no weather forecasts.
- **9 regions only**; Fire Rings is a planning and analysis tool, **not an emergency alert service**.

## 10. Future work

- An **Oracle database** behind the API and **worldwide coverage** (every country/region, not 7 presets).
- **Switch on the geostationary checks**: the Meteosat (LSA SAF FRP-PIXEL) reader is built and tested and waits for data
  access; the GOES reader works but there is no published Americas region yet; Himawari for Australia and INSAT for
  India are not built.
- Use the **burned-area** summaries beyond verification, to relate fire-days to hectares burned.
- **3-hourly updates** of the current month instead of daily.

---

## 11. 29 questions judges may ask — short, honest answers

1. **What exactly is harmonized?** VIIRS fire-days are converted down to MODIS-equivalent with region × month ratios
   fitted on Jul 2012 – Dec 2019, so 2001 and 2026 use the same ruler.
2. **Why not just use VIIRS?** It only starts in 2012. To compare today with 25 years you need MODIS's scale.
3. **Why scale VIIRS down instead of MODIS up?** MODIS is the long reference; scaling it up would invent small fires it never saw.
4. **Why fire-days and not hotspot counts?** Pixel counts depend on pixel size; "a hexagon burned on a day" is much less
   sensor-dependent. One fire burning 3 days in one hexagon = 3 fire-days.
5. **Why stop calibration at 2019?** Terra (2020) and Aqua (Dec 2021) drift to different overpass times; fitting on
   drifted years would bake the drift into the ratios.
6. **How accurate is it?** Out of sample, annual error 1.8 %–9.2 % in the six validated regions (24.4 % in low-fire Mauritius, which we don't judge).
7. **Does the 2012 jump really disappear?** Yes: e.g. Punjab +199 % raw → +3.1 % harmonized, vs +4.2 % for MODIS alone;
   the change-point test finds a jump in raw data (p = 0.005) and none after harmonization (p = 0.92).
8. **Where does the 20 % target come from?** We set it before testing; it is not an external standard. It keeps the
   error below normal year-to-year swings (≈±8–23 %) and far below the switch artefact (+75 % to +405 %).
9. **How do you know a famous season comes out right?** Black Summer 2019–20 ranks #1 of 23 seasons in SE Australia.
10. **What is uncertain?** Every month has a 90 % range from 500 bootstrap re-runs plus counting noise; wide ones are hatched.
11. **Is Punjab's October 2026 really that low?** The record gives 0.08× a typical October (392 fire-days), the lowest of
    25 Octobers. S-NPP, NOAA-20 and NOAA-21 agree; but the late-afternoon burning caveat applies.
12. **What happens now that S-NPP has stopped?** From November 2026 the record follows NOAA-20, scaled with k·k′ (k′
    fitted where S-NPP and NOAA-20 overlap).
13. **Does the AI make up numbers?** It may only use tool results; the server checks every number and withholds an
    answer that contains an unverified one. Fire Watch rules decide; the AI only explains.
14. **Is Fire Watch an alert system?** No — situational awareness for planning, with fixed published rules. Not an emergency service.
15. **What does harmonization change for alerts?** On 2012–2025 (9 regions), raw data gives 243 "far above normal"
    alerts, 128 of them from the satellite switch; harmonized gives 119. Raw flags only 37 real drops, harmonized 125.
16. **What does the model predict?** Which hexagons are more likely to have at least one fire-day in the scored month — not
    when, how big, damage or cause.
17. **Is the model better than just using the season?** Modestly: top-10 % capture 31.9 % vs 28.0 % on unseen years
    (+3.8 to +4.1 points), PR-AUC 0.69 vs 0.53, and better in 9 of 9 held-out regions.
18. **Does harmonization help the model?** Not for this ranking task (−0.008 PR-AUC with harmonized vs raw history). We report it rather than hide it.
19. **How does it stay current?** Daily GitHub Actions update of this month from FIRMS NRT; monthly model retraining
    that only publishes a challenger if it beats both the current model and the usual season.
20. **Can historical numbers change by accident?** A snapshot test compares every historical month with a frozen copy;
    the daily job also refuses to write months before November 2026.
21. **How do you handle satellite outages?** Operating days are detected from the data; counts are scaled for missing
    days, and months under 60 % coverage get no value.
22. **What about industrial heat sources?** Persistent hot spots (steelworks, refineries) are masked the same way for both sensors.
23. **Can I use the data?** Yes: CSV/Parquet/JSON, CC BY 4.0, an open API with no key; cite via `CITATION.cff`.
24. **Why these 9 regions?** Different fire regimes (crop burning, savanna and dry-season burning, bushfires, Brazilian
    deforestation and agricultural fire) plus an honest low-fire case; a region is shown only if it passes the validation
    tests. Sudan and Mato Grosso were hidden until the gate stopped rejecting real pre-2012 fire history (gate v1.2, §5).
25. **What would you do next?** Worldwide coverage on a database, switching on the Meteosat check (built, waiting for
    data access), Himawari for Australia and 3-hourly updates.
26. **How does the agent decide whether a flagged drop is real?** Fixed, unit-tested rules, not the AI: "Real change"
    when NASA burned area (MCD64A1) moves the same way and detection times have not shifted; "Detection issue likely"
    when detection times shifted, geostationary data show fires at hours polar satellites miss, or fire-days fell but
    burned area did not; "Unclear" when signals conflict; "Not checkable yet" otherwise.
27. **What did the agent find on past flags?** Over the 227 months Fire Watch flagged in 2013–2025 (9 regions): Real
    change 144, Detection issue likely 19, Unclear 43, Not checkable yet 21. Detection times and burned area ran for all
    regions; NOAA GOES ran for Mato Grosso (fires matched the polar overpass hours in 21 of 36 months, more fire outside
    them in 7); Meteosat still waits for data access.
29. **Why did you change the validation gate?** Because it rejected real fire history: Sudan's and Mato Grosso's breaks
    (2009, 2007) appear in MODIS alone, years before VIIRS. We fixed the new rule before computing, checked it on all 9
    regions (no published region changed) and publish both results, with the caveat that it is not an independent test of
    pre-2012 breaks.
28. **Does it confirm the Punjab stubble-burning caveat?** Partly, and it says so: Oct 2023 – Nov 2025 show a big rise
    in the share of night detections (×3.7 to ×15.9 vs 2013–2019) while burned area also fell, so the verdict is
    "Unclear" — a real drop and a detection-time change together. October 2026 (Aqua÷VIIRS ×2.12, night share ×20.8,
    burned area not published yet) is "Detection issue likely", and so is November 2026 so far (updated daily).
