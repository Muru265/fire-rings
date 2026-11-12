"""07b — High-detail view (QA #44): native VIIRS fire-days, 2012 → now, NOT converted to MODIS units.

Input  data/cube/{region}_monthly.parquet, data/cube/{region}_daily.parquet, data/out/calib_{region}.json,
       data/out/validation_{region}.json (chosen method)
Output data/out/detail_{region}.json

V (per month, S-NPP-equivalent fire cell-days, coverage-adjusted exactly like H):
  2012-01..2026-10  S-NPP C*                     (same base the harmonized record multiplies by k)
  2026-11..         k′ · NOAA-20 C*              (existing VIIRS↔VIIRS bridge, so the S-NPP end makes no new seam)
So H = k · V on every VIIRS month: no new calibration is fitted, nothing is fitted on 2020+.
Interval: Poisson counting noise only (P5–P95 of k′·Poisson(base)); there is no MODIS calibration uncertainty here.
Baseline for "typical"/percentiles: 2013–2022 (10 full VIIRS years; 2012 lacks January coverage) — shorter → wider.
Stats reuse 07_stats (Weibull percentile range, return period from the percentile, low-activity guard, rank).
"""
from __future__ import annotations

import datetime as dt
import importlib
import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import published_regions, config, path, read_json, write_json  # noqa: E402
from lib.common import data_end as region_end  # noqa: E402

S = importlib.import_module("07_stats")
C = importlib.import_module("05_calibrate")

START = 2012
BASE = (2013, 2022)
N_DRAWS = 500


def main(regions: list[str]) -> None:
    cfg = config()
    st = cfg["stats"]
    segs = cfg["harmonized_segments"]
    out = path("out")
    for region in regions or published_regions():
        de = region_end(region)
        cube = C.load(region)
        method = read_json(out / f"validation_{region}.json")["summary"]["method"]
        calib = read_json(out / f"calib_{region}.json")["methods"][method]
        kp = np.array(calib["kprime"]["month"])
        kk = np.array(calib["k"]["month"])
        h = {(r["y"], r["m"]): r for r in pl.read_parquet(out / f"harmonized_{region}.parquet").to_dicts()}
        rng = np.random.default_rng(cfg["calibration"]["seed"] + 7)

        months: list[dict] = []
        draws: dict = {}
        for y in range(START, de.year + 1):
            for m in range(1, 13):
                if (y, m) > (de.year, de.month):
                    break
                src = C.segment_of(y, m, segs)
                if src == "V":
                    base, scale = cube.get((y, m, "SNPP"), np.nan), 1.0
                elif src == "V2":
                    base, scale = cube.get((y, m, "N20"), np.nan), float(kp[m - 1])
                else:
                    raise ValueError(f"unexpected segment {src} for {y}-{m:02d}")
                if np.isnan(base):
                    months.append({"y": y, "m": m, "V": None, "V_lo": None, "V_hi": None, "src": src})
                    draws[(y, m)] = np.full(N_DRAWS, np.nan)
                    continue
                V = scale * base
                d = scale * rng.poisson(base, N_DRAWS)
                lo, hi = np.percentile(d, [5, 95])
                months.append({"y": y, "m": m, "V": float(V), "V_lo": float(lo), "V_hi": float(hi), "src": src})
                draws[(y, m)] = d
                # sanity: H = k · V on VIIRS months (same base, same coverage adjustment)
                hr = h.get((y, m))
                if hr and hr["H"] is not None:
                    expect = kk[m - 1] * V
                    assert abs(hr["H"] - expect) <= 1e-3 * max(1.0, expect)  # k is stored rounded to 4 decimals, f"{region} {y}-{m}: H={hr['H']} vs k·V={expect}"

        Vd = {(r["y"], r["m"]): r["V"] for r in months}
        b0, b1 = BASE
        base = {m: np.array([Vd[(y, m)] for y in range(b0, b1 + 1) if Vd.get((y, m)) is not None]) for m in range(1, 13)}
        clim = {"median": [], "p10": [], "p90": [], "n": []}
        for m in range(1, 13):
            b = base[m]
            clim["median"].append(round(float(np.median(b)), 1))
            clim["p10"].append(round(float(np.percentile(b, 10)), 1))
            clim["p90"].append(round(float(np.percentile(b, 90)), 1))
            clim["n"].append(int(len(b)))

        last = months[-1]
        mtd = (last["y"], last["m"]) == (de.year, de.month) and de.day < 28
        for r in months:
            s = S.month_stats(r["V"], draws[(r["y"], r["m"])], base[r["m"]], st["guard_median_lt"], st["guard_value_lt"])
            col = [Vd[(y, r["m"])] for y in range(START, de.year + 1) if Vd.get((y, r["m"])) is not None
                   and not (mtd and (y, r["m"]) == (last["y"], last["m"]))]
            r.update({"ratio": s["ratio"], "pct": s["pct"], "rp": s["return_period"], "rp_range": s["rp_range"],
                      "beyond": s["beyond_record"], "guard": s["guard"],
                      "rank": (int(np.sum(np.array(col) > r["V"])) + 1) if r["V"] is not None else None, "rank_of": len(col)})

        # month-to-date: same days 1..D of baseline years, native S-NPP daily cell-days (no scaling)
        latest = {"y": last["y"], "m": last["m"], "mtd": mtd, "value": None if last["V"] is None else round(last["V"], 1),
                  "lo": None if last["V_lo"] is None else round(last["V_lo"], 1),
                  "hi": None if last["V_hi"] is None else round(last["V_hi"], 1), "provisional": True,
                  **{k: last[k] for k in ("ratio", "pct", "rp", "rp_range", "beyond", "guard", "rank", "rank_of")}}
        if mtd and last["V"] is not None:
            D = de.day
            daily = pl.read_parquet(path("cube") / f"{region}_daily.parquet").filter(pl.col("stream") == "SNPP")
            dmap = {r["date"]: r["cells"] for r in daily.iter_rows(named=True)}
            mb = np.array([sum(dmap.get(dt.date(y, last["m"], d), 0) for d in range(1, D + 1)) for y in range(b0, b1 + 1)], float)
            s = S.month_stats(last["V"], draws[(last["y"], last["m"])], mb, st["guard_median_lt"], st["guard_value_lt"])
            latest.update({"ratio": s["ratio"], "median": s.get("median"), "pct": s["pct"], "rp": s["return_period"],
                           "rp_range": s["rp_range"], "beyond": s["beyond_record"], "guard": s["guard"], "days": D,
                           "baseline_kind": f"same days 1–{D} of {b0}–{b1}",
                           "rank": int(np.sum(mb > last["V"])) + 1, "rank_of": len(mb) + 1})
            last.update({k: latest[k] for k in ("ratio", "pct", "rp", "rp_range", "beyond", "guard", "rank", "rank_of")})
        lcs = [r for r in (months[:-1] if mtd else months) if r["ratio"] is not None]
        lc = lcs[-1]
        latest_complete = {"y": lc["y"], "m": lc["m"], "mtd": False, "value": round(lc["V"], 1), "lo": round(lc["V_lo"], 1),
                           "hi": round(lc["V_hi"], 1), "provisional": (lc["y"], lc["m"]) >= (2026, 8),
                           **{k: lc[k] for k in ("ratio", "pct", "rp", "rp_range", "beyond", "guard", "rank", "rank_of")}}

        annual = []
        for y in sorted({r["y"] for r in months}):
            ks = [(y, m) for m in range(1, 13) if (y, m) in Vd]
            vals = [Vd[k_] for k_ in ks]
            if None in vals:
                annual.append({"y": y, "H": None, "lo": None, "hi": None, "complete": False, "rankable": False,
                               "missing_months": [k_[1] for k_ in ks if Vd[k_] is None]})
                continue
            tot = np.nansum(np.array([draws[k_] for k_ in ks]), axis=0)
            lo, hi = np.percentile(tot, [5, 95])
            complete = len(ks) == 12 and not (mtd and y == last["y"])
            annual.append({"y": y, "H": round(float(sum(vals)), 1), "lo": round(float(lo), 1), "hi": round(float(hi), 1),
                           "complete": complete, "months": len(ks), "rankable": complete})

        # similar years on the native curve (2012+ only)
        ly = last["y"]
        upto = last["m"] - 1 if mtd else last["m"]
        sims = []
        if upto >= 3:
            cur = np.array([Vd.get((ly, m)) for m in range(1, upto + 1)], float)
            for y in range(START, ly):
                other = np.array([Vd.get((y, m)) for m in range(1, upto + 1)], float)
                if np.isnan(other).any() or np.isnan(cur).any() or np.std(other) == 0:
                    continue
                sims.append((y, float(np.corrcoef(cur, other)[0, 1])))
        sims.sort(key=lambda t: -t[1])
        similar = [{"y": y, "r": round(r, 3)} for y, r in sims[: st["similar_years_top"]]]

        # what the new satellite adds: native VIIRS vs MODIS-equivalent over the baseline years (both from the pipeline)
        pairs = [(Vd[(y, m)], h[(y, m)]["H"]) for y in range(b0, b1 + 1) for m in range(1, 13)
                 if Vd.get((y, m)) is not None and h.get((y, m)) and h[(y, m)]["H"] is not None]
        sv, sh = sum(p[0] for p in pairs), sum(p[1] for p in pairs)
        adds = {"ratio": round(sv / sh, 2) if sh > 0 else None, "years": [b0, b1], "native_total": round(sv, 1),
                "modis_eq_total": round(sh, 1), "months": len(pairs)}

        doc = {"region": region, "baseline": [b0, b1], "unit": "VIIRS fire-days (native 375 m, S-NPP-equivalent)",
               "climatology": clim, "latest": latest, "latest_complete": latest_complete, "annual": annual,
               "similar_years": [s["y"] for s in similar], "similar_detail": {"months": f"Jan–{upto}", "years": similar},
               "adds": adds, "months": months}
        write_json(out / f"detail_{region}.json", doc)
        print(f"{region:<13} detail {months[0]['y']}-{months[0]['m']:02d}..{last['y']}-{last['m']:02d} "
              f"latest V={latest['value']} ratio={latest['ratio']} pct={latest['pct']} | adds ×{adds['ratio']} "
              f"({adds['months']} months {b0}–{b1}) | similar={doc['similar_years']}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
