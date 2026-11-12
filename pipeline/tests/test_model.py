"""Round 5B prediction model: no leakage, deterministic output, scores in [0, 1] (pipeline/11_model.py)."""
import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
PIPE = ROOT / "pipeline"
WEB = ROOT / "web" / "public" / "data" / "v1"
import sys  # noqa: E402

sys.path.insert(0, str(PIPE))
from lib import model_data as md  # noqa: E402

spec = importlib.util.spec_from_file_location("model11", PIPE / "11_model.py")
M11 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M11)

pytestmark = pytest.mark.skipif(not (WEB / "hexes" / "punjab" / "cells.json").exists(), reason="needs published hexes")


@pytest.fixture(scope="module")
def small():
    import datetime as dt
    de = dt.date.fromisoformat(json.loads((WEB / "meta.json").read_text(encoding="utf-8"))["data_end"])
    reg = md.load_region("punjab", 0, de)
    D = md.stack([reg], lambda r: list(range(md.midx(2015, 1), md.midx(2019, 12) + 1)))
    D["year"] = (md.Y0 + D["s"] // 12).astype(np.int16)
    D["group"] = D["region"].astype(np.int64) * 10_000 + D["s"]
    return reg, D


def test_features_never_see_the_target_month(small):
    reg, _ = small
    s = md.midx(2018, 10)
    a = md.build(reg, [s])
    reg.R[:, s] += 99   # change the target month (and only it)
    try:
        b = md.build(reg, [s])
    finally:
        reg.R[:, s] -= 99
    assert np.array_equal(a["X"], b["X"], equal_nan=True), "a feature used the target month"
    assert not np.array_equal(a["y"], b["y"]) or a["y"].all()


def test_rolling_origin_has_no_leakage_and_is_deterministic(small, monkeypatch):
    _, D = small
    monkeypatch.setattr(M11, "MAX_TRAIN", 20_000)
    rc = {"kind": "hgb", "lr": 0.1, "leaves": 15, "iters": 30}
    T1 = M11.rolling_origin(D, rc, [2018, 2019], "t")
    T2 = M11.rolling_origin(D, rc, [2018, 2019], "t")
    assert np.array_equal(T1["model"], T2["model"]), "same data + seed must give identical scores"
    assert set(np.unique(T1["year"]).tolist()) == {2018, 2019}
    assert np.all((T1["model"] >= 0) & (T1["model"] <= 1))
    # the split itself: training rows always come from years before the test year
    for Y in (2018, 2019):
        tr = M11.subsample(np.flatnonzero(D["year"] < Y), M11.SEED + Y, 20_000)
        assert D["year"][tr].max() < Y and not np.isin(tr, np.flatnonzero(D["year"] == Y)).any()


def test_capture_counts_top_share_per_group():
    g = np.array([1] * 10 + [2] * 10)
    y = np.array([1, 1, 0, 0, 0, 0, 0, 0, 0, 0] * 2, dtype=float)
    sc = np.array([0.9, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] * 2)
    _, cap, tot = M11.capture_parts(g, sc, y, 0.1, 0)
    assert cap.tolist() == [1, 1] and tot.tolist() == [2, 2]    # top 10 % of 10 cells = 1 cell per group
    _, cap, _ = M11.capture_parts(g, sc, y, 0.2, 0)
    assert cap.tolist() == [2, 2]


@pytest.mark.skipif(not (WEB / "api" / "model_card.json").exists(), reason="model not trained yet")
def test_published_model_files():
    card = json.loads((WEB / "api" / "model_card.json").read_text(encoding="utf-8"))
    assert card["training_years"] == [2013, 2025] and card["target"].startswith("the cell has ≥ 1 VIIRS fire-day")
    pooled = card["evaluation"]["pooled"]
    for k in ("model", "climatology", "persistence"):
        assert 0 <= pooled[k]["pr_auc"] <= 1 and 0 <= pooled[k]["capture10"] <= 100
    lik = sorted((WEB / "api" / "likelihood").glob("*.json")) if (WEB / "api" / "likelihood").exists() else []
    assert bool(lik) == card["gate"]["passed"], "likelihood maps exist exactly when the publish gate passed"
    for f in lik:
        d = json.loads(f.read_text(encoding="utf-8"))
        sc = np.array([c[1] for c in d["cells"]]); dec = np.array([c[2] for c in d["cells"]])
        assert np.all((sc >= 0) & (sc <= 1)) and dec.min() >= 1 and dec.max() <= 10
        cells = json.loads((WEB / "hexes" / d["region"] / "cells.json").read_text(encoding="utf-8"))
        assert [c[0] for c in d["cells"]] == cells
