"""Fire Watch rules (09_watch.py): every rule incl. the low-activity guard, and the raw-vs-harmonized backtest counts."""
import json
from pathlib import Path

import pytest
from conftest import load_step

W = load_step("09_watch")
ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "public" / "data" / "v1"
RULES = {"alert_pct": 95, "far_above_pct": 90, "far_below_pct": 10}


@pytest.mark.parametrize("pct,guard,beyond,want,rule", [
    ([95, 95], False, False, "Alert", "above_every_baseline_year"),      # above every one of 20 baseline years
    ([60, 80], False, True, "Alert", "above_every_baseline_year"),       # beyond record wins
    ([90, 95], False, False, "Watch", "far_above_normal"),               # above P90 even at the low end
    ([89, 95], False, False, "Normal", None),                            # straddles P90 → not far above
    ([0, 10], False, False, "Unusually low", "far_below_normal"),        # below P10 even at the high end
    ([5, 11], False, False, "Normal", None),                             # straddles P10 → not far below
    ([40, 60], False, False, "Normal", None),
    ([95, 95], True, True, "Normal", "low_activity_guard"),              # guard: never an alarm from tiny numbers
    ([0, 0], True, False, "Normal", "low_activity_guard"),
    (None, False, False, "Normal", None),                                # no percentile (missing coverage)
])
def test_classify_rules(pct, guard, beyond, want, rule):
    assert W.classify(pct, guard, beyond, RULES) == (want, rule)


def test_config_thresholds_are_the_published_ones():
    w = json.loads((WEB / "watch.json").read_text(encoding="utf-8"))
    from lib.common import config
    c = config()["watch"]
    for k in ("alert_pct", "far_above_pct", "far_below_pct", "live_spike_ratio", "live_min_expected", "live_satellites"):
        assert w["rules"][k] == c[k]


def test_backtest_counts_recomputed_from_region_files():
    """Recount raw vs harmonized alerts 2012–2025 independently from the published region JSON."""
    import numpy as np
    w = json.loads((WEB / "watch.json").read_text(encoding="utf-8"))
    tot_raw = tot_h = tot_only = 0
    for rid, reg in w["regions"].items():
        d = json.loads((WEB / "regions" / f"{rid}.json").read_text(encoding="utf-8"))
        M = {(r["y"], r["m"]): r for r in d["months"]}
        raw = lambda r: None if "insufficient" in r["flags"] else (r["raw_modis"] if r["y"] < 2012 else r["raw_viirs"])  # noqa: E731
        harm = lambda r: r["H"]  # noqa: E731
        sets = {}
        for name, f in (("raw", raw), ("harm", harm)):
            s = set()
            for y in range(2012, 2026):
                for m in range(1, 13):
                    r = M.get((y, m))
                    x = f(r) if r else None
                    if x is None:
                        continue
                    b = np.array([f(M[(yy, m)]) for yy in range(2003, 2023) if (yy, m) in M and f(M[(yy, m)]) is not None and M[(yy, m)]["src"] != "T"])
                    if len(b) < 5 or (np.median(b) < 5 and x < 10):
                        continue
                    if round(100 * np.sum(b <= x) / (len(b) + 1)) >= 90:
                        s.add((y, m))
            sets[name] = s
        bt = reg["backtest"]
        assert bt["raw_alerts"] == len(sets["raw"]) and bt["harmonized_alerts"] == len(sets["harm"])
        assert bt["raw_only_alerts"] == len(sets["raw"] - sets["harm"])
        assert sum(v["raw"] for v in bt["per_year"].values()) == bt["raw_alerts"]
        tot_raw += len(sets["raw"]); tot_h += len(sets["harm"]); tot_only += len(sets["raw"] - sets["harm"])
    t = w["backtest"]["totals"]
    assert (t["raw_alerts"], t["harmonized_alerts"], t["raw_only_alerts"]) == (tot_raw, tot_h, tot_only)
    # the point of harmonization: the raw agent raises more false alarms than the harmonized one
    assert t["raw_alerts"] > t["harmonized_alerts"] and t["raw_only_alerts"] > 0


def test_current_status_is_most_severe_check_and_guarded():
    w = json.loads((WEB / "watch.json").read_text(encoding="utf-8"))
    sev = {"Normal": 0, "Unusually low": 1, "Watch": 2, "Alert": 3}
    for reg in w["regions"].values():
        assert reg["status"] == max((c["status"] for c in reg["checks"]), key=sev.get)
        for c in reg["checks"]:
            if c["guard"]:
                assert c["status"] == "Normal" and c["rule"] == "low_activity_guard"
        assert reg["relevant_for"]
