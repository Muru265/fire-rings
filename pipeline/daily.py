"""Daily data update (Round 6) — run by .github/workflows/daily.yml once a day. Touches ONLY the months the daily job owns.

Uses ONLY committed files + FIRMS area-API calls (data/ is never in the repo):
 1. fetch this month's near-real-time detections for every published region's box — VIIRS NOAA-20 (the record's current
    stream: H = k · k′ · NOAA-20 from 2026-11, config `harmonized_segments`) and MODIS (Terra + Aqua, shown next to it);
 2. apply the record's filters (low confidence dropped; known-static H3 res-9 cells and the region footprint from
    web/public/data/v1/live/{id}.json) and count fire-days per H3 res-6 cell on the solar date (UTC + lon/15 h);
 3. coverage adjustment as in 04_cube (C* = C·D/O, "insufficient" when O/D < 0.6). Operating-days proxy: a satellite
    is operating on a UTC day if it delivered ≥1 detection (any confidence) in ANY of the region boxes fetched this run;
 4. H = k · k′ · C*(NOAA-20) with the FROZEN published ratios (pipeline/assets/daily/{id}.json — no recalibration),
    a 90 % range from the stored bootstrap ratio draws × Poisson, and "Is this normal?" exactly as 07_stats / 07b_detail:
    month-to-date vs the same days 1..D of the 2003–2022 baseline years (High detail: 2013–2022);
 5. write the current month row (and finalize last month on the first run of a new month), `latest`, `latest_complete`,
    this year's annual total, `daily`, daily/{id}.json, meta.json ("last_update"), the open CSV/parquet; then re-run
    09_watch.py and 10_api.py, which read only the published JSON.
Months before config `daily.first_month` are never written (the Long-term record; snapshot test).
The prediction model is NOT retrained here (monthly: pipeline/retrain.py).

Usage: python pipeline/daily.py [--today YYYY-MM-DD] [--no-fetch] [--build-assets]
  --build-assets  LOCAL ONLY (needs data/): write pipeline/assets/daily/{id}.json from the pipeline outputs
  --today         pretend today is this date (data end = the day before)
The FIRMS key is read from the FIRMS_MAP_KEY environment variable and is never printed or logged.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import datetime as dt
import importlib
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import h3
import numpy as np
import requests

PIPE = Path(__file__).resolve().parent
ROOT = PIPE.parent
sys.path.insert(0, str(PIPE))
from lib.common import config, read_json, write_json  # noqa: E402
from lib.coverage import adjust  # noqa: E402

S = importlib.import_module("07_stats")            # month_stats (same "Is this normal?" maths)
WEB = ROOT / "web" / "public" / "data" / "v1"
ASSETS = PIPE / "assets" / "daily"
CACHE = ROOT / "data" / "raw_daily"
SOURCES = {"N20": "VIIRS_NOAA20_NRT", "MODIS": "MODIS_NRT"}
CHUNK_DAYS = 5                 # the FIRMS area API accepts a day range of 1–5
MAX_CALLS = 260                # hard budget per run (7 regions × 2 sources × ≤ 7 chunks × 2 months at a month change)
TIMING_CAVEAT_REGIONS = {"punjab"}
DETAIL_START, DETAIL_BASE = 2012, (2013, 2022)
calls = 0


def mkey(y: int, m: int) -> str:
    return f"{y:04d}-{m:02d}"


def ndays(y: int, m: int) -> int:
    return calendar.monthrange(y, m)[1]


def next_month(y: int, m: int) -> tuple[int, int]:
    return (y + 1, 1) if m == 12 else (y, m + 1)


def r1(x):
    return None if x is None else round(float(x), 1)


# ------------------------------------------------------------------------------------------------ assets (local only)
def build_assets() -> None:
    """Freeze, per region, what the daily job needs and cannot recompute without data/: the UNROUNDED ratios, the
    bootstrap draws of k·k′ (same seed and order as 05_calibrate), the daily cell-days of the baseline years (same-days
    comparison), and this + last year's month draws (annual 90 % range). Checked against the published files."""
    import polars as pl
    cal = importlib.import_module("05_calibrate")
    cfg = config()
    cc, st = cfg["calibration"], cfg["stats"]
    b0, b1 = st["baseline"]
    out = ROOT / "data" / "out"
    meta = read_json(WEB / "meta.json")
    for reg in meta["regions"]:
        rid = reg["id"]
        doc = read_json(WEB / "regions" / f"{rid}.json")
        method = doc["method"]
        cube = cal.load(rid)
        rng = np.random.default_rng(cc["seed"])
        nb = cc["bootstrap_n"]
        fk = cal.fit(*cal.matrix(cube, "MODIS", "SNPP", cc["window"])[:2], cc["tau_grid"], nb, rng, method)
        cal.fit(*cal.matrix(cube, "MODIS", "TERRA", cc["q_window"])[:2], cc["tau_grid"], nb, rng, method)   # keeps rng order
        fp = cal.fit(*cal.matrix(cube, "SNPP", "N20", cc["kprime_window"])[:2], cc["tau_grid"], nb, rng, method)
        assert fk["json"]["month"] == doc["k"]["month"], f"{rid}: k refit differs from the published k"
        assert fp["json"]["month"] == doc["kprime"]["month"], f"{rid}: k′ refit differs from the published k′"
        kd = fk["draws"] * fp["draws"]
        daily = pl.read_parquet(ROOT / "data" / "cube" / f"{rid}_daily.parquet")
        dmap = {(r["date"], r["stream"]): int(r["cells"]) for r in daily.iter_rows(named=True)}
        base_daily = {}
        for y in range(b0, b1 + 1):
            for m in range(1, 13):
                stream = "MODIS" if y < 2012 else "SNPP"
                base_daily[mkey(y, m)] = [dmap.get((dt.date(y, m, d), stream), 0) for d in range(1, ndays(y, m) + 1)]
        # this + last year's months: unrounded H/V and their draws (for the annual 90 % range)
        de = dt.date.fromisoformat(doc["data_end"])
        years = (de.year - 1, de.year)
        h = pl.read_parquet(out / f"harmonized_{rid}_{method}.parquet").to_dicts()
        hd = np.load(out / f"hdraws_{rid}_{method}.npy")
        keep = {"H": {}, "V": {}, "H_draws": {}, "V_draws": {}}
        for i, r in enumerate(h):
            if r["y"] in years and r["H"] is not None:
                keep["H"][mkey(r["y"], r["m"])] = r["H"]
                keep["H_draws"][mkey(r["y"], r["m"])] = [round(float(v), 2) for v in hd[i]]
        # High detail draws: replay 07b_detail's generator in the same order
        kp_r = np.array(doc["kprime"]["month"])
        rng7 = np.random.default_rng(cc["seed"] + 7)
        for y in range(DETAIL_START, de.year + 1):
            for m in range(1, 13):
                if (y, m) > (de.year, de.month):
                    break
                src = cal.segment_of(y, m, cfg["harmonized_segments"])
                base, scale = (cube.get((y, m, "SNPP"), np.nan), 1.0) if src == "V" else (cube.get((y, m, "N20"), np.nan), float(kp_r[m - 1]))
                if np.isnan(base):
                    continue
                d = scale * rng7.poisson(base, nb)
                if y in years:
                    keep["V"][mkey(y, m)] = scale * base
                    keep["V_draws"][mkey(y, m)] = [round(float(v), 2) for v in d]
        last = mkey(de.year, de.month)
        mrec = doc["months"][-1]
        lo, hi = np.percentile(np.array(keep["H_draws"][last]), [5, 95])
        assert abs(lo - mrec["lo"]) <= 0.1 and abs(hi - mrec["hi"]) <= 0.1, f"{rid}: stored H draws do not match {last}"
        lo, hi = np.percentile(np.array(keep["V_draws"][last]), [5, 95])
        assert abs(lo - mrec["V_lo"]) <= 0.1 and abs(hi - mrec["V_hi"]) <= 0.1, f"{rid}: stored V draws do not match {last}"
        asset = {"region": rid, "method": method, "seed": cc["seed"], "n_boot": nb,
                 "note": "Frozen inputs for pipeline/daily.py (written by daily.py --build-assets from the pipeline outputs).",
                 "k": [float(x) for x in fk["k"]], "kprime": [float(x) for x in fp["k"]],
                 "k_pub": doc["k"]["month"], "kprime_pub": doc["kprime"]["month"],
                 "kk_draws": [[round(float(v), 6) for v in kd[:, i]] for i in range(12)],
                 "baseline_daily": base_daily, "months": keep}
        write_json(ASSETS / f"{rid}.json", asset, compact=True)
        print(f"{rid:<13} assets written: k/k′ match, {len(base_daily)} baseline months, draws for {sorted(keep['H'])[0]}…{last}", flush=True)


# ------------------------------------------------------------------------------------------------ fetch + count
def fetch_chunk(key: str, source: str, bbox: list[float], start: dt.date, days: int, use_cache: bool) -> str:
    global calls
    f = CACHE / f"{source}_{'_'.join(f'{v:g}' for v in bbox)}_{start}_{days}.csv"
    if use_cache and f.exists():
        return f.read_text(encoding="utf-8")
    if not key:
        raise SystemExit("FIRMS_MAP_KEY is not set (GitHub: Settings → Secrets and variables → Actions)")
    if calls >= MAX_CALLS:
        raise SystemExit(f"FIRMS call budget ({MAX_CALLS}) reached — stopping without writing")
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{','.join(f'{v:g}' for v in bbox)}/{days}/{start}"
    for attempt in range(4):
        calls += 1
        try:
            r = requests.get(url, timeout=90)
            text = r.text
            if r.ok and text.startswith("latitude"):
                CACHE.mkdir(parents=True, exist_ok=True)
                f.write_text(text, encoding="utf-8")
                time.sleep(1.0)
                return text
            print(f"   FIRMS HTTP {r.status_code}: {text[:80].replace(key, '***')}", flush=True)
        except requests.RequestException as e:
            print(f"   FIRMS {type(e).__name__}", flush=True)
        time.sleep(5 * (attempt + 1))
    raise SystemExit("FIRMS unavailable — stopping without writing")


def low_conf(stream: str, conf: str) -> bool:
    c = (conf or "").strip().lower()
    if stream == "N20":
        return c in ("l", "low", "")
    try:
        return float(c) < 30          # MODIS 0–29 = low (02_unify)
    except ValueError:
        return True


def sat_of(stream: str, sat: str) -> str:
    if stream == "N20":
        return "N20"
    s = (sat or "").strip().upper()
    if s.startswith("T"):
        return "TERRA"
    if s.startswith("A"):
        return "AQUA"
    raise SystemExit(f"unknown MODIS satellite code {sat!r} — stopping")


def collect(rid: str, start: dt.date, end: dt.date, key: str, use_cache: bool, op: dict) -> dict:
    """Kept detections → {stream: {"days": {solar_date: set(h3r6)}, "hot": {solar_date: n}}}; fills op[sat] with UTC days."""
    live = read_json(WEB / "live" / f"{rid}.json")
    foot, res, static = set(live["footprint"]), int(live["footprint_res"]), set(live["static_r9"])
    out = {}
    for stream, source in SOURCES.items():
        days: dict = {}
        hot: dict = {}
        cur = start
        while cur <= end:
            n = min(CHUNK_DAYS, (end - cur).days + 1)
            text = fetch_chunk(key, source, live["bbox"], cur, n, use_cache)
            for r in csv.DictReader(io.StringIO(text)):
                sat = sat_of(stream, r.get("satellite", ""))
                op.setdefault(sat, set()).add(dt.date.fromisoformat(r["acq_date"]))
                if low_conf(stream, r.get("confidence", "")):
                    continue
                if (r.get("type") or "").strip() in ("1", "2", "3"):
                    continue
                lat, lon = float(r["latitude"]), float(r["longitude"])
                hhmm = r["acq_time"].zfill(4)
                t = dt.datetime.fromisoformat(f"{r['acq_date']}T{hhmm[:2]}:{hhmm[2:]}:00") + dt.timedelta(hours=lon / 15)
                if h3.latlng_to_cell(lat, lon, res) not in foot or h3.latlng_to_cell(lat, lon, 9) in static:
                    continue
                sd = t.date()
                days.setdefault(sd, set()).add(h3.latlng_to_cell(lat, lon, 6))
                hot[sd] = hot.get(sd, 0) + 1
            cur += dt.timedelta(days=n)
        out[stream] = {"days": days, "hot": hot}
    return out


def measure(obs: dict, op: dict, y: int, m: int, D: int, min_ratio: float) -> dict:
    """Monthly cell-days (distinct cell × solar day) on days 1..D, coverage-adjusted as in 04_cube."""
    days = [dt.date(y, m, d) for d in range(1, D + 1)]
    res = {}
    for stream in ("N20", "MODIS"):
        per_day = [len(obs[stream]["days"].get(d, ())) for d in days]
        hot = sum(obs[stream]["hot"].get(d, 0) for d in days)
        if stream == "N20":
            O = float(sum(d in op.get("N20", set()) for d in days))
        else:
            O = (sum(d in op.get("TERRA", set()) for d in days) + sum(d in op.get("AQUA", set()) for d in days)) / 2
        c_adj, cov, flag = adjust(sum(per_day), D, O, min_ratio)
        cells: dict = {}
        for d in days:
            for c in obs[stream]["days"].get(d, ()):
                cells[c] = cells.get(c, 0) + 1
        res[stream] = {"C": sum(per_day), "C_adj": c_adj, "cov": round(cov, 4), "flag": flag, "hot": hot, "per_day": per_day,
                       "cells": cells}
    res["off"] = [d.day for d in days if d not in op.get("N20", set())]
    return res


# ------------------------------------------------------------------------------------------------ statistics
def rank_col(doc: dict, field: str, m: int, y_cur: int, start: int, exclude_cur: bool) -> list[float]:
    return [r[field] for r in doc["months"] if r["m"] == m and r["y"] >= start and r.get(field) is not None
            and r["src"] != "T" and not (exclude_cur and r["y"] == y_cur)]


def judge(x, draws, doc, field, y, m, D, mtd, asset, st, kind):
    """Same maths as 07_stats (field H) / 07b_detail (field V). Returns month_stats + rank + rank_of (+ days, baseline_kind)."""
    b0, b1 = st["baseline"] if kind == "H" else DETAIL_BASE
    if mtd:
        k_pub = asset["k_pub"]
        mb = []
        for yy in range(b0, b1 + 1):
            scale = 1.0 if (kind == "V" or yy < 2012) else k_pub[m - 1]
            mb.append(scale * sum(asset["baseline_daily"][mkey(yy, m)][:D]))
        mb = np.array(mb, float)
        s = S.month_stats(x, draws, mb, st["guard_median_lt"], st["guard_value_lt"])
        s.update({"rank": int(np.sum(mb > x)) + 1, "rank_of": len(mb) + 1, "days": D,
                  "baseline_kind": f"same days 1–{D} of baseline years" if kind == "H" else f"same days 1–{D} of {b0}–{b1}"})
        return s
    base = np.array([r[field] for r in doc["months"] if r["m"] == m and b0 <= r["y"] <= b1 and r.get(field) is not None], float)
    s = S.month_stats(x, draws, base, st["guard_median_lt"], st["guard_value_lt"])
    col = rank_col(doc, field, m, y, int(config()["record"]["start"][:4]) if kind == "H" else DETAIL_START, False)
    s.update({"rank": int(np.sum(np.array(col) > x)) + 1, "rank_of": len(col)})
    return s


def annual(doc: dict, asset: dict, y: int, kind: str, mtd_y: int | None) -> dict | None:
    field = "H" if kind == "H" else "V"
    recs = [r for r in doc["months"] if r["y"] == y and (kind == "H" or r["y"] >= DETAIL_START)]
    ks = [mkey(r["y"], r["m"]) for r in recs]
    vals = [asset["months"][field].get(k_, r.get(field)) for k_, r in zip(ks, recs)]
    if None in vals or not all(k_ in asset["months"][f"{field}_draws"] for k_ in ks):
        return None
    tot = np.nansum(np.array([asset["months"][f"{field}_draws"][k_] for k_ in ks], float), axis=0)
    lo, hi = np.percentile(tot, [5, 95])
    complete = len(ks) == 12 and y != mtd_y
    out = {"y": y, "H": round(float(sum(vals)), 1), "lo": round(float(lo), 1), "hi": round(float(hi), 1), "complete": complete, "months": len(ks)}
    if kind == "H":
        t_only = sum(1 for r in recs if r["src"] == "T")
        out.update({"terra_only_months": t_only, "rankable": complete and t_only == 0})
    else:
        out["rankable"] = complete
    return out


def similar(doc: dict, field: str, ly: int, upto: int, start: int, top: int) -> list[dict]:
    H = {(r["y"], r["m"]): r.get(field) for r in doc["months"]}
    src = {(r["y"], r["m"]): r["src"] for r in doc["months"]}
    sims = []
    if upto >= 3:
        cur = np.array([H.get((ly, m)) for m in range(1, upto + 1)], float)
        for y in range(start, ly):
            other = np.array([H.get((y, m)) for m in range(1, upto + 1)], float)
            if np.isnan(other).any() or np.isnan(cur).any() or np.std(other) == 0:
                continue
            if field == "H" and any(src.get((y, m)) == "T" for m in range(1, upto + 1)):
                continue
            sims.append((y, float(np.corrcoef(cur, other)[0, 1])))
    sims.sort(key=lambda t: -t[1])
    return [{"y": y, "r": round(r, 3)} for y, r in sims[:top]]


# ------------------------------------------------------------------------------------------------ map layers
def update_maps(rid: str, y: int, m: int, cells: dict, H: float | None) -> None:
    """Current month only, as 08_export does for every month: (a) Explore hexes = NOAA-20 fire-days per H3 res-6 cell;
    (b) globe glow = those cell-days summed per res-4 parent and scaled so the parents add up to H."""
    key = mkey(y, m)
    hdir = WEB / "hexes" / rid
    # the cell list is also the prediction model's cell universe, so it is never changed here: a cell that never had
    # fire in 25 years is left off the hexagon map for now (its fire-days still count in H and in the globe glow)
    cid = {c: i for i, c in enumerate(read_json(hdir / "cells.json"))}
    yf = hdir / f"{y}.json"
    yd = read_json(yf) if yf.exists() else {"y": y, "m": [[] for _ in range(12)]}
    known = sorted((c for c in cells if c in cid), key=lambda c: cid[c])
    yd["m"][m - 1] = [v for c in known for v in (cid[c], int(cells[c]))]
    write_json(yf, yd, compact=True)
    g = read_json(WEB / "globe.json")
    gr = g["regions"][rid]
    gid = {c: i for i, c in enumerate(gr["cells"])}
    par: dict = {}
    for c, n in cells.items():
        p4 = h3.cell_to_parent(c, 4)
        par[p4] = par.get(p4, 0) + n
    t = sum(par.values())
    arr = []
    if H is not None and t > 0:
        for p4 in sorted(par, key=lambda c: (c not in gid, gid.get(c, 0), c)):
            v = par[p4] * H / t
            v = round(v) if v >= 10 else round(v, 1)
            if v > 0:
                if p4 not in gid:
                    gid[p4] = len(gr["cells"])
                    gr["cells"].append(p4)
                arr += [gid[p4], v]
    if arr:
        gr["m"][key] = arr
    else:
        gr["m"].pop(key, None)
    write_json(WEB / "globe.json", g, compact=True)


# ------------------------------------------------------------------------------------------------ update one region
def update_region(rid: str, obs_by_month: dict, op: dict, data_end: dt.date, cfg: dict, now: str) -> dict:
    st, first_owned = cfg["stats"], cfg["daily"]["first_month"]
    doc = read_json(WEB / "regions" / f"{rid}.json")
    asset = read_json(ASSETS / f"{rid}.json")
    side = read_json(WEB / "daily" / f"{rid}.json")
    nb = int(asset["n_boot"])
    targets = sorted(obs_by_month)
    for (y, m) in targets:
        key = mkey(y, m)
        assert key >= first_owned, f"{rid}: refusing to write {key} (before daily.first_month {first_owned})"
        nd = ndays(y, m)
        D = min(nd, (data_end - dt.date(y, m, 1)).days + 1)
        meas = measure(obs_by_month[(y, m)], op, y, m, D, cfg["cube"]["coverage_min_ratio"])
        n20, mod = meas["N20"], meas["MODIS"]
        i = m - 1
        rng = np.random.default_rng(int(asset["seed"]) + y * 100 + m)
        if n20["C_adj"] is None:
            H = lo = hi = V = V_lo = V_hi = None
            hdraw = vdraw = np.full(nb, np.nan)
        else:
            H = asset["k"][i] * asset["kprime"][i] * n20["C_adj"]
            hdraw = np.array(asset["kk_draws"][i]) * rng.poisson(n20["C_adj"], nb)
            lo, hi = np.percentile(hdraw, [5, 95])
            V = float(asset["kprime_pub"][i]) * n20["C_adj"]
            vdraw = float(asset["kprime_pub"][i]) * rng.poisson(n20["C_adj"], nb)
            V_lo, V_hi = np.percentile(vdraw, [5, 95])
        flags = (["mtd"] if D < nd else []) + ["provisional"]
        if n20["flag"] == "insufficient":
            flags.append("insufficient")
        if H is not None and (hi - lo) / max(H, 1.0) > cfg["calibration"]["uncertain_rel_width"]:
            flags.append("uncertain")
        if rid in TIMING_CAVEAT_REGIONS and m in (10, 11) and y >= 2022:
            flags.append("overpass_timing")
        rec = {"y": y, "m": m, "H": r1(H), "lo": r1(lo), "hi": r1(hi), "raw_modis": r1(mod["C_adj"]), "raw_viirs": r1(n20["C_adj"]),
               "hot_modis": int(mod["hot"]), "hot_viirs": int(n20["hot"]), "cov_modis": mod["cov"], "cov_viirs": n20["cov"],
               "src": "V2", "flags": flags}
        idx = next((j for j, r in enumerate(doc["months"]) if (r["y"], r["m"]) == (y, m)), None)
        if idx is None:
            assert (doc["months"][-1]["y"], doc["months"][-1]["m"]) < (y, m)
            doc["months"].append(rec)
        else:
            doc["months"][idx] = rec
        mtd_stats = (D < nd) and data_end.day < 28 and (y, m) == (data_end.year, data_end.month)
        for kind, x, draws in (("H", H, hdraw), ("V", V, vdraw)):
            if x is None:
                s = {"ratio": None, "pct": None, "return_period": None, "rp_range": None, "beyond_record": False, "guard": None, "rank": None, "rank_of": None}
            else:
                s = judge(x, draws, doc, kind, y, m, D, mtd_stats, asset, st, kind)
            p = "" if kind == "H" else "V_"
            if kind == "V":
                rec.update({"V": r1(V), "V_lo": r1(V_lo), "V_hi": r1(V_hi)})
            rec.update({f"{p}ratio": s["ratio"], f"{p}pct": s["pct"], f"{p}rp": s["return_period"], f"{p}rp_range": s["rp_range"],
                        f"{p}beyond": s["beyond_record"] or None, f"{p}rank": s["rank"], f"{p}guard": s["guard"]})
            rec[f"_{kind}stats"] = s
        asset["months"]["H"][key] = H
        asset["months"]["V"][key] = V
        asset["months"]["H_draws"][key] = [round(float(v), 2) for v in hdraw]
        asset["months"]["V_draws"][key] = [round(float(v), 2) for v in vdraw]
        series = {"modis": mod["per_day"] + [0] * (nd - D), "viirs": n20["per_day"] + [0] * (nd - D)}
        if meas["off"]:
            series["off"] = meas["off"]
        side[key] = series
        update_maps(rid, y, m, n20["cells"], H)
        print(f"{rid:<13} {key} days 1–{D}: N20 C={n20['C']} cov={n20['cov']} → H={r1(H)} [{r1(lo)}–{r1(hi)}] "
              f"ratio={rec['ratio']} pct={rec['pct']} rank={rec['rank']} flags={flags} | MODIS C={mod['C']}", flush=True)

    # latest / latest_complete (07_stats + 07b_detail shapes)
    last = doc["months"][-1]
    mtd = "mtd" in last["flags"] and data_end.day < 28
    for kind in ("H", "V"):
        tgt = doc if kind == "H" else doc["detail"]
        p = "" if kind == "H" else "V_"
        vk = "H" if kind == "H" else "V"
        s = last.get(f"_{kind}stats")
        if s is not None:
            if kind == "H":
                lt = {"y": last["y"], "m": last["m"], **{k: s[k] for k in ("ratio", "median", "pct", "return_period", "rp_range", "beyond_record", "guard", "rank", "rank_of") if k in s},
                      "mtd": mtd, "value": last["H"], "lo": last["lo"], "hi": last["hi"], "provisional": True}
            else:
                lt = {"y": last["y"], "m": last["m"], "mtd": mtd, "value": last["V"], "lo": last["V_lo"], "hi": last["V_hi"], "provisional": True,
                      "ratio": s["ratio"], "pct": s["pct"], "rp": s["return_period"], "rp_range": s["rp_range"], "beyond": s["beyond_record"],
                      "guard": s["guard"], "rank": s["rank"], "rank_of": s["rank_of"], **({"median": s["median"]} if mtd else {})}
            if mtd:
                lt.update({"days": s["days"], "baseline_kind": s["baseline_kind"]})
            tgt["latest"] = lt
        # latest complete: newest full month with a ratio (changes only when a month is finalized)
        for r in reversed(doc["months"][:-1] if mtd else doc["months"]):
            s2 = r.get(f"_{kind}stats")
            if s2 is None:
                if r.get(f"{p}ratio") is not None:
                    break                       # untouched month → keep the published latest_complete
                continue
            if s2["ratio"] is None:
                continue
            if kind == "H":
                tgt["latest_complete"] = {"y": r["y"], "m": r["m"], **{k: s2[k] for k in ("ratio", "median", "pct", "return_period", "rp_range", "beyond_record", "guard", "rank", "rank_of") if k in s2},
                                          "value": r["H"], "lo": r["lo"], "hi": r["hi"], "mtd": False, "provisional": True}
            else:
                tgt["latest_complete"] = {"y": r["y"], "m": r["m"], "mtd": False, "value": r["V"], "lo": r["V_lo"], "hi": r["V_hi"], "provisional": True,
                                          "ratio": s2["ratio"], "pct": s2["pct"], "rp": s2["return_period"], "rp_range": s2["rp_range"],
                                          "beyond": s2["beyond_record"], "guard": s2["guard"], "rank": s2["rank"], "rank_of": s2["rank_of"]}
            break
        # annual totals for the years touched
        for y in sorted({t[0] for t in targets}):
            a = annual(doc, asset, y, kind, last["y"] if mtd else None)
            if a is not None:
                arr = tgt["annual"]
                j = next((j for j, r in enumerate(arr) if r["y"] == y), None)
                if j is None:
                    arr.append(a)
                else:
                    arr[j] = a
        # similar years only move when a month becomes complete
        if any(not ("mtd" in r["flags"]) for r in doc["months"] if (r["y"], r["m"]) in targets):
            upto = last["m"] - 1 if mtd else last["m"]
            sims = similar(doc, vk, last["y"], upto, int(config()["record"]["start"][:4]) if kind == "H" else DETAIL_START, st["similar_years_top"])
            tgt["similar_years"] = [s_["y"] for s_ in sims]
            tgt["similar_detail"] = {"months": f"Jan–{upto}", "years": sims}
    for r in doc["months"]:
        r.pop("_Hstats", None)
        r.pop("_Vstats", None)
    lk = mkey(last["y"], last["m"])
    doc["daily"] = {lk: {k: v for k, v in side[lk].items() if k in ("modis", "viirs")}}
    doc["data_end"] = str(data_end)
    doc["updated"] = now
    write_json(WEB / "regions" / f"{rid}.json", doc, compact=True)
    write_json(WEB / "daily" / f"{rid}.json", side, compact=True)
    write_json(ASSETS / f"{rid}.json", asset, compact=True)
    return doc


# ------------------------------------------------------------------------------------------------ "did anything change?"
STAMPS = {"updated", "last_update", "generated"}


def snapshot() -> dict:
    files = [f for f in WEB.rglob("*") if f.is_file() and f.suffix in (".json", ".csv", ".parquet")] + list(ASSETS.glob("*.json"))
    return {f: f.read_bytes() for f in files}


def _strip(o):
    if isinstance(o, dict):
        return {k: _strip(v) for k, v in o.items() if k not in STAMPS}
    if isinstance(o, list):
        return [_strip(v) for v in o]
    return o


def restore_if_unchanged(before: dict) -> bool:
    """True (and every file put back byte-for-byte) when the run changed nothing but timestamps → no commit."""
    for f in WEB.rglob("*"):
        if f.is_file() and f.suffix in (".json", ".csv") and f not in before:
            return False
    for f, old in before.items():
        new = f.read_bytes() if f.exists() else None
        if new == old or f.suffix == ".parquet":
            continue
        if f.suffix != ".json" or new is None or _strip(json.loads(new)) != _strip(json.loads(old)):
            return False
    for f, old in before.items():
        f.write_bytes(old)
    return True


# ------------------------------------------------------------------------------------------------ dataset + meta
def write_dataset(docs: list[dict]) -> None:
    import polars as pl
    exp = importlib.import_module("08_export")
    rows = []
    for d in docs:
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
    ds = WEB / "dataset"
    df.write_parquet(ds / "harmonized_monthly_regions_v1.parquet")
    with (ds / "harmonized_monthly_regions_v1.csv").open("w", encoding="utf-8", newline="") as fh:
        fh.write(f"# {exp.CITATION} Units: H = fire cell-days (MODIS-equivalent; H3 res-6 cell x solar day); V_native = High detail, native VIIRS 375 m fire cell-days (S-NPP-equivalent, 2012+, not converted). "
                 f"Regions: {', '.join(d['id'] for d in docs)}. Data through {docs[0]['data_end']}. "
                 "Dictionary: /data page.\n")
        fh.write(df.write_csv())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", help="pretend today is YYYY-MM-DD (data end = the day before)")
    ap.add_argument("--no-fetch", action="store_true", help="use only cached FIRMS files (data/raw_daily)")
    ap.add_argument("--build-assets", action="store_true")
    a = ap.parse_args()
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
    except ImportError:
        pass
    if a.build_assets:
        build_assets()
        return
    cfg = config()
    key = os.environ.get("FIRMS_MAP_KEY", "")
    today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(dt.timezone.utc).date()
    data_end = today - dt.timedelta(days=1)
    meta = read_json(WEB / "meta.json")
    rids = [r["id"] for r in meta["regions"]]
    first_owned = cfg["daily"]["first_month"]
    # months to (re)compute: the month of data_end, plus last month while it is still marked month-to-date
    plan = {}
    for rid in rids:
        doc = read_json(WEB / "regions" / f"{rid}.json")
        prev_end = dt.date.fromisoformat(doc["data_end"])
        if data_end < prev_end:
            raise SystemExit(f"{rid}: data end {data_end} is before the published {prev_end} — refusing to go back")
        months = {(data_end.year, data_end.month)}
        last = doc["months"][-1]
        if "mtd" in last["flags"]:
            months.add((last["y"], last["m"]))
        plan[rid] = sorted(t for t in months if mkey(*t) >= first_owned)
    print(f"daily update: data end {data_end} · " + " · ".join(f"{r} {[mkey(*t) for t in plan[r]]}" for r in rids), flush=True)
    watch_before = {r: v["status"] for r, v in read_json(WEB / "watch.json")["regions"].items()}
    before = snapshot()
    op: dict = {}
    obs = {}
    for rid in rids:
        if not plan[rid]:
            continue
        y0, m0 = plan[rid][0]
        start = dt.date(y0, m0, 1) - dt.timedelta(days=1)       # the solar date can fall in the previous UTC day
        obs[rid] = collect(rid, start, data_end, "" if a.no_fetch else key, True, op)
    print(f"FIRMS calls this run: {calls} (budget {MAX_CALLS})", flush=True)
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    docs = []
    for rid in rids:
        if plan[rid]:
            doc = update_region(rid, {t: obs[rid] for t in plan[rid]}, op, data_end, cfg, now)
        else:
            doc = read_json(WEB / "regions" / f"{rid}.json")
        docs.append(doc)
    # meta.json: freshness + each region's latest
    for r, d in zip(meta["regions"], docs):
        r.update({"months": len(d["months"]), "last": mkey(d["months"][-1]["y"], d["months"][-1]["m"]),
                  "latest": d["latest"], "latest_complete": d["latest_complete"]})
    meta["data_end"] = str(data_end)
    meta["last_update"] = now
    meta["update_cadence"] = "daily (current month, NRT); model monthly; Long-term record fixed"
    write_json(WEB / "meta.json", meta)
    write_dataset(docs)
    for step in ("09_watch.py", "10_api.py"):
        r = subprocess.run([sys.executable, str(PIPE / step)], cwd=ROOT, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        if r.returncode != 0:
            raise SystemExit(f"{step} failed")
    if restore_if_unchanged(before):
        print("no change except timestamps — files restored, nothing to commit", flush=True)
    after = {r: v["status"] for r, v in read_json(WEB / "watch.json")["regions"].items()}
    changed = [r for r in rids if watch_before.get(r) != after.get(r)]
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "daily_status_changed.txt").write_text(",".join(changed), encoding="utf-8")
    print(f"Fire Watch status changed: {changed or 'none'}", flush=True)


if __name__ == "__main__":
    main()
