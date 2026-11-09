"""07 — "Is this normal?" statistics on the harmonized record.

Input  data/out/harmonized_{region}.parquet, hdraws_{region}.npy, validation_{region}.json (method),
       calib_{region}.json (ratios for daily month-to-date), data/cube/{region}_daily.parquet
Output data/out/stats_{region}.json

Per month (y, m), against the same calendar month in baseline years 2003–2022:
  ratio          H / baseline median
  pct            Weibull percentile 100·#{baseline ≤ x}/(n+1), as a P5–P95 range over the bootstrap draws of x
  return_period  (n+1) / #{baseline ≥ x} for above-median months; null + beyond_record when x exceeds every baseline
                 value (no extrapolation)
  rank           rank of H among all years of that calendar month (1 = highest)
  guard          true when baseline median < 5 and H < 10 ("too little fire to judge")
Month-to-date: the latest partial month is compared with the same days (1..D) of baseline years.
Similar years: top-3 Pearson correlation of the year-to-date monthly curve (complete months) — analogues, not forecasts.
Usage: python pipeline/07_stats.py
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import config, path, read_json, write_json  # noqa: E402
from lib.common import data_end as region_end  # noqa: E402


def weibull_pct(x: float, base: np.ndarray) -> float:
    return 100.0 * np.sum(base <= x) / (len(base) + 1)


def return_period(x: float, base: np.ndarray) -> tuple[float | None, bool]:
    n_ge = int(np.sum(base >= x))
    if n_ge == 0:
        return None, True
    return (len(base) + 1) / n_ge, False


def month_stats(x: float | None, draws: np.ndarray, base: np.ndarray, guard_med: float, guard_x: float) -> dict:
    if x is None or len(base) == 0:
        return {"ratio": None, "pct": None, "return_period": None, "beyond_record": False, "guard": None}
    med = float(np.median(base))
    d = draws[~np.isnan(draws)]
    pcts = np.array([weibull_pct(v, base) for v in d]) if len(d) else np.array([weibull_pct(x, base)])
    lo, hi = np.percentile(pcts, [5, 95])
    rp, beyond = (None, False)
    if x > med:
        rp, beyond = return_period(x, base)
    return {"ratio": round(x / med, 2) if med > 0 else None, "median": round(med, 1),
            "pct": [round(float(lo)), round(float(hi))], "return_period": None if rp is None else round(rp, 1),
            "beyond_record": beyond, "guard": bool(med < guard_med and x < guard_x)}


def main() -> None:
    cfg = config()
    st = cfg["stats"]
    b0, b1 = st["baseline"]
    out = path("out")
    for region in cfg["regions"]:
        data_end = region_end(region)
        h = pl.read_parquet(out / f"harmonized_{region}.parquet")
        draws = np.load(out / f"hdraws_{region}.npy")
        method = read_json(out / f"validation_{region}.json")["summary"]["method"]
        calib = read_json(out / f"calib_{region}.json")["methods"][method]
        rows = h.to_dicts()
        idx = {(r["y"], r["m"]): i for i, r in enumerate(rows)}
        H = {(r["y"], r["m"]): r["H"] for r in rows}

        base = {m: np.array([H[(y, m)] for y in range(b0, b1 + 1) if H.get((y, m)) is not None]) for m in range(1, 13)}
        clim = {"median": [], "p10": [], "p90": [], "n": []}
        for m in range(1, 13):
            b = base[m]
            clim["median"].append(round(float(np.median(b)), 1))
            clim["p10"].append(round(float(np.percentile(b, 10)), 1))
            clim["p90"].append(round(float(np.percentile(b, 90)), 1))
            clim["n"].append(int(len(b)))

        # per-month stats (full months; the latest partial month is treated with MTD below)
        last = rows[-1]
        mtd = (last["y"], last["m"]) == (data_end.year, data_end.month) and data_end.day < 28
        per_month = []
        src = {(r["y"], r["m"]): r["src"] for r in rows}
        for r in rows:
            key = (r["y"], r["m"])
            s = month_stats(r["H"], draws[idx[key]], base[r["m"]], st["guard_median_lt"], st["guard_value_lt"])
            # Terra-only months (2001-01 – 2002-06, Terra × q) are shown but never ranked / given return periods
            col = [H[(y, r["m"])] for y in range(int(cfg["record"]["start"][:4]), data_end.year + 1)
                   if H.get((y, r["m"])) is not None and src.get((y, r["m"])) != "T"
                   and not (mtd and (y, r["m"]) == (last["y"], last["m"]))]
            if r["src"] == "T":
                s.update({"rank": None, "rank_of": len(col), "return_period": None, "beyond_record": False, "terra_only": True})
            else:
                s["rank"] = (int(np.sum(np.array(col) > r["H"])) + 1) if r["H"] is not None else None
                s["rank_of"] = len(col)
            per_month.append({"y": r["y"], "m": r["m"], **s})

        # month-to-date for the latest partial month: same days in baseline years, harmonized daily cell-days
        latest = dict(per_month[-1])
        latest.update({"y": last["y"], "m": last["m"], "mtd": mtd, "value": None if last["H"] is None else round(last["H"], 1),
                       "lo": None if last["lo"] is None else round(last["lo"], 1),
                       "hi": None if last["hi"] is None else round(last["hi"], 1), "provisional": True})
        if mtd and last["H"] is not None:
            D = data_end.day
            daily = pl.read_parquet(path("cube") / f"{region}_daily.parquet")
            k = np.array(calib["k"]["month"])
            dmap: dict = {}
            for r in daily.iter_rows(named=True):
                dmap[(r["date"], r["stream"])] = r["cells"]
            mb = []
            for y in range(b0, b1 + 1):
                stream, scale = ("MODIS", 1.0) if y < 2012 else ("SNPP", k[last["m"] - 1])
                mb.append(scale * sum(dmap.get((dt.date(y, last["m"], d), stream), 0) for d in range(1, D + 1)))
            mb = np.array(mb, float)
            s = month_stats(last["H"], draws[idx[(last["y"], last["m"])]], mb, st["guard_median_lt"], st["guard_value_lt"])
            latest.update(s)
            latest.update({"days": D, "baseline_kind": f"same days 1–{D} of baseline years",
                           "rank": int(np.sum(mb > last["H"])) + 1, "rank_of": len(mb) + 1})
        latest_complete = next(p for p in reversed(per_month[:-1] if mtd else per_month) if p["ratio"] is not None)
        lc_row = rows[idx[(latest_complete["y"], latest_complete["m"])]]
        latest_complete = {**latest_complete, "value": round(lc_row["H"], 1), "lo": round(lc_row["lo"], 1),
                           "hi": round(lc_row["hi"], 1), "mtd": False,
                           "provisional": (lc_row["y"], lc_row["m"]) >= (2026, 8)}

        # annual totals with bootstrap CI
        annual = []
        for y in sorted({r["y"] for r in rows}):
            ks = [(y, m) for m in range(1, 13) if (y, m) in idx]
            vals = [H[k_] for k_ in ks]
            complete = len(ks) == 12 and None not in vals and not (mtd and y == last["y"])
            if None in vals:
                annual.append({"y": y, "H": None, "lo": None, "hi": None, "complete": False,
                               "missing_months": [k_[1] for k_ in ks if H[k_] is None]})
                continue
            tot = np.nansum(draws[[idx[k_] for k_ in ks]], axis=0)
            lo, hi = np.percentile(tot, [5, 95])
            t_only = sum(1 for k_ in ks if src.get(k_) == "T")
            annual.append({"y": y, "H": round(float(sum(vals)), 1), "lo": round(float(lo), 1), "hi": round(float(hi), 1),
                           "complete": complete, "months": len(ks), "terra_only_months": t_only,
                           "rankable": complete and t_only == 0})

        # similar years: YTD curve over complete months of the latest year
        ly = last["y"]
        upto = last["m"] - 1 if mtd else last["m"]
        sims = []
        if upto >= 3:
            cur = np.array([H.get((ly, m)) for m in range(1, upto + 1)], float)
            for y in range(int(cfg["record"]["start"][:4]), ly):
                other = np.array([H.get((y, m)) for m in range(1, upto + 1)], float)
                if np.isnan(other).any() or np.isnan(cur).any() or np.std(other) == 0:
                    continue
                if any(src.get((y, m)) == "T" for m in range(1, upto + 1)):
                    continue   # Terra-only months are not used as analogues
                sims.append((y, float(np.corrcoef(cur, other)[0, 1])))
        sims.sort(key=lambda t: -t[1])
        similar = [{"y": y, "r": round(r, 3)} for y, r in sims[: st["similar_years_top"]]]

        doc = {"region": region, "baseline": [b0, b1], "climatology": clim, "latest": latest,
               "latest_complete": latest_complete, "annual": annual,
               "similar_years": [s["y"] for s in similar], "similar_detail": {"months": f"Jan–{upto}", "years": similar},
               "per_month": per_month}
        write_json(out / f"stats_{region}.json", doc)
        L = latest
        print(f"{region:<13} latest {L['y']}-{L['m']:02d} mtd={L['mtd']} value={L['value']} median={L.get('median')} "
              f"ratio={L['ratio']} pct={L['pct']} rp={L['return_period']} beyond={L['beyond_record']} rank={L.get('rank')}/{L.get('rank_of')} "
              f"guard={L['guard']} | complete {latest_complete['y']}-{latest_complete['m']:02d} ratio={latest_complete['ratio']} "
              f"pct={latest_complete['pct']} | similar={doc['similar_years']}", flush=True)


if __name__ == "__main__":
    main()
