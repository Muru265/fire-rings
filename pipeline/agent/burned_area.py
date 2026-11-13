"""Tool B — check_burned_area(region, month): NASA MODIS MCD64A1 Collection 6.1 monthly burned area (500 m).

Access: `earthaccess` with EARTHDATA_USERNAME / EARTHDATA_PASSWORD from the environment (.env locally, GitHub secrets in
Actions; never printed). Only the MODIS sinusoidal tiles intersecting the region box are downloaded to data/agent_tmp/
(gitignored), summarised, and deleted. The committed cache (pipeline/assets/agent/burned_area.json) holds only
{region: {YYYY-MM: {km2, tiles, granules}}}.

Summary per region-month: pixels with "Burn Date" > 0 (burned that month), whose centre falls inside the record's region
footprint (H3 cells from live/{id}.json) and outside the known-static H3 res-9 cells (same static mask as the record).
Pixel area = (1111950.5197665 m / 2400)² = 0.21466 km² (sinusoidal grid is equal-area).

Signal (flag direction "up" = far above normal, "down" = far below normal), ratio = burned km² ÷ median of the same month
in the baseline years 2003–2022 (≥ 10 baseline years needed):
  burned_area_agrees      up and ratio ≥ 1.25, or down and ratio ≤ 0.80
  burned_area_disagrees   otherwise
  not_yet_published       no MCD64A1 granules for the month yet and the month is ≤ 4 months old (latency ~1–2 months)
  unavailable             no credentials, too few baseline years, or too little burned area to compare
                          (baseline median < 5 km² and month < 10 km²)
"""
from __future__ import annotations

import datetime as dt
import math
import os
import time
from pathlib import Path

import numpy as np

from .common import TMP, footprint, load_cache, mkey, now_iso, parse_key, save_cache

SHORT, VERSION = "MCD64A1", "061"
TILE_M = 1111950.5197665
R_EARTH = 6371007.181
X0, Y0 = -20015109.354, 10007554.677
PIX_KM2 = (TILE_M / 2400 / 1000) ** 2
BASE_YEARS = (2003, 2022)
UP, DOWN = 1.25, 0.80
SOURCE = "NASA MCD64A1 burned area (LP DAAC)"
CACHE = "burned_area"
BATCH = 36


def credentials() -> bool:
    return bool(os.environ.get("EARTHDATA_USERNAME") and os.environ.get("EARTHDATA_PASSWORD"))


def pixel_latlon(h: int, v: int, rows: np.ndarray, cols: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """MODIS sinusoidal pixel centres → lat/lon (degrees)."""
    px = TILE_M / 2400
    x = X0 + h * TILE_M + (cols + 0.5) * px
    y = Y0 - v * TILE_M - (rows + 0.5) * px
    lat = y / R_EARTH
    lon = x / (R_EARTH * np.cos(lat))
    return np.degrees(lat), np.degrees(lon)


def summarise_file(path: Path, region: str) -> tuple[str, float]:
    """(tile 'hXXvYY', burned km² inside the footprint and outside static cells) for one MCD64A1 HDF4 granule."""
    import h3
    from pyhdf.SD import SD, SDC
    name = path.name
    tile = name.split(".")[2]
    h, v = int(tile[1:3]), int(tile[4:6])
    sd = SD(str(path), SDC.READ)
    bd = sd.select("Burn Date")[:]
    sd.end()
    rows, cols = np.nonzero(bd > 0)
    if not len(rows):
        return tile, 0.0
    lat, lon = pixel_latlon(h, v, rows, cols)
    fp = footprint(region)
    w, s, e, n = fp["bbox"]
    sel = (lon >= w - 0.1) & (lon <= e + 0.1) & (lat >= s - 0.1) & (lat <= n + 0.1)
    n_in = 0
    for la, lo in zip(lat[sel], lon[sel]):
        c9 = h3.latlng_to_cell(float(la), float(lo), 9)
        if c9 in fp["static"]:
            continue
        if h3.cell_to_parent(c9, fp["res"]) in fp["cells"]:
            n_in += 1
    return tile, n_in * PIX_KM2


def fetch(region: str, months: list[str], log=print) -> dict:
    """Download, summarise and delete MCD64A1 granules for these region-months (resume-safe; cached months skipped)."""
    import earthaccess
    cache = load_cache(CACHE)
    reg = cache.setdefault(region, {})
    todo = sorted(k for k in set(months) if k not in reg)
    if not todo:
        return reg
    earthaccess.login(strategy="environment")
    fp = footprint(region)
    t0, t1 = parse_key(todo[0]), parse_key(todo[-1])
    res = earthaccess.search_data(short_name=SHORT, version=VERSION, bounding_box=tuple(fp["bbox"]),
                                  temporal=(f"{t0[0]}-{t0[1]:02d}-01", f"{t1[0]}-{t1[1]:02d}-28"))
    by_month: dict[str, list] = {}
    for g in res:
        k = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:7]
        by_month.setdefault(k, []).append(g)
    TMP.mkdir(parents=True, exist_ok=True)
    have = [k for k in todo if by_month.get(k)]
    for i0 in range(0, len(have), BATCH):          # one threaded download per batch of months (per-call overhead dominates)
        batch = have[i0:i0 + BATCH]
        gs = [g for k in batch for g in by_month[k]]
        for attempt in range(4):                   # LP DAAC occasionally answers HTTP 500: retry with backoff
            try:
                files = earthaccess.download(gs, str(TMP), threads=16, show_progress=False)
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 3:
                    raise
                log(f"   download error ({type(e).__name__}), retry {attempt + 1} in {30 * (attempt + 1)} s")
                time.sleep(30 * (attempt + 1))
        per: dict[str, list] = {k: [] for k in batch}
        for f in map(Path, files):
            ydoy = f.name.split(".")[1]                # AYYYYDDD = first day of the month
            d = dt.date(int(ydoy[1:5]), 1, 1) + dt.timedelta(days=int(ydoy[5:8]) - 1)
            k = mkey(d.year, d.month)
            if k in per:
                per[k].append(summarise_file(f, region))
            f.unlink(missing_ok=True)
        for k in batch:
            reg[k] = {"km2": round(sum(a for _, a in per[k]), 2), "tiles": sorted(t for t, _ in per[k]), "granules": len(by_month[k])}
        save_cache(CACHE, cache)
        log(f"   {region} {batch[0]}…{batch[-1]}: {len(gs)} tiles ({min(i0 + BATCH, len(have))}/{len(have)} months)")
    save_cache(CACHE, cache)
    return reg


def published(month: str) -> bool:
    """Is any MCD64A1 granule out for this month? (cheap CMR query, no download)"""
    import earthaccess
    y, m = parse_key(month)
    return len(earthaccess.search_data(short_name=SHORT, version=VERSION, temporal=(f"{y}-{m:02d}-01", f"{y}-{m:02d}-28"), count=1)) > 0


def check_burned_area(region: str, month: str, direction: str, today: dt.date | None = None, cache: dict | None = None) -> dict:
    """Signal from the cached summaries (fetch() fills the cache). Pure function of the cache + direction."""
    today = today or dt.date.today()
    cache = cache if cache is not None else load_cache(CACHE)
    reg = cache.get(region, {})
    y, m = parse_key(month)
    base = [reg[mkey(yy, m)]["km2"] for yy in range(BASE_YEARS[0], BASE_YEARS[1] + 1) if mkey(yy, m) in reg]
    out = {"tool": "check_burned_area", "source": SOURCE, "product": f"{SHORT} C6.1", "month": month,
           "baseline": f"median of {mkey(BASE_YEARS[0], m)[5:]} in {BASE_YEARS[0]}–{BASE_YEARS[1]}", "baseline_years": len(base)}
    if month not in reg:
        age = (today.year - y) * 12 + today.month - m
        if age <= 4:
            return {**out, "signal": "not_yet_published", "note": "MCD64A1 is published about 1–2 months after the month ends"}
        return {**out, "signal": "unavailable", "note": "burned-area summary not fetched (no Earthdata access in this run)"}
    km2 = reg[month]["km2"]
    if len(base) < 10:
        return {**out, "signal": "unavailable", "burned_km2": km2, "note": "fewer than 10 baseline years"}
    med = float(np.median(base))
    if med < 5 and km2 < 10:
        return {**out, "signal": "unavailable", "burned_km2": km2, "baseline_km2": round(med, 1), "note": "too little burned area to compare"}
    ratio = km2 / med if med > 0 else math.inf
    agrees = (direction == "up" and ratio >= UP) or (direction == "down" and ratio <= DOWN)
    return {**out, "signal": "burned_area_agrees" if agrees else "burned_area_disagrees", "burned_km2": round(km2, 1),
            "baseline_km2": round(med, 1), "ratio": None if math.isinf(ratio) else round(ratio, 2), "checked_at": now_iso()}


if __name__ == "__main__":     # python -m agent.burned_area fetch [region …] — local backfill of the summary cache
    import sys
    from dotenv import load_dotenv
    from .common import ROOT
    load_dotenv(ROOT / ".env")
    regs = sys.argv[2:] or ["punjab", "madagascar", "se_australia", "mauritius", "nt_savanna", "ne_india", "tanzania"]
    months = [mkey(y, m) for y in range(2003, 2027) for m in range(1, 13) if (y, m) <= (2026, 9)]
    for r in regs:
        fetch(r, months, log=lambda s: print(s, flush=True))
        print(f"{r}: done", flush=True)
