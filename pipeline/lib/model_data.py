"""Cell × month data for the prediction model (11_model.py), built ONLY from committed files:

  web/public/data/v1/meta.json, regions/{id}.json (months, flags, published k / q / k′), hexes/{id}/cells.json +
  hexes/{id}/{year}.json (per H3 res-6 cell and month: fire-days of the month's PRIMARY stream — Terra before Jul 2002,
  Terra ∪ Aqua to Dec 2011, S-NPP to Oct 2026, NOAA-20 after), api/power/{id}.json (NASA POWER), and the optional
  pipeline/assets/model/recent/{id}.json written by the monthly retrain job (newest NOAA-20 NRT months).

So the GitHub Actions retrain job can rebuild everything without data/ (which is never committed).

Harmonized cell value  H = raw × factor(month):  q·Terra | 1·MODIS | k_m·S-NPP | k_m·k′_m·NOAA-20  (frozen published ratios).
Raw (ablation) value   = raw primary-stream fire-days, unconverted (MODIS ≤ 2011 mixed with VIIRS ≥ 2012).
"""
from __future__ import annotations

import datetime as dt
import json
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import h3
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "public" / "data" / "v1"
RECENT = ROOT / "pipeline" / "assets" / "model" / "recent"
Y0 = 2001

FEATURES = ["clim_frac", "clim_mean", "h_m", "h_m1", "h_m2", "ring1_last", "ring2_last", "ring1_clim", "ring2_clim",
            "rain_anom", "t2m_anom", "month", "region"]
CAT = [FEATURES.index("month"), FEATURES.index("region")]


def midx(y: int, m: int) -> int:
    return (y - Y0) * 12 + (m - 1)


def ym(i: int) -> tuple[int, int]:
    return Y0 + i // 12, i % 12 + 1


def key(i: int) -> str:
    y, m = ym(i)
    return f"{y:04d}-{m:02d}"


def _segments() -> list[dict]:
    return yaml.safe_load((ROOT / "pipeline" / "config.yaml").read_text(encoding="utf-8"))["harmonized_segments"]


def _seg(i: int, segs: list[dict]) -> str:
    k = key(i)
    for s in segs:
        if k >= s["from"] and (s["to"] is None or k <= s["to"]):
            return s["src"]
    raise ValueError(f"no harmonized segment for {k}")


def _rd(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


@dataclass
class Region:
    id: str
    code: int
    name: str
    cells: list[str]
    R: np.ndarray                 # (ncell, T) raw primary-stream fire-days; NaN = month unusable (insufficient coverage)
    factor: np.ndarray            # (T,) harmonization factor
    src: list[str]                # (T,) segment code T/M/V/V2
    last_full: int                # index of the last complete month
    N1: np.ndarray                # (ncell, 6)  ring-1 neighbour indices inside the region universe, -1 = none
    N2: np.ndarray                # (ncell, 12) ring-2
    rain: np.ndarray              # (T,) region POWER rain (mm/month), NaN if missing
    t2m: np.ndarray               # (T,)
    recent_months: list[str] = field(default_factory=list)


def _rings(cells: list[str], cid: dict[str, int], k: int) -> np.ndarray:
    out = np.full((len(cells), 6 * k), -1, dtype=np.int32)
    for i, c in enumerate(cells):
        nb = [cid[x] for x in h3.grid_ring(c, k) if x in cid]
        out[i, :len(nb)] = nb
    return out


def load_region(rid: str, code: int, data_end: dt.date) -> Region:
    d = _rd(WEB / "regions" / f"{rid}.json")
    cells = _rd(WEB / "hexes" / rid / "cells.json")
    cid = {c: i for i, c in enumerate(cells)}
    months = d["months"]
    last = midx(months[-1]["y"], months[-1]["m"])
    rec = _rd(RECENT / f"{rid}.json") if (RECENT / f"{rid}.json").exists() else {"months": {}}
    rec_idx = {midx(int(k[:4]), int(k[5:7])): v for k, v in rec["months"].items()}
    T = max([last] + list(rec_idx)) + 1
    R = np.zeros((len(cells), T), dtype=np.float32)
    for y in d["hex_years"]:
        hx = _rd(WEB / "hexes" / rid / f"{y}.json")
        for mi, arr in enumerate(hx["m"]):
            i = midx(y, mi + 1)
            if i < T and arr:
                R[np.asarray(arr[0::2]), i] = np.asarray(arr[1::2], dtype=np.float32)
    for r in months:   # months the record itself cannot use (coverage < 60 % or no harmonized value)
        if "insufficient" in r["flags"] or r.get("H") is None:
            R[:, midx(r["y"], r["m"])] = np.nan
    # last complete month of the pipeline record, extended by complete months from the retrain job
    nxt = data_end + dt.timedelta(days=1)
    last_full = midx(data_end.year, data_end.month) if nxt.month != data_end.month else midx(data_end.year, data_end.month) - 1
    for i, v in sorted(rec_idx.items()):   # retrain job: replace/add newest provisional months (frozen k, no recalibration)
        R[:, i] = 0
        for c, n in v["cells"]:
            if c in cid:
                R[cid[c], i] = n
        if v.get("complete"):
            last_full = max(last_full, i)
    segs = _segments()
    src = [_seg(i, segs) for i in range(T)]
    q, k, kp = d["q"]["month"], d["k"]["month"], d["kprime"]["month"]
    fac = np.array([{"T": q[ym(i)[1] - 1], "M": 1.0, "V": k[ym(i)[1] - 1], "V2": k[ym(i)[1] - 1] * kp[ym(i)[1] - 1]}[src[i]]
                    for i in range(T)], dtype=np.float32)
    rain = np.full(T, np.nan, dtype=np.float32)
    t2m = np.full(T, np.nan, dtype=np.float32)
    pw = WEB / "api" / "power" / f"{rid}.json"
    if pw.exists():
        for y, m, r_, t_ in _rd(pw)["months"]:
            i = midx(int(y), int(m))
            if 0 <= i < T:
                rain[i] = np.nan if r_ is None else r_
                t2m[i] = np.nan if t_ is None else t_
    return Region(rid, code, d["name"], cells, R, fac, src, last_full, _rings(cells, cid, 1), _rings(cells, cid, 2),
                  rain, t2m, sorted(rec["months"]))


def load_all() -> list[Region]:
    meta = _rd(WEB / "meta.json")
    de = dt.date.fromisoformat(meta["data_end"])
    return [load_region(r["id"], i, de) for i, r in enumerate(meta["regions"])]


def _anom(series: np.ndarray, t: int) -> float:
    """Value at month t minus the median of the same calendar month in all EARLIER years (no future information)."""
    prev = series[[i for i in range(t % 12, t, 12)]]
    prev = prev[np.isfinite(prev)]
    return float(series[t] - np.median(prev)) if np.isfinite(series[t]) and len(prev) >= 3 else np.nan


def _ring_mean(N: np.ndarray, v: np.ndarray) -> np.ndarray:
    vv = np.nan_to_num(v, nan=0.0)
    ok = N >= 0
    s = np.where(ok, vv[np.where(ok, N, 0)], 0.0).sum(axis=1)
    return (s / np.maximum(ok.sum(axis=1), 1)).astype(np.float32)


def build(reg: Region, targets: list[int], variant: str = "harm") -> dict[str, np.ndarray]:
    """Rows = every cell × every target month index s (features from months ≤ s−1). variant: harm | raw."""
    X = reg.R * reg.factor[None, :] if variant == "harm" else reg.R.copy()
    H = reg.R * reg.factor[None, :]   # baseline b1 is always the harmonized climatology
    with np.errstate(invalid="ignore"):
        P = np.where(np.isfinite(X), (X >= 1).astype(np.float32), np.nan)
        PH = np.where(np.isfinite(H), (H >= 1).astype(np.float32), np.nan)
    n = len(reg.cells)
    parts = {k: [] for k in ("X", "y", "s", "b1", "b2")}
    for s in targets:
        t = s - 1
        y, M = ym(s)
        hist = [midx(yy, M) for yy in range(Y0, y)]
        with np.errstate(invalid="ignore"), warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            frac = np.nanmean(P[:, hist], axis=1)
            mean = np.nanmean(X[:, hist], axis=1)
            b1 = np.nanmean(PH[:, hist], axis=1)
        h0, h1, h2 = X[:, t], X[:, t - 1], X[:, t - 2]
        F = np.column_stack([frac, mean, h0, h1, h2, _ring_mean(reg.N1, h0), _ring_mean(reg.N2, h0),
                             _ring_mean(reg.N1, frac), _ring_mean(reg.N2, frac),
                             np.full(n, _anom(reg.rain, t)), np.full(n, _anom(reg.t2m, t)),
                             np.full(n, M), np.full(n, reg.code)]).astype(np.float32)
        if s < reg.R.shape[1] and reg.src[s] in ("V", "V2"):
            tgt = np.where(np.isfinite(reg.R[:, s]), (reg.R[:, s] > 0).astype(np.float32), np.nan)
        else:
            tgt = np.full(n, np.nan, dtype=np.float32)
        parts["X"].append(F)
        parts["y"].append(tgt)
        parts["s"].append(np.full(n, s, dtype=np.int32))
        parts["b1"].append(np.nan_to_num(b1, nan=0.0).astype(np.float32))
        parts["b2"].append((np.nan_to_num(reg.R[:, t]) > 0).astype(np.float32))
    out = {k: np.concatenate(v) for k, v in parts.items()}
    out["region"] = np.full(len(out["y"]), reg.code, dtype=np.int16)
    out["cell"] = np.tile(np.arange(n, dtype=np.int32), len(targets))
    return out


def stack(regions: list[Region], targets_for, variant: str = "harm") -> dict[str, np.ndarray]:
    parts = [build(r, targets_for(r), variant) for r in regions]
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
