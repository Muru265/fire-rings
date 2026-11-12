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
