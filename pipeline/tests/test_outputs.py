"""Checks on published outputs (skipped if the pipeline hasn't been run)."""
import json
from pathlib import Path

import pytest

WEB = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "v1"
OUT = Path(__file__).resolve().parents[2] / "data" / "out"
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


def test_timing_check_signal_is_punjab_specific():
    t = json.loads((OUT / "punjab_timing.json").read_text(encoding="utf-8"))
    p = t["punjab|Oct–Nov (rice residue)"]["aqua_rel_2022_2026"]
    others = [t[k]["aqua_rel_2022_2026"] for k in t if not k.startswith("punjab|Oct")]
    assert p > max(others)
