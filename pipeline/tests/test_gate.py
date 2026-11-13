"""Round 8: validation gate V3 — v1.1 vs v1.2 (lib.calib.v3_gate), every branch, plus the published per-region results."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.calib import v3_gate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("step_ok,ph,cph,pm,cpm,v11,v12,why", [
    (True, 0.40, 2008, 1.00, 2008, True, True, "no harmonized break → pass in both"),
    (False, 0.40, 2008, 1.00, 2008, False, False, "step inconsistent → fail in both"),
    (True, 0.013, 2009, 0.013, 2009, False, True, "Sudan-like: break 2009 also in MODIS → v1.2 pass"),
    (True, 0.041, 2007, 0.041, 2006, False, True, "MODIS break one year off (±1) → v1.2 pass"),
    (True, 0.041, 2007, 0.041, 2005, False, False, "MODIS break two years off → fail"),
    (True, 0.02, 2007, 0.20, 2007, False, False, "MODIS shows no significant break → fail"),
    (True, 0.02, 2012, 0.01, 2012, False, False, "break at the seam (2012) → fail even if MODIS agrees"),
    (True, 0.02, 2011, 0.01, 2011, False, False, "break in 2011 (seam window) → fail"),
    (True, 0.02, 2013, 0.01, 2013, False, False, "break in 2013 (seam window) → fail"),
    (True, 0.02, 2014, 0.01, 2014, False, True, "break just outside the seam window, MODIS agrees → pass"),
    (False, 0.013, 2009, 0.013, 2009, False, False, "step inconsistent overrides the history branch"),
])
def test_v3_gate_branches(step_ok, ph, cph, pm, cpm, v11, v12, why):
    assert v3_gate(step_ok, ph, cph, pm, cpm, "v1.1") is v11, why
    assert v3_gate(step_ok, ph, cph, pm, cpm, "v1.2") is v12, why


def test_v3_gate_unknown_version():
    with pytest.raises(ValueError):
        v3_gate(True, 0.5, 2008, 0.5, 2008, "v9")


VAL = ROOT / "data" / "out"


@pytest.mark.skipif(not (VAL / "validation_sudan.json").exists(), reason="needs data/out (local pipeline run)")
def test_gate_results_v11_vs_v12():
    """No region that passed v1.1 fails v1.2; only Sudan and Mato Grosso change (fail → pass)."""
    changed = {}
    for f in sorted(VAL.glob("validation_*.json")):
        s = json.loads(f.read_text(encoding="utf-8"))["summary"]
        if s.get("v3_pass_v11") is None:
            continue
        assert not (s["v3_pass_v11"] and not s["v3_pass"]), f.name
        if s["v3_pass_v11"] != s["v3_pass"]:
            changed[f.stem.replace("validation_", "")] = (s["v3_pass_v11"], s["v3_pass"])
    assert changed == {"sudan": (False, True), "mato_grosso": (False, True)}
