"""Ratio calibration with log-scale shrinkage, leave-one-year-out τ selection and year-block bootstrap.

Notation (per region, per calendar month m = 1..12):
  A[y, m] = target-sensor cell-days (e.g. MODIS Terra∪Aqua), B[y, m] = source-sensor cell-days (e.g. VIIRS S-NPP),
  both coverage-adjusted, only over overlap months where both are valid (NaN otherwise).
  k_m      = (ΣA_m + 0.5) / (ΣB_m + 0.5)                 monthly ratio of sums
  k_pool   = (ΣA + 0.5) / (ΣB + 0.5)                     region-wide ratio of sums
  ln k*_m  = w ln k_m + (1 − w) ln k_pool,  w = ΣB_m / (ΣB_m + τ)
  Scaling: target-equivalent = k*_m · B.
"""
from __future__ import annotations

import numpy as np

EPS = 0.5


def ratios(A: np.ndarray, B: np.ndarray, tau: float, method: str = "monthly") -> np.ndarray:
    """A, B: (n_years, 12) with NaN for invalid months. Returns k* (12,)."""
    valid = ~(np.isnan(A) | np.isnan(B))
    a = np.where(valid, A, 0.0)
    b = np.where(valid, B, 0.0)
    pool = (a.sum() + EPS) / (b.sum() + EPS)
    if method == "pooled":
        return np.full(12, pool)
    am, bm = a.sum(axis=0), b.sum(axis=0)
    km = (am + EPS) / (bm + EPS)
    w = np.divide(bm, bm + tau, out=np.zeros_like(bm), where=(bm + tau) > 0)
    return np.exp(w * np.log(km) + (1 - w) * np.log(pool))


def poisson_deviance(obs: np.ndarray, pred: np.ndarray) -> float:
    obs = np.asarray(obs, float)
    pred = np.maximum(np.asarray(pred, float), 1e-9)
    term = np.where(obs > 0, obs * np.log(np.where(obs > 0, obs, 1) / pred), 0.0) - (obs - pred)
    return float(2 * term.sum())


def loyo_predictions(A: np.ndarray, B: np.ndarray, tau: float, method: str = "monthly") -> np.ndarray:
    """Out-of-sample predictions of A: for each year row, fit on the other rows. NaN where invalid."""
    pred = np.full_like(A, np.nan)
    for i in range(A.shape[0]):
        keep = np.ones(A.shape[0], bool)
        keep[i] = False
        k = ratios(A[keep], B[keep], tau, method)
        pred[i] = k * B[i]
    pred[np.isnan(A) | np.isnan(B)] = np.nan
    return pred


def choose_tau(A: np.ndarray, B: np.ndarray, grid: list[float]) -> tuple[float, dict[float, float]]:
    """τ minimising the LOYO Poisson deviance of monthly predictions."""
    scores = {}
    for tau in grid:
        p = loyo_predictions(A, B, tau)
        ok = ~np.isnan(p)
        scores[tau] = poisson_deviance(A[ok], p[ok])
    best = min(scores, key=scores.get)
    return best, scores


def bootstrap_ratios(A: np.ndarray, B: np.ndarray, tau: float, n: int, rng: np.random.Generator,
                     method: str = "monthly") -> np.ndarray:
    """Year-block bootstrap of k*: resample year rows with replacement. Returns (n, 12)."""
    ny = A.shape[0]
    out = np.empty((n, 12))
    for b in range(n):
        idx = rng.integers(0, ny, ny)
        out[b] = ratios(A[idx], B[idx], tau, method)
    return out


def annual_loyo_errors(A: np.ndarray, B: np.ndarray, tau: float, method: str = "monthly") -> np.ndarray:
    """Per-year % error of LOYO-predicted annual totals (over valid months of that year)."""
    p = loyo_predictions(A, B, tau, method)
    errs = []
    for i in range(A.shape[0]):
        ok = ~np.isnan(p[i])
        a, pr = A[i, ok].sum(), p[i, ok].sum()
        errs.append(np.nan if a <= 0 else 100 * (pr - a) / a)
    return np.array(errs)


def pettitt(x: np.ndarray) -> tuple[int, float, float]:
    """Pettitt change-point test. Returns (index of last point before the change, K statistic, approx p-value)."""
    x = np.asarray(x, float)
    n = len(x)
    s = np.sign(x[None, :] - x[:, None])          # s[i, j] = sign(x_j − x_i)
    U = np.array([s[: t + 1, t + 1:].sum() for t in range(n - 1)])
    t = int(np.argmax(np.abs(U)))
    K = float(np.abs(U).max())
    p = float(min(1.0, 2 * np.exp(-6 * K ** 2 / (n ** 3 + n ** 2))))
    return t, K, p


# ---- V3 gate (Round 8: v1.2, adopted 13 Nov 2026 after a read-only check on all 9 regions) -----------------------
SEAM_YEARS = (2011, 2013)     # a break here could be the MODIS→VIIRS seam (VIIRS from Jan 2012)
CP_WINDOW = 1                 # MODIS-only break must be in the same year ±1


def v3_gate(step_ok: bool, p_harm: float, cp_harm: int, p_modis: float, cp_modis: int, version: str = "v1.2") -> bool:
    """V3 pass/fail. v1.1: step consistent with MODIS-only AND no harmonized Pettitt break (p > 0.05).
    v1.2: step consistent AND (no harmonized break, OR the break is outside 2011–2013 and MODIS alone shows a significant
    break in the same year ±1). Caveat: before 2012 the harmonized series IS MODIS, so the second branch is not an
    independent test of pre-2012 breaks; the seam is guarded by the step test plus "no break at 2011–2013"."""
    if version == "v1.1":
        return bool(step_ok and p_harm > 0.05)
    if version != "v1.2":
        raise ValueError(version)
    real_history = (p_modis <= 0.05 and abs(cp_harm - cp_modis) <= CP_WINDOW
                    and not (SEAM_YEARS[0] <= cp_harm <= SEAM_YEARS[1]))
    return bool(step_ok and (p_harm > 0.05 or real_history))
