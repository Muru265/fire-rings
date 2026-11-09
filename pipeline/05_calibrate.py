"""05 — Calibrate VIIRS → MODIS-equivalent and build the harmonized monthly record H with bootstrap intervals.

Input  data/cube/{region}_monthly.parquet
Output data/out/calib_{region}.json                     ratios, τ, overlap sums, bootstrap CIs (both methods)
       data/out/harmonized_{region}_{method}.parquet     y, m, H, lo, hi, uncertain, src
       data/out/hdraws_{region}_{method}.npy             (n_months, n_boot) bootstrap draws of H (float32)

Ratios (per region × calendar month, shrunk to the region-wide ratio, τ by leave-one-year-out):
  k   MODIS (Terra∪Aqua) / S-NPP   window Jul 2012 – Dec 2019   (never 2020+: MODIS orbit drift)
  q   MODIS (Terra∪Aqua) / Terra   window Jul 2002 – Dec 2019
  k′  S-NPP / NOAA-20              window Apr 2018 – Jul 2026   (VIIRS ↔ VIIRS; both on stable orbits)
H segments: 2001-01..2002-06 q·Terra · 2002-07..2011-12 MODIS · 2012-01..2026-10 k·S-NPP · 2026-11.. k·k′·NOAA-20
Methods: "monthly" (primary) and "pooled" (fallback 1: one region-wide ratio). 06_validate chooses per region.
Usage: python pipeline/05_calibrate.py [region ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.calib import bootstrap_ratios, choose_tau, ratios  # noqa: E402
from lib.common import config, data_end, path, write_json  # noqa: E402

METHODS = ("monthly", "pooled")


def ym(s: str) -> tuple[int, int]:
    return int(s[:4]), int(s[5:7])


def load(region: str) -> dict:
    mon = pl.read_parquet(path("cube") / f"{region}_monthly.parquet")
    out: dict = {}
    for r in mon.iter_rows(named=True):
        v = r["C_adj"] if r["flag"] is None else None
        out[(r["y"], r["m"], r["stream"])] = np.nan if v is None else float(v)
    return out


def matrix(cube: dict, target: str, source: str, window: tuple[str, str]) -> tuple[np.ndarray, np.ndarray, list[int]]:
    (y0, m0), (y1, m1) = ym(window[0]), ym(window[1])
    years = list(range(y0, y1 + 1))
    A = np.full((len(years), 12), np.nan)
    B = np.full((len(years), 12), np.nan)
    for i, y in enumerate(years):
        for m in range(1, 13):
            if (y, m) < (y0, m0) or (y, m) > (y1, m1):
                continue
            a, b = cube.get((y, m, target), np.nan), cube.get((y, m, source), np.nan)
            if not (np.isnan(a) or np.isnan(b)):
                A[i, m - 1], B[i, m - 1] = a, b
    return A, B, years


def fit(A, B, grid, n_boot, rng, method):
    tau, scores = choose_tau(A, B, grid)
    k = ratios(A, B, tau, method)
    draws = bootstrap_ratios(A, B, tau, n_boot, rng, method)
    lo, hi = np.percentile(draws, [5, 95], axis=0)
    valid = ~(np.isnan(A) | np.isnan(B))
    return {
        "tau": tau, "tau_scores": {str(t): round(s, 2) for t, s in scores.items()},
        "k": k, "draws": draws,
        "json": {"month": [round(float(x), 4) for x in k], "lo": [round(float(x), 4) for x in lo],
                 "hi": [round(float(x), 4) for x in hi],
                 "A": [round(float(x), 1) for x in np.where(valid, A, 0).sum(0)],
                 "B": [round(float(x), 1) for x in np.where(valid, B, 0).sum(0)],
                 "raw_month": [round(float(x), 4) for x in ratios(A, B, 0.0, "monthly")],
                 "pool": round(float(ratios(A, B, tau, "pooled")[0]), 4),
                 "tau": tau, "tau_scores": {str(t): round(s, 2) for t, s in scores.items()},
                 "years": int(valid.any(axis=1).sum()), "months_used": int(valid.sum())},
    }


def segment_of(y: int, m: int, segs: list[dict]) -> str:
    key = f"{y:04d}-{m:02d}"
    for s in segs:
        if s["from"] <= key and (s["to"] is None or key <= s["to"]):
            return s["src"]
    raise ValueError(key)


def main(regions: list[str]) -> None:
    cfg = config()
    cc = cfg["calibration"]
    assert ym(cc["window"][1]) <= (2019, 12), "calibration window must end by Dec 2019 (MODIS orbit drift)"
    segs = cfg["harmonized_segments"]
    start_y = int(cfg["record"]["start"][:4])
    out = path("out")
    for region in regions or list(cfg["regions"]):
        de = data_end(region)
        end_y, end_m = de.year, de.month
        cube = load(region)
        summary: dict = {"region": region, "window": cc["window"], "q_window": cc["q_window"],
                         "kprime_window": cc["kprime_window"], "methods": {}}
        for method in METHODS:
            rng = np.random.default_rng(cc["seed"])
            nb = cc["bootstrap_n"]
            fk = fit(*matrix(cube, "MODIS", "SNPP", cc["window"])[:2], cc["tau_grid"], nb, rng, method)
            fq = fit(*matrix(cube, "MODIS", "TERRA", cc["q_window"])[:2], cc["tau_grid"], nb, rng, method)
            fp = fit(*matrix(cube, "SNPP", "N20", cc["kprime_window"])[:2], cc["tau_grid"], nb, rng, method)
            rows, draws = [], []
            for y in range(start_y, end_y + 1):
                for m in range(1, 13):
                    if (y, m) > (end_y, end_m):
                        break
                    src = segment_of(y, m, segs)
                    i = m - 1
                    if src == "T":
                        base, kk, kd = cube.get((y, m, "TERRA"), np.nan), fq["k"][i], fq["draws"][:, i]
                    elif src == "M":
                        base, kk, kd = cube.get((y, m, "MODIS"), np.nan), 1.0, np.ones(nb)
                    elif src == "V":
                        base, kk, kd = cube.get((y, m, "SNPP"), np.nan), fk["k"][i], fk["draws"][:, i]
                    else:  # V2
                        base = cube.get((y, m, "N20"), np.nan)
                        kk, kd = fk["k"][i] * fp["k"][i], fk["draws"][:, i] * fp["draws"][:, i]
                    if np.isnan(base):
                        rows.append({"y": y, "m": m, "H": None, "lo": None, "hi": None, "uncertain": False, "src": src})
                        draws.append(np.full(nb, np.nan))
                        continue
                    H = kk * base
                    d = kd * rng.poisson(base, nb)
                    lo, hi = np.percentile(d, [5, 95])
                    unc = bool((hi - lo) / max(H, 1.0) > cc["uncertain_rel_width"])
                    rows.append({"y": y, "m": m, "H": float(H), "lo": float(lo), "hi": float(hi), "uncertain": unc, "src": src})
                    draws.append(d)
            pl.DataFrame(rows, schema_overrides={"H": pl.Float64, "lo": pl.Float64, "hi": pl.Float64}).write_parquet(
                out / f"harmonized_{region}_{method}.parquet")
            np.save(out / f"hdraws_{region}_{method}.npy", np.array(draws, dtype=np.float32))
            summary["methods"][method] = {"k": fk["json"], "q": fq["json"], "kprime": fp["json"],
                                          "uncertain_months": int(sum(r["uncertain"] for r in rows)),
                                          "missing_months": int(sum(r["H"] is None for r in rows))}
            k = fk["json"]
            print(f"{region:<13} {method:<8} k τ={k['tau']:<4} pool={k['pool']:.3f} "
                  f"k[m]={[round(x, 2) for x in k['month']]}  q pool={fq['json']['pool']:.3f}  "
                  f"k' pool={fp['json']['pool']:.3f}  uncertain={summary['methods'][method]['uncertain_months']}", flush=True)
        write_json(out / f"calib_{region}.json", summary)


if __name__ == "__main__":
    main(sys.argv[1:])
