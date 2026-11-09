"""08 — Export web data (contract: master plan §6.3) to web/public/data/v1/.

Raw fields always come from the cube. Harmonized fields (H, lo, hi, k, validation, stats) are filled from the outputs of
05_calibrate / 06_validate / 07_stats when present, and are null otherwise (never invented).
Usage: python pipeline/08_export.py
"""
from __future__ import annotations

import datetime as dt
import math
import sys
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import config, path, read_json, write_json  # noqa: E402

PROVISIONAL_AFTER = {"MODIS": dt.date(2026, 8, 31), "VIIRS": dt.date(2026, 7, 31)}  # archive ends → NRT after


def segment(y: int, m: int) -> str:
    key = f"{y:04d}-{m:02d}"
    for s in config()["harmonized_segments"]:
        if s["from"] <= key and (s["to"] is None or key <= s["to"]):
            return s["src"]
    return "M"


def viirs_stream(y: int, m: int) -> str:
    return "N20" if segment(y, m) == "V2" else "SNPP"


def bbox_area_km2(b: list[float]) -> float:
    w, s, e, n = b
    r = 6371.0088
    return round(r * r * math.radians(e - w) * (math.sin(math.radians(n)) - math.sin(math.radians(s))))


def r1(x):
    return None if x is None else round(float(x), 1)


def export_region(region: str, rc: dict, data_end: dt.date, web: Path) -> dict:
    cube = path("cube")
    mon = pl.read_parquet(cube / f"{region}_monthly.parquet")
    get = {(r["y"], r["m"], r["stream"]): r for r in mon.iter_rows(named=True)}
    harm = {}
    hp = path("out") / f"harmonized_{region}.parquet"
    if hp.exists():
        harm = {(r["y"], r["m"]): r for r in pl.read_parquet(hp).iter_rows(named=True)}
    stats = read_json(path("out") / f"stats_{region}.json") if (path("out") / f"stats_{region}.json").exists() else {}
    calib = read_json(path("out") / f"calib_{region}.json") if (path("out") / f"calib_{region}.json").exists() else {}
    valid = read_json(path("out") / f"validation_{region}.json") if (path("out") / f"validation_{region}.json").exists() else {}

    start_y = int(config()["record"]["start"][:4])
    months = []
    for y in range(start_y, data_end.year + 1):
        for m in range(1, 13):
            first = dt.date(y, m, 1)
            if first > data_end:
                break
            md, vs = get[(y, m, "MODIS")], get[(y, m, viirs_stream(y, m))]
            flags = []
            if md["D"] < (dt.date(y + (m == 12), m % 12 + 1, 1) - first).days:
                flags.append("mtd")
            last_day = first.replace(day=md["D"]) if md["D"] else first
            if last_day > PROVISIONAL_AFTER["VIIRS"] and y >= 2012 or last_day > PROVISIONAL_AFTER["MODIS"]:
                flags.append("provisional")
            seg = segment(y, m)
            primary = md if seg in ("T", "M") else vs
            if primary["flag"] == "insufficient":
                flags.append("insufficient")
            h = harm.get((y, m), {})
            if h.get("uncertain"):
                flags.append("uncertain")
            months.append({
                "y": y, "m": m,
                "H": r1(h.get("H")), "lo": r1(h.get("lo")), "hi": r1(h.get("hi")),
                "raw_modis": r1(md["C_adj"]), "raw_viirs": r1(vs["C_adj"]) if y >= 2012 else None,
                "hot_modis": int(md["hot"]), "hot_viirs": int(vs["hot"]) if y >= 2012 else None,
                "cov_modis": md["cov"], "cov_viirs": vs["cov"] if y >= 2012 else None,
                "src": seg, "flags": flags,
            })

    bbox = rc.get("bbox")
    if bbox is None:
        clean = pl.read_parquet(path("clean") / f"{region}_filtered.parquet", columns=["lat", "lon"])
        bbox = [round(clean["lon"].min(), 2), round(clean["lat"].min(), 2),
                round(clean["lon"].max(), 2), round(clean["lat"].max(), 2)]
        area, area_note = None, "whole FIRMS country file (no clip box)"
    else:
        area, area_note = bbox_area_km2(bbox), "clip box area"

    # daily series for the latest month in the contract; full daily history in a sidecar file
    daily_all = pl.read_parquet(cube / f"{region}_daily.parquet")
    side: dict[str, dict[str, list[int]]] = {}
    for y, m in sorted({(d.year, d.month) for d in daily_all["date"].to_list()}):
        if dt.date(y, m, 1) < dt.date(start_y, 1, 1):
            continue
        key = f"{y:04d}-{m:02d}"
        nd = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(1)).day
        sub = daily_all.filter((pl.col("date").dt.year() == y) & (pl.col("date").dt.month() == m))
        series = {}
        for label, stream in (("modis", "MODIS"), ("viirs", viirs_stream(y, m))):
            if label == "viirs" and y < 2012:
                continue
            arr = [0] * nd
            for r in sub.filter(pl.col("stream") == stream).iter_rows(named=True):
                arr[r["date"].day - 1] = int(r["cells"])
            series[label] = arr
        side[key] = series
    latest_key = f"{months[-1]['y']:04d}-{months[-1]['m']:02d}"
    write_json(web / "daily" / f"{region}.json", side, compact=True)

    doc = {
        "id": region, "name": rc["name"], "area_km2": area, "area_note": area_note, "bbox": bbox,
        "baseline": config()["stats"]["baseline"], "calib_version": config()["version"] if harm else None,
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "data_end": str(data_end),
        "units": {"H": "fire cell-days (MODIS-equivalent)", "raw": "fire cell-days (H3 r6 cell × solar day)",
                  "hot": "hotspot detections"},
        "method": calib.get("method"),
        "months": months,
        "k": calib.get("k", {"month": [], "lo": [], "hi": [], "B": []}),
        "validation": valid.get("summary"),
        "climatology": stats.get("climatology"),
        "latest": stats.get("latest"),
        "annual": stats.get("annual", []),
        "similar_years": stats.get("similar_years", []),
        "daily": {latest_key: side.get(latest_key, {})},
        "harmonized": bool(harm),
    }
    write_json(web / "regions" / f"{region}.json", doc, compact=True)
    return {"id": region, "name": rc["name"], "bbox": bbox, "months": len(months),
            "harmonized": bool(harm), "first": f"{months[0]['y']}-{months[0]['m']:02d}", "last": latest_key}


def main() -> None:
    cfg = config()
    web = path("web")
    data_end = dt.date.fromisoformat(cfg["record"]["data_end"])
    regs = [export_region(r, rc, data_end, web) for r, rc in cfg["regions"].items()]
    write_json(web / "meta.json", {"version": cfg["version"], "data_end": str(data_end),
                                   "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                                   "regions": regs})
    for r in regs:
        print(r)


if __name__ == "__main__":
    main()
