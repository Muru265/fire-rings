"""12 — Agentic check ("rules decide, AI explains"): verify Fire Watch flags with independent tools, record a verdict.

For every region-month Fire Watch flags (far above normal / above every baseline year = "up"; far below normal = "down"):
  A  check_detection_times   (agent/timing.py)       always
  B  check_burned_area       (agent/burned_area.py)  MCD64A1; needs Earthdata login for new months
  C  check_geostationary     GOES (agent/goes.py) for Americas regions; Meteosat LSA SAF (agent/meteosat.py) for
                             tanzania/madagascar when LSASAF_USER/LSASAF_PASS exist; otherwise "pending_access"/"not_covered"
→ agent/verdict.py (deterministic rule table). Gemini never decides; it only explains the stored verdict.

Which months: (1) BACKTEST = the harmonized backtest's flagged months 2013–2025 (watch.json → backtest.harmonized_flagged,
same rules as Fire Watch); (2) CURRENT = this month so far / last full month when their Fire Watch status is not Normal.
Outputs (adds fields only — never touches a harmonized number):
  watch.json            regions[id].timing_check (current flagged months) + backtest.agent (verdict counts)
  api/agent_check/{id}.json   every checked month of the region (current + backtest), CORS * like all /data/v1
  dataset CSV/Parquet   column timing_check = verdict for checked months, empty otherwise
Usage: python pipeline/12_agent.py [--build-timing] [--fetch] [--current-only]
  --build-timing  LOCAL (needs data/clean): rebuild pipeline/assets/agent/timing.json
  --fetch         network: MCD64A1 for months that need it (Earthdata secrets), Meteosat/GOES where configured
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

PIPE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPE))
from lib.common import config, published_regions, read_json, write_json  # noqa: E402
from agent import burned_area as B, goes as C1, meteosat as C2, timing as A  # noqa: E402
from agent.common import ASSETS, load_cache, mkey, now_iso, parse_key, save_cache  # noqa: E402
from agent.verdict import VERDICTS, verdict  # noqa: E402

ROOT = PIPE.parent
WEB = ROOT / "web" / "public" / "data" / "v1"
BACKTEST_START = "2013-01"
AMERICAS = {r for r in ("mato_grosso",)}
SOURCES = {"A": A.SOURCE, "B": B.SOURCE, "C1": C1.SOURCE, "C2": C2.SOURCE}


# ------------------------------------------------------------------------------------------------ inputs
def build_timing() -> None:
    from lib.common import connect, path, sql_path
    con = connect()
    cache = load_cache(A.CACHE)
    for r in published_regions():
        cache[r] = A.build_from_clean(r, con, sql_path(path("clean") / f"{r}_filtered.parquet"))
        print(f"timing summaries {r}: {len(cache[r])} months", flush=True)
    cache["_thresholds"] = A.calibrate(cache, published_regions())
    print(f"timing thresholds (null distribution 2013–2019, P97.5): {cache['_thresholds']}", flush=True)
    save_cache(A.CACHE, cache)


def flagged_months(watch: dict) -> list[dict]:
    """[{region, month, direction, kind}] — backtest months (2013–2025) + current flagged checks."""
    out = []
    for rid, reg in watch["regions"].items():
        hf = reg["backtest"].get("harmonized_flagged", {})
        for d in ("up", "down"):
            for k in hf.get(d, []):
                if k >= BACKTEST_START:
                    out.append({"region": rid, "month": k, "direction": d, "kind": "backtest"})
        for c in reg["checks"]:
            if c["id"] == "live" or c["status"] == "Normal":
                continue
            out.append({"region": rid, "month": mkey(c["y"], c["m"]), "direction": "down" if c["status"] == "Unusually low" else "up",
                        "kind": "current", "check": c["id"], "status": c["status"]})
    return out


def geo_tool(region: str, month: str) -> dict:
    if region in C1.REGIONS:
        return C1.check_geostationary_goes(region, month)
    if region in C2.REGIONS:
        return C2.check_geostationary_meteosat(region, month)
    return {"tool": "check_geostationary", "signal": "not_covered", "month": month,
            "note": "no geostationary check for this region yet (Himawari for Australia, INSAT for India: future work)"}


# ------------------------------------------------------------------------------------------------ fetch (network)
def fetch(items: list[dict], today: dt.date, log=print) -> None:
    if B.credentials():
        need: dict[str, set] = {}
        for it in items:
            y, m = parse_key(it["month"])
            ks = {it["month"]} | {mkey(yy, m) for yy in range(B.BASE_YEARS[0], B.BASE_YEARS[1] + 1)}
            need.setdefault(it["region"], set()).update(k for k in ks if parse_key(k) <= (today.year, today.month))
        for r, ks in need.items():
            try:
                B.fetch(r, sorted(ks), log=log)
            except Exception as e:   # network / NASA outage → the tool reports "unavailable"; never a fake value
                log(f"   burned area {r}: fetch failed ({type(e).__name__}) — reported as unavailable")
    else:
        log("   Earthdata credentials not set — burned area: cached months only, others 'unavailable'/'not_yet_published'")
    if C2.credentials():
        cache = load_cache(C2.CACHE)
        for it in items:
            if it["region"] in C2.REGIONS and it["month"] not in cache.get(it["region"], {}):
                try:
                    from agent.common import footprint
                    import h3
                    fp = footprint(it["region"])
                    inr = lambda la, lo, fp=fp: h3.latlng_to_cell(la, lo, fp["res"]) in fp["cells"] and h3.latlng_to_cell(la, lo, 9) not in fp["static"]  # noqa: E731
                    cache.setdefault(it["region"], {})[it["month"]] = C2.month_profile(it["region"], it["month"], inr, log=log)
                    save_cache(C2.CACHE, cache)
                except PermissionError as e:
                    log(f"   Meteosat: {e} — pending access")
                    break
                except Exception as e:
                    log(f"   Meteosat {it['region']} {it['month']}: {type(e).__name__} — skipped")
    else:
        log("   LSA SAF credentials not set — Meteosat check pending access")


# ------------------------------------------------------------------------------------------------ run the agent
def run_one(it: dict, today: dt.date) -> dict:
    a = A.check_detection_times(it["region"], it["month"])
    b = B.check_burned_area(it["region"], it["month"], it["direction"], today=today)
    c = geo_tool(it["region"], it["month"])
    v, rule = verdict(it["direction"], a["signal"], b["signal"], c["signal"])
    flag = "far below normal" if it["direction"] == "down" else "far above normal"
    trace = [
        {"step": 1, "tool": "check_detection_times", "input": {"region": it["region"], "month": it["month"]}, "result": a},
        {"step": 2, "tool": "check_burned_area", "input": {"region": it["region"], "month": it["month"], "direction": it["direction"]}, "result": b},
        {"step": 3, "tool": "check_geostationary", "input": {"region": it["region"], "month": it["month"]}, "result": c},
        {"step": 4, "tool": "verdict_rules", "input": {"direction": it["direction"], "A": a["signal"], "B": b["signal"], "C": c["signal"]},
         "result": {"verdict": v, "rule": rule}},
    ]
    used = ["A"] + (["B"] if b["signal"] not in ("unavailable",) else []) + (["C1"] if c.get("source") == C1.SOURCE and c["signal"] != "not_covered" else [])
    used += ["C2"] if c.get("source") == C2.SOURCE and c["signal"] not in ("pending_access", "not_covered") else []
    return {"region": it["region"], "month": it["month"], "flag": flag, "direction": it["direction"], "kind": it["kind"],
            **({"check": it["check"], "status": it["status"]} if it["kind"] == "current" else {}),
            "verdict": v, "rule": rule, "signals": {"detection_times": a["signal"], "burned_area": b["signal"], "geostationary": c["signal"]},
            "evidence": evidence_lines(a, b, c), "trace": trace, "sources": [SOURCES[k] for k in used], "checked_at": now_iso()}


def evidence_lines(a: dict, b: dict, c: dict) -> list[str]:
    """2–3 plain lines built only from tool numbers."""
    L = []
    if a["signal"] == "too_few_detections":
        L.append("Detection times: too few VIIRS detections to compare.")
    else:
        x = lambda v: "—" if v is None else f"×{v}"  # noqa: E731
        hs = "—" if a.get("mean_hour_shift") is None else f"{a['mean_hour_shift']:+.2f} h"
        L.append(f"Detection times: Aqua÷VIIRS {x(a.get('aqua_viirs_rel'))}, night share {x(a.get('night_share_rel'))} vs {a['baseline']}; "
                 f"mean VIIRS hour {hs} → {'shift' if a['signal'] == 'timing_shift' else 'no shift'}.")
    if b["signal"] in ("burned_area_agrees", "burned_area_disagrees"):
        L.append(f"Burned area (MCD64A1): {b['burned_km2']:,} km² vs typical {b['baseline_km2']:,} km² (×{b['ratio']}) → "
                 f"{'agrees' if b['signal'] == 'burned_area_agrees' else 'does not agree'} with the flag.")
    elif b["signal"] == "not_yet_published":
        L.append("Burned area (MCD64A1): not yet published for this month.")
    else:
        L.append(f"Burned area (MCD64A1): unavailable ({b.get('note', 'no data')}).")
    if c["signal"] in ("fires_outside_overpass_hours", "fires_match_overpass"):
        L.append(f"Geostationary: {round(100 * c['share_outside_polar_hours'])}% of sampled fire pixels outside polar overpass hours.")
    elif c["signal"] == "pending_access":
        L.append("Geostationary: Meteosat check ready — waiting for data access.")
    return L


def write_outputs(results: list[dict], watch: dict) -> dict:
    by_region: dict[str, dict] = {}
    for r in results:
        by_region.setdefault(r["region"], {})[r["month"]] = r
    (WEB / "api" / "agent_check").mkdir(parents=True, exist_ok=True)
    for rid in watch["regions"]:
        checks = dict(sorted(by_region.get(rid, {}).items()))
        write_json(WEB / "api" / "agent_check" / f"{rid}.json", {
            "region": rid, "name": watch["regions"][rid]["name"], "generated": now_iso(),
            "what": "Agentic check of Fire Watch flags: verification tools + deterministic verdict (rules decide, AI explains)",
            "verdicts": list(VERDICTS), "checks": checks}, compact=True)
        cur = [v for v in checks.values() if v["kind"] == "current"]
        watch["regions"][rid]["timing_check"] = cur or None
    bt = [r for r in results if r["kind"] == "backtest"]
    counts = {v: sum(1 for r in bt if r["verdict"] == v) for v in VERDICTS}
    by_dir = {d: {v: sum(1 for r in bt if r["verdict"] == v and r["direction"] == d) for v in VERDICTS} for d in ("up", "down")}
    tools_ran = {k: sorted({r["region"] for r in bt if r["signals"][s] not in ("not_covered", "pending_access", "unavailable")})
                 for k, s in (("detection_times", "detection_times"), ("burned_area", "burned_area"), ("geostationary", "geostationary"))}
    watch["backtest"]["agent"] = {"period": [BACKTEST_START, watch["backtest"]["period"][1]], "months_checked": len(bt), "verdicts": counts,
                                  "by_direction": by_dir, "regions_with_data": tools_ran,
                                  "americas": sorted(set(published_regions()) & AMERICAS) or None}
    write_json(WEB / "watch.json", watch)
    return {"counts": counts, "by_dir": by_dir, "n": len(bt)}


def add_dataset_column(results: list[dict]) -> None:
    import polars as pl
    look = {(r["region"], *parse_key(r["month"])): r["verdict"] for r in results}
    ds = WEB / "dataset"
    pq = ds / "harmonized_monthly_regions_v1.parquet"
    df = pl.read_parquet(pq)
    col = [look.get((a, y, m), "") for a, y, m in zip(df["region"], df["year"], df["month"])]
    df = df.drop("timing_check", strict=False).with_columns(pl.Series("timing_check", col, dtype=pl.Utf8))
    df.write_parquet(pq)
    csv = ds / "harmonized_monthly_regions_v1.csv"
    head = csv.read_text(encoding="utf-8").split("\n", 1)[0]
    if "timing_check" not in head:
        head += " timing_check = agentic-check verdict for Fire Watch-flagged months (empty otherwise)."
    with csv.open("w", encoding="utf-8", newline="") as fh:
        fh.write(head + "\n")
        fh.write(df.write_csv())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build-timing", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    a = ap.parse_args()
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
    except ImportError:
        pass
    if a.build_timing:
        build_timing()
    watch = read_json(WEB / "watch.json")
    today = dt.date.fromisoformat(watch["data_end"])
    items = flagged_months(watch)
    if a.fetch:
        fetch(items, today)
    results = [run_one(it, today) for it in items]
    s = write_outputs(results, watch)
    add_dataset_column(results)
    print(f"agent: {s['n']} backtest months · verdicts {s['counts']} · up {s['by_dir']['up']} · down {s['by_dir']['down']}", flush=True)
    for r in results:
        if r["kind"] == "current":
            print(f"   current {r['region']} {r['month']} ({r['flag']}): {r['verdict']} — {r['rule']}", flush=True)


if __name__ == "__main__":
    main()
