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
from lib.common import published_regions, config, connect, path, read_json, sql_path, write_json  # noqa: E402
from lib.common import data_end as region_end  # noqa: E402

PROVISIONAL_AFTER = {"MODIS": dt.date(2026, 8, 31), "VIIRS": dt.date(2026, 7, 31)}  # archive ends → NRT after
CITATION = ("Fire Rings Harmonized Hotspot Record v1.0 (2026). NASA Space Apps 2026, Port Louis. "
            "Derived from NASA FIRMS MODIS C6.1 and VIIRS 375 m active fire data. Licence CC BY 4.0.")
HOTSPOT_MONTHS = 2
TIMING_CAVEAT_REGIONS = {"punjab"}
LOW_N_FIREDAYS = 200
TIMING_CAVEAT = ("Detected at satellite overpass times; burning has reportedly shifted to late afternoon, "
                 "so recent seasons may be undercounted.")


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


def quality(region: str) -> dict | None:
    """Filter/mask row counts (03_mask) and detected outages/gaps (04_cube) for the dashboard and Proof page."""
    out = path("out")
    mk, cb, un = (opt_json(out / f"{n}_{region}.json") for n in ("mask", "cube", "unify"))
    if not mk:
        return None
    tot = {s: sum(v[s] for v in mk["steps"].values()) for s in ("in", "conf", "type", "known", "persist")}
    nrt_in = sum(v["in"] for k, v in mk["steps"].items() if k.endswith("/NRT"))
    nrt_known = sum(v["type"] - v["known"] for k, v in mk["steps"].items() if k.endswith("/NRT"))
    return {
        "rows_read": sum((un or {}).get("read", {}).values()) if un else None,   # all raw CSV rows for the source files
        "cell_days": (cb or {}).get("cell_days_total"),                         # fire cell-days per stream (record)
        "rows_unified": tot["in"], "rows_kept": tot["persist"],
        "dropped_low_conf": tot["in"] - tot["conf"], "dropped_type": tot["conf"] - tot["type"],
        "dropped_known_static": tot["type"] - tot["known"], "dropped_persistent": tot["known"] - tot["persist"],
        "masked_static_total": (tot["conf"] - tot["type"]) + (tot["type"] - tot["persist"]),
        "known_static_cells": mk["cells"]["known"], "persistent_cells": mk["cells"]["persist"],
        "nrt_rows": nrt_in, "nrt_removed_known_static": nrt_known,
        "global_outages": (cb or {}).get("global_outages"), "regional_gaps": (cb or {}).get("regional_gaps"),
        "insufficient_months": (cb or {}).get("insufficient"),
        "nrt_overlap_dropped": (un or {}).get("nrt_overlap_dropped"),
    }


def pad_box(b: list[float], f: float = 0.08) -> list[float]:
    dx, dy = (b[2] - b[0]) * f, (b[3] - b[1]) * f
    return [round(b[0] - dx, 3), round(b[1] - dy, 3), round(b[2] + dx, 3), round(b[3] + dy, 3)]


def geography(region: str, rc: dict, web: Path) -> dict:
    """Map helpers derived from the detections themselves (no hand-placed coordinates):
    anchor    median detection position → globe marker on the main landmass
    view_bbox default map view: the clip box, or (country files) the 1.5–98.5 percentile box of detections, padded
    inset     detections outside view_bbox (e.g. Rodrigues) as a secondary view, named in config
    small     view area < 10,000 km² → detection points are exported for every month (points/{region}/{year}.json)
    Also writes live/{region}.json for /api/live: region footprint (H3 cells with historical detections; res from config
    `footprint_res`, 7 for Punjab so the India–Pakistan border stays sharp, 6 otherwise) and the known-static r9 cells."""
    con = connect()
    src = sql_path(path("clean") / f"{region}.parquet")
    filt = sql_path(path("clean") / f"{region}_filtered.parquet")
    med_lat, med_lon, x0, x1, y0, y1 = con.execute(f"""
        SELECT median(lat), median(lon), quantile_cont(lon, 0.015), quantile_cont(lon, 0.985),
               quantile_cont(lat, 0.015), quantile_cont(lat, 0.985) FROM '{filt}'""").fetchone()
    view = rc["bbox"] if rc.get("bbox") else pad_box([x0, y0, x1, y1])
    out: dict = {"anchor": [round(med_lon, 4), round(med_lat, 4)], "view_bbox": view, "inset": None}
    if rc.get("inset_name"):
        wx, wy = view[2] - view[0], view[3] - view[1]   # "far outside" = more than one view-width away (a separate island)
        r = con.execute(f"""SELECT count(*), min(lon), min(lat), max(lon), max(lat) FROM '{filt}'
                            WHERE lon NOT BETWEEN {view[0] - wx} AND {view[2] + wx} OR lat NOT BETWEEN {view[1] - wy} AND {view[3] + wy}""").fetchone()
        if r[0]:
            out["inset"] = {"name": rc["inset_name"], "bbox": pad_box([r[1], r[2], r[3], r[4]], 0.6), "detections": r[0]}
    out["view_area_km2"] = bbox_area_km2(view)
    out["small"] = out["view_area_km2"] < 10_000
    if out["small"]:
        rows = con.execute(f"""SELECT year(solar_date) y, month(solar_date) m, round(lat, 4), round(lon, 4),
                                      CASE WHEN stream IN ('TERRA','AQUA') THEN 0 ELSE 1 END s, day(solar_date) d
                               FROM '{filt}' WHERE year(solar_date) >= 2001 ORDER BY 1, 2""").fetchall()
        by_year: dict = {}
        for y, m, la, lo, s, d in rows:
            by_year.setdefault(y, [[] for _ in range(12)])[m - 1].append([la, lo, s, d])
        for y, months in by_year.items():
            write_json(web / "points" / region / f"{y}.json", {"y": y, "fields": ["lat", "lon", "sensor(0=MODIS,1=VIIRS)", "day"], "m": months}, compact=True)
        out["points_years"] = sorted(by_year)
    res = int(rc.get("footprint_res", 6))   # 7 where a national border crosses the box (Punjab)
    fp = [c for (c,) in con.execute(f"""SELECT DISTINCT h3_h3_to_string(h3_latlng_to_cell(lat, lon, {res})) FROM '{src}'
                                        WHERE NOT is_api ORDER BY 1""").fetchall()]
    static = [c for (c,) in con.execute(f"""SELECT h3_h3_to_string(h3r9) FROM '{sql_path(path('clean') / (region + '_mask.parquet'))}'
                                            ORDER BY 1""").fetchall()]
    bbox = rc.get("bbox") or [round(x, 2) for x in con.execute(f"SELECT min(lon), min(lat), max(lon), max(lat) FROM '{src}'").fetchone()]
    write_json(web / "live" / f"{region}.json", {"region": region, "bbox": bbox, "footprint_res": res, "footprint": fp,
                                                  "static_r9": static}, compact=True)
    con.close()
    return out


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
            if seg == "T":
                flags.append("terra_only")       # Terra × q, before Aqua: shown, hatched, never ranked
            if region in TIMING_CAVEAT_REGIONS and m in (10, 11) and y >= 2022:
                flags.append("overpass_timing")  # docs/punjab_timing.md — documented limitation, numbers unchanged
            s = pm.get((y, m), {})
            months.append({
                "y": y, "m": m,
                "H": r1(h.get("H")), "lo": r1(h.get("lo")), "hi": r1(h.get("hi")),
                "raw_modis": r1(md["C_adj"]), "raw_viirs": r1(vs["C_adj"]) if y >= 2012 else None,
                "hot_modis": int(md["hot"]), "hot_viirs": int(vs["hot"]) if y >= 2012 else None,
                "cov_modis": md["cov"], "cov_viirs": vs["cov"] if y >= 2012 else None,
                "src": seg, "flags": flags,
                "ratio": s.get("ratio"), "pct": s.get("pct"), "rp": s.get("return_period"), "rp_range": s.get("rp_range"),
                "beyond": s.get("beyond_record") or None, "rank": s.get("rank"), "guard": s.get("guard"),
            })

    # the partial (month-to-date) month is judged against the same days of baseline years, as in `latest`
    lt = stats.get("latest") or {}
    if lt.get("mtd") and months and (months[-1]["y"], months[-1]["m"]) == (lt.get("y"), lt.get("m")):
        months[-1].update({"ratio": lt.get("ratio"), "pct": lt.get("pct"), "rp": lt.get("return_period"), "rp_range": lt.get("rp_range"),
                           "beyond": lt.get("beyond_record") or None, "rank": lt.get("rank"), "guard": lt.get("guard")})

    # ---- High detail (QA #44): native VIIRS values next to each 2012+ month (07b_detail) --------------------------
    det = opt_json(out / f"detail_{region}.json")
    detail = None
    if det:
        dm = {(r["y"], r["m"]): r for r in det["months"]}
        for rec in months:
            d = dm.get((rec["y"], rec["m"]))
            if d:
                rec.update({"V": r1(d["V"]), "V_lo": r1(d["V_lo"]), "V_hi": r1(d["V_hi"]), "V_ratio": d["ratio"], "V_pct": d["pct"],
                            "V_rp": d["rp"], "V_rp_range": d["rp_range"], "V_beyond": d["beyond"] or None,
                            "V_rank": d["rank"], "V_guard": d["guard"]})
        detail = {k: det[k] for k in ("baseline", "unit", "climatology", "latest", "latest_complete", "annual",
                                      "similar_years", "similar_detail", "adds")}
        detail["first"] = f"{det['months'][0]['y']}-{det['months'][0]['m']:02d}"

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
    off = {s: set(v) for s, v in ((opt_json(out / f"cube_{region}.json") or {}).get("off_days") or {}).items()}
    side: dict = {}
    for rec in months:
        y, m = rec["y"], rec["m"]
        nd = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(1)).day
        series = {"modis": [by_day.get((dt.date(y, m, d), "MODIS"), 0) for d in range(1, nd + 1)]}
        if y >= 2012:
            series["viirs"] = [by_day.get((dt.date(y, m, d), viirs_stream(y, m)), 0) for d in range(1, nd + 1)]
        # days the primary stream was not operating (outage / regional gap) → hatched in the drawer, not a zero
        ps = {"T": "TERRA", "M": "AQUA", "V": "SNPP", "V2": "N20"}[segment(y, m)]
        streams = ["TERRA", "AQUA"] if ps == "AQUA" else [ps]   # MODIS: a day is "off" only if both are off
        gaps = [d for d in range(1, nd + 1) if all(str(dt.date(y, m, d)) in off.get(s, set()) for s in streams)]
        if gaps:
            series["off"] = gaps
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

    # ---- globe layer (QA #1): H3 res 4 (~1,770 km²) monthly MODIS-equivalent fire-days: res-6 cell-days of the primary
    # stream summed per parent, then scaled so each month's parents add up to H (the ratio and the coverage adjustment
    # C·D/O at once) — the glow uses exactly the published record, with no 2012 seam
    par = dict(con.execute("SELECT c, h3_cell_to_parent(c, 4) FROM (SELECT unnest(?::UBIGINT[]) c)", [cells]).fetchall())
    g = (cmo.with_columns(pl.col("h3r6").replace_strict(par, return_dtype=pl.UInt64).alias("p"))
         .group_by(["y", "m", "p"]).agg(pl.col("n_days").sum().alias("n")))
    gcells = sorted(g["p"].unique().to_list())
    gid = {c: i for i, c in enumerate(gcells)}
    gstr = [s for (s,) in con.execute("SELECT h3_h3_to_string(c) FROM (SELECT unnest(?::UBIGINT[]) c)", [gcells]).fetchall()]
    tot = {(yy, mm): float(nn) for yy, mm, nn in g.group_by(["y", "m"]).agg(pl.col("n").sum()).iter_rows()}
    hm = {(rec["y"], rec["m"]): rec["H"] for rec in months}
    gm: dict = {}
    for r in g.iter_rows(named=True):
        h, t = hm.get((r["y"], r["m"])), tot.get((r["y"], r["m"]), 0)
        if h is None or t <= 0:
            continue
        v = r["n"] * h / t
        v = round(v) if v >= 10 else round(v, 1)   # keeps the file small; one decimal only where it matters
        if v > 0:
            gm.setdefault(f"{r['y']:04d}-{r['m']:02d}", []).extend([gid[r["p"]], v])
    globe = {"cells": gstr, "m": gm}

    # ---- High-detail hexes (QA #44): H3 res 7 (~5 km²), native VIIRS, 2012+, primary VIIRS stream per month ---------
    clean_p7 = sql_path(path("clean") / f"{region}_filtered.parquet")
    vkeep = pl.DataFrame([{"y": r["y"], "m": r["m"], "stream": viirs_stream(r["y"], r["m"])} for r in months if r["y"] >= 2012])
    con.register("vkeep", vkeep.to_arrow())
    c7 = pl.DataFrame(con.execute(f"""
        SELECT h3_latlng_to_cell(lat, lon, 7) AS c, year(solar_date) AS y, month(solar_date) AS m, count(DISTINCT solar_date) AS n
        FROM '{clean_p7}' f JOIN vkeep k ON year(f.solar_date) = k.y AND month(f.solar_date) = k.m AND f.stream = k.stream
        GROUP BY 1, 2, 3""").fetchall(), schema=["c", "y", "m", "n"], orient="row")
    cells7 = sorted(c7["c"].unique().to_list())
    cid7 = {c: i for i, c in enumerate(cells7)}
    strs7 = [s for (s,) in con.execute("SELECT h3_h3_to_string(c) FROM (SELECT unnest(?::UBIGINT[]) c)", [cells7]).fetchall()]
    write_json(web / "hexes7" / region / "cells.json", strs7, compact=True)
    for y, part in c7.group_by("y"):
        y = y[0]
        mm = [[] for _ in range(12)]
        for r in part.iter_rows(named=True):
            mm[r["m"] - 1] += [cid7[r["c"]], int(r["n"])]
        write_json(web / "hexes7" / region / f"{y}.json", {"y": y, "m": mm}, compact=True)

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
        "k": ({**{k: cm["k"][k] for k in ("month", "lo", "hi", "B", "A", "raw_month", "pool", "tau")},
               # months whose rate rests on < 200 S-NPP fire-days in the window: shown as "few fires — low reliability" (QA #45)
               "low_n": [b < LOW_N_FIREDAYS for b in cm["k"]["B"]], "low_n_threshold": LOW_N_FIREDAYS} if cm else
              {"month": [], "lo": [], "hi": [], "B": []}),
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
        "quality": quality(region),
        "geo": geography(region, rc, web),
        "caveats": {"overpass_timing": TIMING_CAVEAT if region in TIMING_CAVEAT_REGIONS else None,
                    "terra_only": "Terra only (before Aqua, Jan 2001 – Jun 2002) — wider uncertainty; not ranked"},
        "hotspot_months": [f"{r['y']:04d}-{r['m']:02d}" for r in months[-HOTSPOT_MONTHS:]],
        "hex_years": sorted({r["y"] for r in months}),
        "harmonized": bool(harm),
        "detail": detail,
    }
    if rc.get("study_check"):   # Round 5B: compare with a published study (config-driven; only Tanzania so far)
        doc["study_check"] = study_check(months, valid.get("summary") or {}, rc["study_check"])
    write_json(web / "regions" / f"{region}.json", doc, compact=True)
    return {"id": region, "name": rc["name"], "bbox": bbox, "months": len(months), "method": method, "globe": globe,
            "harmonized": bool(harm), "first": f"{months[0]['y']}-{months[0]['m']:02d}", "last": latest_key,
            "latest": stats.get("latest"), "latest_complete": stats.get("latest_complete"), "doc": doc}


def study_check(months: list[dict], vs: dict, sc: dict) -> dict:
    """Mean annual fire-days in two periods (harmonized H and raw MODIS-only Terra∪Aqua cell-days) + the naive raw
    MODIS→VIIRS step at 2012 from V3. Only years where BOTH series have all 12 months are used (2012 lacks January
    data, so it drops out); the years actually used are reported."""
    def complete(y: int) -> bool:
        rs = [r for r in months if r["y"] == y]
        return len(rs) == 12 and all(r.get("H") is not None and r.get("raw_modis") is not None for r in rs)
    def mean_annual(key: str, years: list[int]) -> float:
        return sum(sum(r[key] for r in months if r["y"] == y) for y in years) / len(years)
    (a0, a1), (b0, b1) = sc["periods"]
    ya = [y for y in range(a0, a1 + 1) if complete(y)]
    yb = [y for y in range(b0, b1 + 1) if complete(y)]
    out = {"study": sc["study"], "periods": sc["periods"], "years_a": [ya[0], ya[-1], len(ya)], "years_b": [yb[0], yb[-1], len(yb)],
           "dropped": sorted(set(range(a0, a1 + 1)) - set(ya) | set(range(b0, b1 + 1)) - set(yb))}
    for key, name in (("H", "harmonized"), ("raw_modis", "modis_only")):
        A, B = mean_annual(key, ya), mean_annual(key, yb)
        out[name] = {"mean_a": round(A, 1), "mean_b": round(B, 1), "change_pct": round(100 * (B / A - 1), 1)}
    out["raw_step_2012_pct"] = vs.get("step_raw_pct")
    out["note"] = ("Areas differ: the study covers Tanzania's miombo woodlands; this record covers the whole country. "
                   "MODIS-only after 2020 is affected by Terra/Aqua orbit drift.")
    return out


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
                         "V_native": mrec.get("V"), "V_lo": mrec.get("V_lo"), "V_hi": mrec.get("V_hi"),
                         "method": d["method"], "calib_version": d["calib_version"]})
    df = pl.DataFrame(rows, infer_schema_length=None)
    df.write_parquet(ds / "harmonized_monthly_regions_v1.parquet")
    csv = ds / "harmonized_monthly_regions_v1.csv"
    with csv.open("w", encoding="utf-8", newline="") as fh:
        fh.write(f"# {CITATION} Units: H = fire cell-days (MODIS-equivalent; H3 res-6 cell x solar day); V_native = High detail, native VIIRS 375 m fire cell-days (S-NPP-equivalent, 2012+, not converted). "
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
    timing = opt_json(path("out") / "punjab_timing.json")
    if timing:
        sources = timing.pop("_sources", [])
        write_json(ds / "punjab_timing_v1.json", {"caveat": TIMING_CAVEAT, "checks": timing, "sources": sources}, compact=True)


def main() -> None:
    cfg = config()
    web = path("web")
    data_end = max(region_end(r) for r in published_regions())
    regs = [export_region(r, rc, region_end(r), web) for r, rc in cfg["regions"].items() if r in published_regions()]
    write_dataset(regs, web)
    write_json(web / "globe.json", {"res": 4, "unit": "fire cell-days (MODIS-equivalent), res-4 parent sums",
                                    "regions": {r["id"]: r.pop("globe") for r in regs}}, compact=True)
    write_json(web / "meta.json", {
        "version": cfg["version"], "data_end": str(data_end), "citation": CITATION,
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "regions": [{k: v for k, v in r.items() if k != "doc"} for r in regs]})
    for r in regs:
        print(r["id"], r["method"], r["months"], r["last"], "harmonized" if r["harmonized"] else "RAW ONLY")


if __name__ == "__main__":
    main()
