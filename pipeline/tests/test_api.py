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


def test_reunion_sourced_and_windowed():
    p = WEB / "api" / "reunion.json"
    if not p.exists():
        pytest.skip("Réunion file not published yet")
    r = J("api/reunion.json")
    assert r["eruption_list"] == "sourced"
    for e in r["eruptions"]:
        assert e["url"].startswith("https://volcano.si.edu/") and "GVP" in e["source"] or "Global Volcanism" in e["source"]
        assert e["start"] <= e["end"]
        for k, v in e["sensors"].items():
            if v and v["detected"]:
                assert v["detections"] >= v["detection_days"] >= 1 and v["first_detection"] >= e["start"]
    for k in ("modis", "viirs"):
        arr = r["series"][k]["detections"]
        assert any(x is None for x in arr), "days outside the downloaded windows must be null, not zero"
        assert sum(1 for x in arr if x is not None) == r["series"][k]["days_downloaded"] or r["series"][k]["days_downloaded"] >= sum(1 for x in arr if x is not None)
