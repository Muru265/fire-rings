"""08 — Export web data (contract: master plan §6.3) to web/public/data/v1/.

regions/{id}.json          region record: months (raw + harmonized + per-month stats), k, validation, climatology,
                           latest, annual, similar years
daily/{id}.json            daily fire cell-days per month (MODIS + primary VIIRS stream)
hexes/{id}/cells.json      H3 r6 cell ids;  hexes/{id}/{year}.json  per-month [cellIndex, cell-days] pairs of the
                           primary stream (MODIS < 2012, S-NPP 2012 – Oct 2026, NOAA-20 after) for map / box filtering
hotspots/{id}_{YYYY-MM}.csv  detection-level CSV for the latest months (downloads)
dataset/harmonized_monthly_regions_v1.csv|.parquet · calibration_k_v1.csv · validation_v1.json
meta.json
Harmonized fields are null unless 05–07 outputs exist (never invented).
Usage: python pipeline/08_export.py
"""
from __future__ import annotations

import datetime as dt
import math
import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import config, connect, path, read_json, sql_path, write_json  # noqa: E402

PROVISIONAL_AFTER = {"MODIS": dt.date(2026, 8, 31), "VIIRS": dt.date(2026, 7, 31)}  # archive ends → NRT after
CITATION = ("Fire Rings Harmonized Hotspot Record v1.0 (2026). NASA Space Apps 2026, Port Louis. "
            "Derived from NASA FIRMS MODIS C6.1 and VIIRS 375 m active fire data. Licence CC BY 4.0.")
HOTSPOT_MONTHS = 2


def segment(y: int, m: int) -> str:
    key = f"{y:04d}-{m:02d}"
    for s in config()["harmonized_segments"]:
        if s["from"] <= key and (s["to"] is None or key <= s["to"]):
            return s["src"]
    return "M"


def viirs_stream(y: int, m: int) -> str:
    return "N20" if segment(y, m) == "V2" else "SNPP"


def primary_stream(y: int, m: int) -> str:
    return {"T": "TERRA", "M": "MODIS", "V": "SNPP", "V2": "N20"}[segment(y, m)]


def bbox_area_km2(b: list[float]) -> float:
    w, s, e, n = b
    r = 6371.0088
    return round(r * r * math.radians(e - w) * (math.sin(math.radians(n)) - math.sin(math.radians(s))))


def r1(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 1)


def opt_json(p: Path):
    return read_json(p) if p.exists() else None


def export_region(region: str, rc: dict, data_end: dt.date, web: Path) -> dict:
    cube, out = path("cube"), path("out")
    mon = pl.read_parquet(cube / f"{region}_monthly.parquet")
    get = {(r["y"], r["m"], r["stream"]): r for r in mon.iter_rows(named=True)}
    hp = out / f"harmonized_{region}.parquet"
    harm = {(r["y"], r["m"]): r for r in pl.read_parquet(hp).iter_rows(named=True)} if hp.exists() else {}
    stats = opt_json(out / f"stats_{region}.json") or {}
    valid = opt_json(out / f"validation_{region}.json") or {}
    calib = opt_json(out / f"calib_{region}.json") or {}
    method = (valid.get("summary") or {}).get("method")
    cm = calib.get("methods", {}).get(method, {}) if method else {}
    pm = {(p["y"], p["m"]): p for p in stats.get("per_month", [])}

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
            if (last_day > PROVISIONAL_AFTER["VIIRS"] and y >= 2012) or last_day > PROVISIONAL_AFTER["MODIS"]:
                flags.append("provisional")
            seg = segment(y, m)
            primary = md if seg in ("T", "M") else vs
            if seg == "T":
                primary = get[(y, m, "TERRA")]
            if primary["flag"] == "insufficient":
                flags.append("insufficient")
            h = harm.get((y, m), {})
            if h.get("uncertain"):
                flags.append("uncertain")
            s = pm.get((y, m), {})
            months.append({
                "y": y, "m": m,
                "H": r1(h.get("H")), "lo": r1(h.get("lo")), "hi": r1(h.get("hi")),
                "raw_modis": r1(md["C_adj"]), "raw_viirs": r1(vs["C_adj"]) if y >= 2012 else None,
                "hot_modis": int(md["hot"]), "hot_viirs": int(vs["hot"]) if y >= 2012 else None,
                "cov_modis": md["cov"], "cov_viirs": vs["cov"] if y >= 2012 else None,
                "src": seg, "flags": flags,
                "ratio": s.get("ratio"), "pct": s.get("pct"), "rp": s.get("return_period"),
                "beyond": s.get("beyond_record") or None, "rank": s.get("rank"), "guard": s.get("guard"),
            })

    # the partial (month-to-date) month is judged against the same days of baseline years, as in `latest`
    lt = stats.get("latest") or {}
    if lt.get("mtd") and months and (months[-1]["y"], months[-1]["m"]) == (lt.get("y"), lt.get("m")):
        months[-1].update({"ratio": lt.get("ratio"), "pct": lt.get("pct"), "rp": lt.get("return_period"),
                           "beyond": lt.get("beyond_record") or None, "rank": lt.get("rank"), "guard": lt.get("guard")})

    bbox = rc.get("bbox")
    if bbox is None:
        clean = pl.read_parquet(path("clean") / f"{region}_filtered.parquet", columns=["lat", "lon"])
        bbox = [round(clean["lon"].min(), 2), round(clean["lat"].min(), 2),
                round(clean["lon"].max(), 2), round(clean["lat"].max(), 2)]
        area, area_note = None, "whole FIRMS country file (no clip box)"
    else:
        area, area_note = bbox_area_km2(bbox), "clip box area"

    # ---- daily sidecar -------------------------------------------------------------------------------------
    daily_all = pl.read_parquet(cube / f"{region}_daily.parquet")
    by_day = {(r["date"], r["stream"]): int(r["cells"]) for r in daily_all.iter_rows(named=True)}
    side: dict = {}
    for rec in months:
        y, m = rec["y"], rec["m"]
        nd = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(1)).day
        series = {"modis": [by_day.get((dt.date(y, m, d), "MODIS"), 0) for d in range(1, nd + 1)]}
        if y >= 2012:
            series["viirs"] = [by_day.get((dt.date(y, m, d), viirs_stream(y, m)), 0) for d in range(1, nd + 1)]
        side[f"{y:04d}-{m:02d}"] = series
    latest_key = f"{months[-1]['y']:04d}-{months[-1]['m']:02d}"
    write_json(web / "daily" / f"{region}.json", side, compact=True)

    # ---- hexes (cell-month, primary stream) -------------------------------------------------------------------
    cmo = pl.read_parquet(cube / f"{region}_cellmonth.parquet")
    keep = pl.DataFrame([{"y": r["y"], "m": r["m"], "stream": primary_stream(r["y"], r["m"])} for r in months])
    cmo = cmo.join(keep, on=["y", "m", "stream"], how="inner")
    con = connect()
    cells = sorted(cmo["h3r6"].unique().to_list())
    cid = {c: i for i, c in enumerate(cells)}
    strs = [s for (s,) in con.execute("SELECT h3_h3_to_string(c) FROM (SELECT unnest(?::UBIGINT[]) c)", [cells]).fetchall()]
    write_json(web / "hexes" / region / "cells.json", strs, compact=True)
    for y, part in cmo.group_by("y"):
        y = y[0]
        mm = [[] for _ in range(12)]
        for r in part.iter_rows(named=True):
            mm[r["m"] - 1] += [cid[r["h3r6"]], int(r["n_days"])]
        write_json(web / "hexes" / region / f"{y}.json", {"y": y, "m": mm}, compact=True)

    # ---- hotspot CSVs for the latest months ----------------------------------------------------------------
    clean_p = sql_path(path("clean") / f"{region}_filtered.parquet")
    for rec in months[-HOTSPOT_MONTHS:]:
        y, m = rec["y"], rec["m"]
        dest = web / "hotspots" / f"{region}_{y:04d}-{m:02d}.csv"
        dest.parent.mkdir(parents=True, exist_ok=True)
        rows = con.execute(f"""
            SELECT round(lat,5), round(lon,5), strftime(t_utc, '%Y-%m-%dT%H:%MZ'), solar_date, stream, conf, frp,
                   daynight, product FROM '{clean_p}'
            WHERE year(solar_date)={y} AND month(solar_date)={m} ORDER BY t_utc""").fetchall()
        with dest.open("w", encoding="utf-8", newline="") as fh:
            fh.write(f"# Fire Rings v1 · {rc['name']} · {y}-{m:02d} · filtered hotspot detections (conf N/H, static sources "
                     f"masked) · {'provisional NRT' if 'provisional' in rec['flags'] else 'standard'} · {CITATION}\n")
            fh.write("lat,lon,t_utc,solar_date,stream,conf,frp_mw,daynight,product\n")
            for r in rows:
                fh.write(",".join("" if v is None else str(v) for v in r) + "\n")
    con.close()

    doc = {
        "id": region, "name": rc["name"], "area_km2": area, "area_note": area_note, "bbox": bbox,
        "baseline": config()["stats"]["baseline"], "calib_version": config()["version"] if harm else None,
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "data_end": str(data_end),
        "units": {"H": "fire cell-days (MODIS-equivalent)", "raw": "fire cell-days (H3 r6 cell × solar day)",
                  "hot": "hotspot detections"},
        "method": method,
        "method_reason": (valid.get("summary") or {}).get("method_reason"),
        "months": months,
        "k": {k: cm["k"][k] for k in ("month", "lo", "hi", "B", "A", "raw_month", "pool", "tau")} if cm else
             {"month": [], "lo": [], "hi": [], "B": []},
        "q": {k: cm["q"][k] for k in ("month", "lo", "hi", "pool")} if cm else None,
        "kprime": {k: cm["kprime"][k] for k in ("month", "lo", "hi", "pool")} if cm else None,
        "validation": valid.get("summary"),
        "climatology": stats.get("climatology"),
        "latest": stats.get("latest"),
        "latest_complete": stats.get("latest_complete"),
        "annual": stats.get("annual", []),
        "similar_years": stats.get("similar_years", []),
        "similar_detail": stats.get("similar_detail"),
        "daily": {latest_key: side.get(latest_key, {})},
        "hotspot_months": [f"{r['y']:04d}-{r['m']:02d}" for r in months[-HOTSPOT_MONTHS:]],
        "hex_years": sorted({r["y"] for r in months}),
        "harmonized": bool(harm),
    }
    write_json(web / "regions" / f"{region}.json", doc, compact=True)
    return {"id": region, "name": rc["name"], "bbox": bbox, "months": len(months), "method": method,
            "harmonized": bool(harm), "first": f"{months[0]['y']}-{months[0]['m']:02d}", "last": latest_key,
            "latest": stats.get("latest"), "latest_complete": stats.get("latest_complete"), "doc": doc}


def write_dataset(regs: list[dict], web: Path) -> None:
    ds = web / "dataset"
    ds.mkdir(parents=True, exist_ok=True)
    rows = []
    for r in regs:
        d = r["doc"]
        for mrec in d["months"]:
            rows.append({"region": d["id"], "year": mrec["y"], "month": mrec["m"], "H": mrec["H"], "H_lo": mrec["lo"],
                         "H_hi": mrec["hi"], "raw_modis_celldays": mrec["raw_modis"], "raw_viirs_celldays": mrec["raw_viirs"],
                         "hotspots_modis": mrec["hot_modis"], "hotspots_viirs": mrec["hot_viirs"],
                         "coverage_modis": mrec["cov_modis"], "coverage_viirs": mrec["cov_viirs"], "source": mrec["src"],
                         "flags": "|".join(mrec["flags"]), "ratio_to_median": mrec["ratio"],
                         "pct_lo": mrec["pct"][0] if mrec["pct"] else None, "pct_hi": mrec["pct"][1] if mrec["pct"] else None,
                         "method": d["method"], "calib_version": d["calib_version"]})
    df = pl.DataFrame(rows, infer_schema_length=None)
    df.write_parquet(ds / "harmonized_monthly_regions_v1.parquet")
    csv = ds / "harmonized_monthly_regions_v1.csv"
    with csv.open("w", encoding="utf-8", newline="") as fh:
        fh.write(f"# {CITATION} Units: H = fire cell-days (MODIS-equivalent; H3 res-6 cell x solar day). "
                 f"Regions: {', '.join(r['id'] for r in regs)}. Data through {regs[0]['doc']['data_end']}. "
                 "Dictionary: /data page.\n")
        fh.write(df.write_csv())
    krows = []
    for r in regs:
        d = r["doc"]
        for name in ("k", "q", "kprime"):
            blk = d.get(name)
            if not blk or not blk.get("month"):
                continue
            for i in range(12):
                krows.append({"region": d["id"], "ratio": name, "month": i + 1, "value": blk["month"][i],
                              "lo": blk["lo"][i], "hi": blk["hi"][i], "pool": blk["pool"],
                              "overlap_B": blk.get("B", [None] * 12)[i] if name == "k" else None,
                              "overlap_A": blk.get("A", [None] * 12)[i] if name == "k" else None,
                              "tau": blk.get("tau") if name == "k" else None, "method": d["method"]})
    with (ds / "calibration_k_v1.csv").open("w", encoding="utf-8", newline="") as fh:
        fh.write(f"# {CITATION} k = MODIS/S-NPP (Jul 2012-Dec 2019), q = MODIS/Terra (Jul 2002-Dec 2019), "
                 "kprime = S-NPP/NOAA-20 (Apr 2018-Jul 2026). lo/hi = bootstrap 5th/95th percentiles.\n")
        fh.write(pl.DataFrame(krows).write_csv())
    val = {r["id"]: opt_json(path("out") / f"validation_{r['id']}.json") for r in regs}
    write_json(ds / "validation_v1.json", {"version": "v1", "regions": val})


def main() -> None:
    cfg = config()
    web = path("web")
    data_end = dt.date.fromisoformat(cfg["record"]["data_end"])
    regs = [export_region(r, rc, data_end, web) for r, rc in cfg["regions"].items()]
    write_dataset(regs, web)
    write_json(web / "meta.json", {
        "version": cfg["version"], "data_end": str(data_end), "citation": CITATION,
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "regions": [{k: v for k, v in r.items() if k != "doc"} for r in regs]})
    for r in regs:
        print(r["id"], r["method"], r["months"], r["last"], "harmonized" if r["harmonized"] else "RAW ONLY")


if __name__ == "__main__":
    main()
