"""Checks on published outputs (skipped if the pipeline hasn't been run)."""
import json
from pathlib import Path

import pytest

WEB = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "v1"
OUT = Path(__file__).resolve().parents[2] / "data" / "out"
needs_out = pytest.mark.skipif(not OUT.exists(), reason="needs data/out (local pipeline run; absent on GitHub runners)")
REGIONS = ["punjab", "madagascar", "se_australia", "mauritius"]
pytestmark = pytest.mark.skipif(not (WEB / "regions" / "punjab.json").exists(), reason="run the pipeline first")


def doc(r):
    return json.loads((WEB / "regions" / f"{r}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("region", REGIONS)
def test_terra_only_months_flagged_and_never_ranked(region):
    d = doc(region)
    t = [m for m in d["months"] if m["src"] == "T"]
    assert t and all((m["y"], m["m"]) < (2002, 7) for m in t)
    assert all("terra_only" in m["flags"] and m["rank"] is None and m["rp"] is None for m in t)
    assert not any("terra_only" in m["flags"] for m in d["months"] if m["src"] != "T")
    ann = {a["y"]: a for a in d["annual"]}
    assert ann[2001]["rankable"] is False and ann[2002]["rankable"] is False
    assert 2001 not in d["similar_years"] and 2002 not in d["similar_years"]


@needs_out
@pytest.mark.parametrize("region", REGIONS)
def test_v9_excludes_terra_only_seasons(region):
    v9 = json.loads((OUT / f"validation_{region}.json").read_text(encoding="utf-8"))["summary"]["v9"]
    assert "2001–02" not in v9["top3_harmonized"]


def test_overpass_caveat_only_on_punjab_oct_nov_2022_on():
    for r in REGIONS:
        for m in doc(r)["months"]:
            expect = r == "punjab" and m["m"] in (10, 11) and m["y"] >= 2022
            assert ("overpass_timing" in m["flags"]) == expect, (r, m["y"], m["m"])
    assert doc("punjab")["caveats"]["overpass_timing"]


@pytest.mark.parametrize("region", REGIONS)
def test_geo_anchor_on_land_inside_view_and_live_file(region):
    g = doc(region)["geo"]
    (lon, lat), v = g["anchor"], g["view_bbox"]
    assert v[0] <= lon <= v[2] and v[1] <= lat <= v[3]
    live = json.loads((WEB / "live" / f"{region}.json").read_text(encoding="utf-8"))
    assert live["footprint"] and live["footprint_res"] in (6, 7)
    if region == "mauritius":
        assert g["small"] and g["inset"]["name"] == "Rodrigues" and g["inset"]["bbox"][0] > 63
        assert 57.3 < lon < 57.9   # main island, not the ocean between it and Rodrigues


@pytest.mark.parametrize("region", REGIONS)
def test_published_return_periods_agree_with_percentiles(region):
    for m in doc(region)["months"]:
        if m.get("rp") and m.get("pct"):
            p0, p1 = m["pct"]
            assert 100 / (100 - p0) - 0.05 <= m["rp"] <= 100 / (100 - min(p1, 95.3)) + 0.05, (region, m["y"], m["m"], m["pct"], m["rp"])


@needs_out
def test_timing_check_signal_is_punjab_specific():
    t = json.loads((OUT / "punjab_timing.json").read_text(encoding="utf-8"))
    p = t["punjab|Oct–Nov (rice residue)"]["aqua_rel_2022_2026"]
    others = [t[k]["aqua_rel_2022_2026"] for k in t if not k.startswith(("punjab|Oct", "_"))]
    assert p > max(others)
