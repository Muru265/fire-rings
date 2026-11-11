"""P1.7 open-API files: consistent with the region JSON they are derived from."""
import json
from pathlib import Path

import pytest

WEB = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "v1"
REGIONS = ["punjab", "madagascar", "se_australia", "mauritius"]


def J(p):
    return json.loads((WEB / p).read_text(encoding="utf-8"))


@pytest.mark.parametrize("rid", REGIONS)
def test_series_matches_region(rid):
    s, r = J(f"api/series/{rid}.json"), J(f"regions/{rid}.json")
    assert len(s["months"]) == len(r["months"])
    for row, m in zip(s["months"], r["months"]):
        y, mo, H, lo, hi, raw, rm, rv = row[:8]
        assert (y, mo, H, lo, hi, rm, rv) == (m["y"], m["m"], m["H"], m["lo"], m["hi"], m["raw_modis"], m["raw_viirs"])
        if "insufficient" not in m["flags"]:
            assert raw == (m["raw_modis"] if y < 2012 else m["raw_viirs"])


@pytest.mark.parametrize("rid", REGIONS)
def test_projection_typical_is_climatology(rid):
    p, r = J(f"api/projection/{rid}.json"), J(f"regions/{rid}.json")
    for mm in p["months"]:
        assert mm["typical"] == pytest.approx(r["climatology"]["median"][mm["m"] - 1], abs=0.11)
        for cp in mm["checkpoints"]:
            assert cp["better"] in ("projection", "typical")
            assert cp["mdape_projection"] >= 0 and cp["mdape_typical"] >= 0
            assert cp["n_years"] >= 8
            if cp["range_factor"]:
                assert cp["range_factor"][0] <= cp["range_factor"][1]


@pytest.mark.parametrize("rid", REGIONS)
def test_projection_current_uses_same_days_baseline(rid):
    c = J(f"api/projection/{rid}.json")["current"]
    if c and c["typical_so_far_app"]:
        # our own same-days median must agree with the app's "this month so far" baseline
        assert c["typical_so_far"] == pytest.approx(c["typical_so_far_app"], rel=0.01, abs=0.6)
    if c and c["projection"] and c["range"]:
        assert c["range"][0] <= c["projection"] * 1.5 and c["range"][1] >= c["projection"] * 0.5


@pytest.mark.parametrize("rid", REGIONS)
def test_power_complete(rid):
    p = J(f"api/power/{rid}.json")
    assert p["months"][0][:2] == [2001, 1]
    assert len(p["months"]) >= 300
    for y, m, rain, t in p["months"]:
        assert 0 <= rain < 2000 and -20 < t < 45


def test_index_lists_endpoints():
    idx = J("api/index.json")
    paths = " ".join(e["path"] for e in idx["endpoints"])
    for p in ("/api/hotspots", "/api/series/", "/api/projection/", "/api/power/", "/api/reunion.json"):
        assert p in paths
