# Sources used for claims in the app

Published studies the app compares itself with. Every comparison number comes from the pipeline
(`web/public/data/v1/regions/{id}.json`), never from the study.

## Tanzania study check (Round 5B)

- **Tarimo B., Dick Ø.B., Gobakken T., Totland Ø. (2015)** “Spatial distribution of temporal dynamics in anthropogenic
  fires in miombo savanna woodlands of Tanzania”, *Carbon Balance and Management* 10:18,
  doi:[10.1186/s13021-015-0029-2](https://doi.org/10.1186/s13021-015-0029-2) (CC BY 4.0).
- What it reported: fire prevalence and burned extents **decreased in the past decade**, using the MODIS active fire
  product (2001–2013) and Landsat, for Tanzania's **miombo woodlands** (not the whole country).
- What we compare (`regions/tanzania.json` → `study_check`, written by `pipeline/08_export.py`): average fire-days per
  year 2003–2011 vs 2016–2025 (2012 is left out because January 2012 has no satellite data) for the harmonized record
  and for MODIS alone (Terra ∪ Aqua cell-days, raw), plus the naive raw MODIS→VIIRS step at 2012 from V3.
- Result at build time: harmonized −20.9 %, MODIS-only −21.6 %, naive raw join +182.9 % at 2012. The areas differ (miombo
  woodlands vs the whole country), so this is a consistency check, not a replication. MODIS-only after 2020 is affected
  by Terra/Aqua orbit drift.

## Agentic check data (Round 7)

Used by `pipeline/12_agent.py`; every number shown comes from these tools' stored outputs (`pipeline/assets/agent/`,
`web/public/data/v1/api/agent_check/`).

- **NASA FIRMS (MODIS/VIIRS)** — detection times (acq_time, day/night) of the record's own detections (Tool A).
- **NASA MCD64A1 burned area (LP DAAC)** — MODIS/Terra+Aqua Burned Area Monthly L3 Global 500 m SIN Grid V061,
  doi:[10.5067/MODIS/MCD64A1.061](https://doi.org/10.5067/MODIS/MCD64A1.061) (Tool B).
- **NOAA GOES-R ABI Fire Detection (AWS Open Data)** — ABI-L2-FDCF full disk, buckets `noaa-goes16` / `noaa-goes19`
  (<https://registry.opendata.aws/noaa-goes/>); GOES-19 became operational GOES-East on 7 Apr 2025 at 15:10 UTC
  (NOAA OSPO, <https://www.ospo.noaa.gov/data/messages/2025/04/MSG_20250407_1510.html>; NESDIS news release
  <https://www.nesdis.noaa.gov/news/noaas-goes-19-now-operational-goes-east-providing-critical-new-data-forecasters>) (Tool C1).
  Not shown on the site: the only Americas region (Mato Grosso) failed the publish gate.
- **EUMETSAT LSA SAF [FRPPixel, LSA-502]** — MSG FRP-PIXEL ListProduct (Tool C2). Not used yet (waiting for data access);
  the reader is tested on the Zenodo sample doi:[10.5281/zenodo.5717106](https://doi.org/10.5281/zenodo.5717106) (CC BY 4.0).

