import numpy as np

from lib.calib import (annual_loyo_errors, bootstrap_ratios, choose_tau, pettitt, poisson_deviance, ratios)


def synth(k_true, years=8, seed=0, scale=500):
    rng = np.random.default_rng(seed)
    season = 1 + np.sin(np.linspace(0, 2 * np.pi, 12, endpoint=False))
    B = rng.poisson(scale * season[None, :] * rng.uniform(0.7, 1.3, (years, 1))).astype(float)
    A = rng.poisson(np.asarray(k_true)[None, :] * B).astype(float)
    return A, B


def test_ratio_recovers_constant_k():
    A, B = synth(np.full(12, 0.3))
    k = ratios(A, B, tau=30)
    assert np.allclose(k, 0.3, rtol=0.1)   # low-count months carry Poisson noise


def test_shrinkage_pulls_sparse_month_to_pool():
    A, B = synth(np.full(12, 0.3))
    A[:, 6], B[:, 6] = 0.0, 1.0           # July: almost no overlap, raw k_m would be 0.5/8.5 ≈ 0.06
    k_small = ratios(A, B, tau=10)[6]
    k_big = ratios(A, B, tau=300)[6]
    assert k_big > k_small                  # larger τ → closer to the pooled ratio
    assert abs(np.log(k_big / 0.3)) < 0.3


def test_pooled_method_is_flat():
    A, B = synth(np.linspace(0.2, 0.4, 12))
    k = ratios(A, B, tau=30, method="pooled")
    assert np.allclose(k, k[0])


def test_nan_months_ignored():
    A, B = synth(np.full(12, 0.3))
    A[0, :] = np.nan
    assert np.allclose(ratios(A, B, 30), 0.3, rtol=0.1)


def test_choose_tau_from_grid_and_loyo_errors_small():
    A, B = synth(np.linspace(0.2, 0.4, 12))
    tau, scores = choose_tau(A, B, [10, 30, 100, 300])
    assert tau in (10, 30, 100, 300) and set(scores) == {10, 30, 100, 300}
    errs = annual_loyo_errors(A, B, tau)
    assert np.nanmax(np.abs(errs)) < 10


def test_bootstrap_shape_and_spread():
    A, B = synth(np.full(12, 0.3))
    draws = bootstrap_ratios(A, B, 30, 200, np.random.default_rng(1))
    assert draws.shape == (200, 12)
    lo, hi = np.percentile(draws, [5, 95], axis=0)
    assert np.all(lo <= 0.3 * 1.05) and np.all(hi >= 0.3 * 0.95)


def test_poisson_deviance_zero_for_perfect():
    assert poisson_deviance(np.array([0, 3, 5.0]), np.array([1e-12, 3, 5.0])) < 1e-6


def test_pettitt_detects_step_not_flat():
    rng = np.random.default_rng(3)
    step = np.r_[rng.normal(10, 1, 11), rng.normal(30, 1, 14)]
    flat = rng.normal(10, 1, 25)
    t, _, p = pettitt(step)
    assert t == 10 and p < 0.01
    assert pettitt(flat)[2] > 0.05
