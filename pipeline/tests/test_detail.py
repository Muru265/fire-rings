"""High detail mode (QA #44): native VIIRS values are the same cube numbers the harmonized record scales by k."""
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "public" / "data" / "v1" / "regions"
REGIONS = ["punjab", "madagascar", "se_australia", "mauritius"]


def doc(r):
    return json.loads((WEB / f"{r}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("region", REGIONS)
def test_native_equals_raw_viirs_cell_days(region):
    d = doc(region)
    kp = d["kprime"]["month"]
    n = 0
    for r in d["months"]:
        if r["y"] < 2012 or r.get("V") is None:
            continue
        expect = r["raw_viirs"] if r["src"] == "V" else kp[r["m"] - 1] * r["raw_viirs"]
        assert abs(r["V"] - expect) <= 0.11 + 1e-3 * expect, (r["y"], r["m"], r["V"], expect)
        n += 1
    assert n > 150


@pytest.mark.parametrize("region", REGIONS)
def test_harmonized_is_k_times_native(region):
    d = doc(region)
    k = d["k"]["month"]
    for r in d["months"]:
        if r.get("V") is None or r["H"] is None:
            continue
        assert abs(r["H"] - k[r["m"] - 1] * r["V"]) <= 0.15 + 2e-3 * r["H"], (r["y"], r["m"])
        # the new satellite sees at least as much as the old-camera equivalent wherever the exchange rate is ≤ 1
        if k[r["m"] - 1] <= 1:
            assert r["V"] >= r["H"] - 0.1, (r["y"], r["m"], r["V"], r["H"])


@pytest.mark.parametrize("region", REGIONS)
def test_detail_block_shape(region):
    det = doc(region)["detail"]
    assert det["baseline"] == [2013, 2022]
    assert det["first"] == "2012-01"
    assert len(det["climatology"]["median"]) == 12 and all(n == 10 for n in det["climatology"]["n"])
    assert det["adds"]["ratio"] and det["adds"]["ratio"] > 1
    assert all(a["y"] >= 2012 for a in det["annual"])
    # annual native totals = sum of the monthly native values
    months = {(r["y"], r["m"]): r.get("V") for r in doc(region)["months"]}
    for a in det["annual"]:
        if a["H"] is not None:
            s = sum(months[(a["y"], m)] for m in range(1, 13) if (a["y"], m) in months)
            assert abs(a["H"] - s) <= 1.0 + 1e-4 * s
