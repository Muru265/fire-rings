"""09 — Fire Watch: deterministic monitoring rules + the raw-vs-harmonized backtest ("why harmonization matters").

Input  web/public/data/v1/regions/{id}.json (08_export), config.yaml `watch:` (the only place the thresholds live)
Output web/public/data/v1/watch.json

Rules (Long-term record; the low-activity guard always applies first — no alarms from tiny numbers):
  Alert          month above every baseline year: percentile range low end ≥ alert_pct (95 = top of 20 years) or beyond record
  Watch          "far above normal": percentile range low end ≥ far_above_pct (90)
  Unusually low  "far below normal": percentile range high end ≤ far_below_pct (10)
  Normal         otherwise, or "too little fire to judge" (guard: baseline median < 5 and value < 10)
Checked for the month to date (vs the same days of baseline years) and the last full month. /api/watch adds one live rule
(72 h detections ≥ live_spike_ratio × expected → Watch, never Alert); the expected count is computed here.
Region status = the most severe check (Alert > Watch > Unusually low > Normal).

Backtest 2012-01 … 2025-12: the SAME percentile rules on the raw record (MODIS cell-days to 2011, unconverted VIIRS after) and
on the harmonized record, each against its own 2003–2022 same-month baseline (point percentile, no bootstrap, identical for
both). "Raw-only alerts" = months the raw agent flags far above normal while the harmonized agent does not → caused by the
satellite switch, not by fire.
"""
from __future__ import annotations

import calendar
import datetime as dt
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import config, read_json, write_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "data" / "v1"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
SEVERITY = {"Normal": 0, "Unusually low": 1, "Watch": 2, "Alert": 3}


def classify(pct: list[float] | None, guard: bool, beyond: bool, w: dict) -> tuple[str, str | None]:
    """Status and the rule that fired. Pure function — unit-tested for every rule incl. the low-activity guard."""
    if guard:
        return "Normal", "low_activity_guard"
    if pct is None:
        return "Normal", None
    lo, hi = pct
    if beyond or lo >= w["alert_pct"]:
        return "Alert", "above_every_baseline_year"
    if lo >= w["far_above_pct"]:
        return "Watch", "far_above_normal"
    if hi <= w["far_below_pct"]:
        return "Unusually low", "far_below_normal"
    return "Normal", None


RULE_TEXT = {
    "above_every_baseline_year": "above every year in the 2003–2022 baseline (percentile ≥ {alert_pct})",
    "far_above_normal": "far above normal: above the 90th percentile (P{far_above_pct}) even at the low end of our uncertainty",
    "far_below_normal": "far below normal: below the 10th percentile (P{far_below_pct}) even at the high end of our uncertainty",
    "low_activity_guard": "too little fire to judge (typical value under 5 and this value under 10) — no alarm",
    "live_spike": "live spike: last-72 h detections at least {live_spike_ratio}× the expected count",
}


def weibull(x: float, base: np.ndarray) -> float:
    return 100.0 * np.sum(base <= x) / (len(base) + 1)


def check(doc: dict, kind: str, w: dict) -> dict:
    s = doc["latest"] if kind == "mtd" else doc["latest_complete"]
    rec = next(r for r in doc["months"] if r["y"] == s["y"] and r["m"] == s["m"])
    status, rule = classify(s.get("pct"), bool(s.get("guard")), bool(s.get("beyond_record")), w)
    return {"id": kind, "label": "This month so far" if kind == "mtd" else "Last full month",
            "y": s["y"], "m": s["m"], "month": f"{MONTHS[s['m'] - 1]} {s['y']}", "days": s.get("days") if kind == "mtd" else None,
            "value": s["value"], "lo": s["lo"], "hi": s["hi"], "median": s.get("median"), "ratio": s.get("ratio"),
            "pct": s.get("pct"), "return_period": s.get("return_period"), "beyond_record": bool(s.get("beyond_record")),
            "guard": bool(s.get("guard")), "flags": rec["flags"], "status": status, "rule": rule,
            "rule_text": RULE_TEXT[rule].format(**w) if rule else None}


def expected_live(doc: dict, w: dict, today: dt.date) -> dict:
    """Expected 72 h VIIRS detections for this calendar month: median S-NPP monthly detections over the live baseline,
    × 3 / days in month, × live_satellites (the live feed has two VIIRS satellites)."""
    m = today.month
    b0, b1 = w["live_baseline"]
    vals = [r["hot_viirs"] for r in doc["months"] if r["m"] == m and b0 <= r["y"] <= b1 and r.get("hot_viirs") is not None]
    days = calendar.monthrange(today.year, m)[1]
    med = float(np.median(vals)) if vals else 0.0
    return {"month": MONTHS[m - 1], "median_monthly_detections": round(med), "expected_72h": round(med * 3 / days * w["live_satellites"], 1),
            "baseline": [b0, b1]}


def backtest(doc: dict, w: dict, base_years: list[int], g_med: float = 5, g_val: float = 10) -> dict:
    (y0, m0), (y1, m1) = [tuple(int(p) for p in s.split("-")) for s in w["backtest"]]
    M = {(r["y"], r["m"]): r for r in doc["months"]}

    def raw(r):
        if "insufficient" in r["flags"]:
            return None
        return r["raw_modis"] if r["y"] < 2012 else r["raw_viirs"]

    def harm(r):
        return r["H"]

    out = {}
    for name, f in (("raw", raw), ("harmonized", harm)):
        hi, lo = set(), set()
        for y in range(y0, y1 + 1):
            for m in range(1, 13):
                if (y, m) < (y0, m0) or (y, m) > (y1, m1) or (y, m) not in M:
                    continue
                x = f(M[(y, m)])
                if x is None:
                    continue
                b = np.array([f(M[(yy, m)]) for yy in range(base_years[0], base_years[1] + 1)
                              if (yy, m) in M and f(M[(yy, m)]) is not None and M[(yy, m)]["src"] != "T"])
                if len(b) < 5:
                    continue
                guard = float(np.median(b)) < g_med and x < g_val
                p = round(weibull(x, b))
                st, _ = classify([p, p], guard, False, w)
                if st in ("Watch", "Alert"):
                    hi.add((y, m))
                elif st == "Unusually low":
                    lo.add((y, m))
        out[name] = (hi, lo)
    rh, rl = out["raw"]
    hh, hl = out["harmonized"]
    years = range(y0, y1 + 1)
    return {"raw_alerts": len(rh), "harmonized_alerts": len(hh), "raw_only_alerts": len(rh - hh), "both": len(rh & hh),
            "harmonized_only_alerts": len(hh - rh), "raw_lows": len(rl), "harmonized_lows": len(hl), "lows_missed_by_raw": len(hl - rl),
            "per_year": {str(y): {"raw": sum(1 for k in rh if k[0] == y), "harmonized": sum(1 for k in hh if k[0] == y),
                                  "raw_only": sum(1 for k in rh - hh if k[0] == y)} for y in years},
            "raw_only_months": [f"{yy}-{mm:02d}" for yy, mm in sorted(rh - hh)],
            # Round 7: the months the harmonized agent flags — the agentic check (12_agent.py) verifies exactly these
            "harmonized_flagged": {"up": [f"{yy}-{mm:02d}" for yy, mm in sorted(hh)], "down": [f"{yy}-{mm:02d}" for yy, mm in sorted(hl)]}}


def relevant(region: str, checks: list[dict], w: dict) -> str:
    rf = w["relevant_for"]
    if region == "punjab" and any(c["m"] in (10, 11) for c in checks):
        return rf["punjab_octnov"]
    return rf.get(region, "researchers and journalists")


def main() -> None:
    cfg = config()
    w = cfg["watch"]
    base = cfg["stats"]["baseline"]
    meta = read_json(WEB / "meta.json")
    today = dt.date.fromisoformat(meta["data_end"])
    regions, totals = {}, {}
    for r in meta["regions"]:
        doc = read_json(WEB / "regions" / f"{r['id']}.json")
        checks = [check(doc, "mtd", w), check(doc, "last_full", w)] if doc["latest"]["mtd"] else [check(doc, "last_full", w)]
        status = max((c["status"] for c in checks), key=SEVERITY.get)
        flags = sorted({f for c in checks for f in c["flags"]} | ({"low_activity"} if (doc.get("validation") or {}).get("low_activity") else set()))
        regions[r["id"]] = {"name": doc["name"], "status": status, "checks": checks, "flags": flags,
                            "relevant_for": relevant(r["id"], checks, w), "live_expected": expected_live(doc, w, today),
                            "backtest": backtest(doc, w, base, cfg["stats"]["guard_median_lt"], cfg["stats"]["guard_value_lt"])}
        print(f"{r['id']:<13} {status:<14} " + " | ".join(f"{c['label']} {c['month']}: {c['status']} ({c['rule']})" for c in checks)
              + f" | backtest raw {regions[r['id']]['backtest']['raw_alerts']} harm {regions[r['id']]['backtest']['harmonized_alerts']}"
              f" raw-only {regions[r['id']]['backtest']['raw_only_alerts']}", flush=True)
    for k in ("raw_alerts", "harmonized_alerts", "raw_only_alerts", "both", "harmonized_only_alerts", "raw_lows", "harmonized_lows", "lows_missed_by_raw"):
        totals[k] = sum(v["backtest"][k] for v in regions.values())
    per_year = {y: {k: sum(v["backtest"]["per_year"][y][k] for v in regions.values()) for k in ("raw", "harmonized", "raw_only")}
                for y in next(iter(regions.values()))["backtest"]["per_year"]}
    write_json(WEB / "watch.json", {
        "version": "v1", "data_end": meta["data_end"], "rules": {k: w[k] for k in ("alert_pct", "far_above_pct", "far_below_pct", "live_spike_ratio", "live_min_expected", "live_satellites")},
        "rule_text": {k: v.format(**w) for k, v in RULE_TEXT.items()},
        "backtest": {"period": w["backtest"], "baseline": base, "totals": totals, "per_year": per_year,
                     "method": "Same percentile rules on raw (MODIS to 2011, unconverted VIIRS after) and harmonized monthly fire-days, each vs its own 2003–2022 same-month baseline; point percentile; low-activity guard on both."},
        "regions": regions})
    print(f"backtest totals: raw {totals['raw_alerts']} alerts, raw-only {totals['raw_only_alerts']}, harmonized {totals['harmonized_alerts']}; "
          f"lows raw {totals['raw_lows']} vs harmonized {totals['harmonized_lows']}", flush=True)


if __name__ == "__main__":
    main()
