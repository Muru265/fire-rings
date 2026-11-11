# Fire Rings: one consistent 25-year record of satellite fire detections from MODIS and VIIRS

> **Abstract.** Two generations of NASA satellites detect active fires differently: MODIS (Terra 2000→, Aqua 2002→, ~1 km pixels) and VIIRS (S-NPP 2012→, NOAA-20 2018→, NOAA-21 2023→, 375 m pixels). VIIRS sees many more small fires, so a naive record shows a jump in 2012 that is the satellite changing, not the fire. Fire Rings counts **fire-days** (an H3 resolution-6 hexagon of ~36 km² with at least one detection on one local solar day), converts VIIRS down to MODIS-equivalent with ratios fitted only on July 2012 – December 2019, and publishes one monthly record per region from 2001 to {{data_end}} with uncertainty, validation and an open API. Out of sample, the annual error is {{punjab.v1}}% in Punjab–Haryana, {{madagascar.v1}}% in Madagascar and {{se_australia.v1}}% in SE Australia; the 2012 jump in the raw series ({{punjab.step_raw}}% in Punjab) shrinks to {{punjab.step_harm}}% after harmonization, close to the MODIS-only change ({{punjab.step_modis}}%). The record feeds an explorer, a rule-based monitoring agent (Fire Watch), a grounded AI analyst and six example apps built by calling the API only.

## 1. Problem

People who plan for fire — land managers, air-quality agencies, insurers, journalists — ask the same question: *is this month normal?* Answering it needs a long, consistent baseline. NASA FIRMS distributes MODIS detections from November 2000 and VIIRS detections from January 2012. Joining them naively is wrong: in Punjab–Haryana the mean monthly count of 2012–2019 is {{punjab.step_raw}}% higher than in 2003–2011 on the raw series, while MODIS alone changed by only {{punjab.step_modis}}% over the same years. Any "worst year" or "above normal" statement built on the raw series after 2012 would mostly measure the sensor.

## 2. Data

All detections come from NASA FIRMS ([firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/)): standard (SP) archive files plus near-real-time (NRT) files for the most recent months, delivered 9 November 2026.

| Stream | Product | Used for |
|---|---|---|
| Terra MODIS | MCD14 C6.1, ~1 km | 2001 → (Terra-only months Jan 2001 – Jun 2002, bridged by q) |
| Aqua MODIS | MCD14 C6.1, ~1 km | 2002-07 → (MODIS = Terra ∪ Aqua) |
| Suomi-NPP VIIRS | VNP14IMG, 375 m | 2012 → Oct 2026 (data delivery ceased 2 Nov 2026) |
| NOAA-20 VIIRS | VJ114IMG, 375 m | Nov 2026 → (bridged by k′) |
| NOAA-21 VIIRS | VJ214IMG, 375 m | cross-check |

Four regions: Punjab–Haryana (India, crop-residue burning), Madagascar (dry-season burning), SE Australia (NSW + Victoria, bushfires) and Mauritius (an honest low-fire case). In total {{rows_read}} detections were read and {{rows_kept}} kept after the filters below.

## 3. Method

**Same filters for both sensors.** Low-confidence detections are dropped; FIRMS types 1–3 (volcano, other static land source, offshore) are dropped; H3 resolution-9 cells (~0.1 km²) that are known or persistent non-seasonal heat sources (flares, kilns, steelworks) are masked for every row, including NRT rows that carry no type flag.

**Fire-days, not pixels.** One fire-day is one H3 resolution-6 hexagon (~36 km²) with at least one kept detection on one local solar day (UTC + longitude/15 h). Counting presence instead of pixels removes most of the effect of VIIRS's finer pixels splitting one fire into many detections. Months where a satellite operated on less than 60% of days are marked "insufficient"; otherwise counts are scaled by days in the month ÷ operating days.

**Calibration window.** Per region and calendar month, k = (MODIS fire-days + 0.5) ÷ (S-NPP fire-days + 0.5) over **July 2012 – December 2019 only** — after 2020 Terra and Aqua drift to different overpass times, so later years are never used. Monthly ratios are shrunk on the log scale towards the region-wide ratio with weight w = B/(B+τ); τ is chosen by leave-one-year-out. VIIRS is scaled **down** to MODIS-equivalent; MODIS is never scaled up.

**Bridges.** q = MODIS ÷ Terra (July 2002 – December 2019) covers the months before Aqua; k′ = S-NPP ÷ NOAA-20 (April 2018 – July 2026) carries the record past November 2026, when S-NPP data delivery ceased (2 Nov 2026).

**Uncertainty.** Calibration years are resampled 500 times (year blocks, with a Poisson draw for each month's count) and all ratios refitted; the 90% interval is the 5th–95th percentile of the draws. Months with a wide interval are hatched as "uncertain".

::figure annual punjab

*Figure 1. Punjab–Haryana, harmonized fire-days per year with 90% intervals (the live chart from the app). No jump at the 2012 satellite switch.*

## 4. Validation

**V1 — out-of-sample annual error.** Each year of 2012–2019 is left out in turn, the ratios refitted without it and its MODIS total predicted from VIIRS. Mean absolute error: {{punjab.v1}}% (Punjab–Haryana, bias {{punjab.v1_bias}}%), {{madagascar.v1}}% (Madagascar, bias {{madagascar.v1_bias}}%), {{se_australia.v1}}% (SE Australia, bias {{se_australia.v1_bias}}%). Mauritius has too little fire to validate ({{mauritius.v1}}%; reported, not judged).

**V3 — the 2012 step.** Step = mean(2012–19) ÷ mean(2003–11) − 1.

| Region | Raw series | Harmonized | MODIS alone |
|---|---|---|---|
| Punjab–Haryana | {{punjab.step_raw}}% | {{punjab.step_harm}}% | {{punjab.step_modis}}% |
| Madagascar | {{madagascar.step_raw}}% | {{madagascar.step_harm}}% | {{madagascar.step_modis}}% |
| SE Australia | {{se_australia.step_raw}}% | {{se_australia.step_harm}}% | {{se_australia.step_modis}}% |

**Seasonal shape.** Predicted months follow the observed MODIS seasonal pattern with r = {{punjab.shape_r}} (Punjab), {{madagascar.shape_r}} (Madagascar) and {{se_australia.shape_r}} (SE Australia). SE Australia uses {{se_australia.method}} because monthly ratios narrowly failed the step test.

**A sourced season.** The 2019–20 Black Summer, documented by the [Royal Commission into National Natural Disaster Arrangements]({{bs.source_url}}), ranks **#{{bs.rank}} of {{bs.n}}** seasons in the harmonized SE Australia record.

**Why it matters for alerts.** The same fixed rules applied to raw data over {{watch.period}} would have raised **{{watch.raw_alerts}}** alerts, **{{watch.raw_only}}** of them caused only by the satellite switch; on harmonized data, **{{watch.harm_alerts}}**. Raw data also hide real drops: {{watch.raw_lows}} "far below normal" months versus {{watch.harm_lows}}.

::figure watchproof

*Figure 2. Alerts per year under the same rules, raw versus harmonized (live chart from Fire Watch).*

**Hotspots on demand.** The `/api/hotspots` endpoint re-applies the record's filters to NASA FIRMS Area-API data; for Punjab in October 2016 it returned {{parity.api}} detections versus {{parity.record}} in the record ({{parity.diff}}% difference).

?reunion **Ground truth: Piton de la Fournaise.** Against the Smithsonian Global Volcanism Program's eruption list ({{reunion.n}} eruption periods since 2000), MODIS detected {{reunion.modis_detected}} of {{reunion.modis_n}} eruptions in its downloaded windows and VIIRS {{reunion.viirs_detected}} of {{reunion.viirs_n}}, with {{reunion.lag_text}}. Heat in the 30 days before an eruption (outside other eruptions): MODIS {{reunion.pre_modis}}, VIIRS {{reunion.pre_viirs}} eruptions — reported as found, not as a warning signal.
?!reunion **Ground truth: Piton de la Fournaise.** The volcano check is being built from the Smithsonian Global Volcanism Program's eruption list; results will appear here when the data are published.

## 5. Applications

- **Explore** — Fire Rings (radial calendar), a grid calendar, a date-range summary, "Is this normal?" gauge, map with drawn boxes, CSV/PNG export, Long-term (MODIS-equivalent) and High detail (native VIIRS) modes.
- **Fire Watch** — fixed, published rules decide each region's status; an AI writes facts-only briefings whose numbers are verified against the lookups.
- **Ask Fire Rings** — a grounded analyst (Gemini function calling) that may only use numbers returned by its tools, shown in a live trace.
- **Open API and six example apps** — a separate site ([fire-rings-apps.vercel.app](https://fire-rings-apps.vercel.app)) imports no Fire Rings code and builds a projection-from-the-month-so-far tool (better than "typical" in {{proj.wins}} of {{proj.cells}} tested month × day checkpoints), a season fact-checker with NASA POWER weather, an illustrative insurance index, a Punjab smoke-season tracker with NASA GIBS aerosol imagery, the volcano check and a land-screening report. They run live in the [Use Cases](/use-cases) control room.

## 6. Limitations

- Fire-days count heat detected at overpass times on ~36 km² cells — not burned area, damage or emissions. In Punjab, burning has reportedly shifted to late afternoon, after the satellite passes, so recent seasons may be undercounted.
- Ratios are fitted on 2012–2019 and assumed stable; post-2020 MODIS orbit drift is monitored (V4) but not corrected.
- Low-fire places (Mauritius) cannot be validated; the app says "too little fire to judge".
- {{provisional}} are near-real-time months and provisional until NASA reprocesses them.
- The projection tool uses only the month so far and 20 years of history; it is not a weather-based forecast.

## 7. Open data and reproducibility

The harmonized monthly record, calibration ratios and validation results are published under `/data/v1/` (CSV, Parquet, JSON) with an open, key-free API listed on the [Data](/data) page. The pipeline (`python pipeline/run_all.py`) regenerates every number from the FIRMS files; tests check that the long-term record does not change between runs. Code: MIT licence. Data: CC BY 4.0, derived from NASA FIRMS.

## References

- Giglio, L., Schroeder, W., Justice, C.O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment* 178, 31–41. [doi:10.1016/j.rse.2016.02.054](https://doi.org/10.1016/j.rse.2016.02.054)
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. (2014). The New VIIRS 375 m active fire detection data product. *Remote Sensing of Environment* 143, 85–96. [doi:10.1016/j.rse.2013.12.008](https://doi.org/10.1016/j.rse.2013.12.008)
- NASA FIRMS. MODIS Collection 6.1 Active Fire Detections (MCD14ML), [doi:10.5067/FIRMS/MODIS/MCD14ML](https://doi.org/10.5067/FIRMS/MODIS/MCD14ML); VIIRS 375 m Active Fire (VNP14IMGT), [doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002](https://doi.org/10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002).
- Uber Technologies. H3: a hexagonal hierarchical geospatial indexing system. [h3geo.org](https://h3geo.org/)
- NASA POWER (Prediction Of Worldwide Energy Resources). [power.larc.nasa.gov](https://power.larc.nasa.gov/)
- NASA Global Imagery Browse Services (GIBS), [API documentation](https://nasa-gibs.github.io/gibs-api-docs/); NASA Worldview, [worldview.earthdata.nasa.gov](https://worldview.earthdata.nasa.gov/)
- Global Volcanism Program, Smithsonian Institution. Piton de la Fournaise (233020), *Volcanoes of the World*. [volcano.si.edu](https://volcano.si.edu/volcano.cfm?vn=233020)
- {{bs.source_name}}. [Ministerial statement: tabling the report of the Royal Commission (minister.homeaffairs.gov.au)]({{bs.source_url}})
- NOAA NESDIS. Cessation of Suomi National Polar-orbiting Partnership (S-NPP) data to users. [nesdis.noaa.gov](https://www.nesdis.noaa.gov/news/cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-onafter-november-01-2026)
- NASA Earthdata. Suomi NPP Transition Resources. [earthdata.nasa.gov](https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/suomi-npp/transition-resources)
