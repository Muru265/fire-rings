"""Monthly automatic retraining (Round 5B, Part E) — run by .github/workflows/retrain.yml on the 2nd of each month.

Uses ONLY committed files + a few small FIRMS API calls (data/ is never in the repo):
 1. fetch NOAA-20 NRT detections (FIRMS area API, VIIRS_NOAA20_NRT, ≤ 5-day chunks, throttled, cached, call budget)
    for each published region's box, for complete months after the record's last complete month (NOAA-20 era only);
 2. apply the record's filters (low confidence dropped; known-static H3 res-9 cells and the region footprint from
    web/public/data/v1/live/{id}.json) and count fire-days per H3 res-6 cell on the solar date;
 3. add/replace only those newest provisional months in pipeline/assets/model/recent/{id}.json — the model reads them
    with the FROZEN published ratios (no recalibration); the Long-term record files are never touched;
 4. retrain a challenger (same features, recipe chosen by validation on training years only);
 5. run the same rolling-origin backtest (2018–2025) for the challenger, and score champion + challenger + climatology on
    the newest complete target months that NEITHER model was trained on (the fair head-to-head);
 6. publish the challenger only if it beats BOTH the champion and climatology on PR-AUC and top-10 % capture (and passes
    the climatology gate in the backtest); otherwise keep the champion, which still scores next month with fresh data;
 7. append a line to web/public/data/v1/api/model_history.json.
Steps 8–9 (pytest + claims_check, commit + push as Muru265) are in the workflow. Any exception → exit 1, nothing written.

Usage: python pipeline/retrain.py [--dry-run] [--no-fetch] [--today YYYY-MM-DD]
  --dry-run   no network, no writes: report what would be fetched and the decision on the current files
  --no-fetch  skip the FIRMS fetch (use the recent store as it is) but write the results
The FIRMS key is read from the FIRMS_MAP_KEY environment variable and is never printed or logged.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import datetime as dt
import importlib.util
import io
import json
import os
import sys
import time
from pathlib import Path

import h3
import joblib
import numpy as np
import requests

PIPE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPE))
from lib import model_data as md  # noqa: E402

spec = importlib.util.spec_from_file_location("model11", PIPE / "11_model.py")
M11 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M11)

CACHE = PIPE.parent / "data" / "raw_retrain"
SOURCE = "VIIRS_NOAA20_NRT"
MAX_CALLS = 140         # hard budget per run (9 regions × 7 calls per month ≈ 63, + retries)
CHUNK_DAYS = 5          # the FIRMS area API accepts a day range of 1–5
MAX_MONTHS_BACK = 2     # NRT archives keep only recent months
HOLDOUT_MAX = 3         # newest complete target months used for the champion-vs-challenger head-to-head
calls = 0


# ---------------------------------------------------------------- 1–3: fetch + filter
def months_to_fetch(reg: md.Region, today: dt.date) -> list[int]:
    last_complete = md.midx(today.year, today.month) - 1
    first_v2 = next(i for i in range(len(reg.src)) if reg.src[i] == "V2") if "V2" in reg.src else md.midx(2026, 11)
    start = max(reg.last_full + 1, first_v2, last_complete - MAX_MONTHS_BACK + 1)
    return list(range(start, last_complete + 1))


def fetch_chunk(key: str, bbox: list[float], start: dt.date, days: int, dry: bool) -> str:
    global calls
    f = CACHE / f"{SOURCE}_{'_'.join(f'{v:g}' for v in bbox)}_{start}_{days}.csv"
    if f.exists():
        return f.read_text(encoding="utf-8")
    if dry:
        calls += 1
        return ""
    if calls >= MAX_CALLS:
        raise SystemExit(f"FIRMS call budget ({MAX_CALLS}) reached — stopping without writing")
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{SOURCE}/{','.join(f'{v:g}' for v in bbox)}/{days}/{start}"
    for attempt in range(3):
        calls += 1
        try:
            r = requests.get(url, timeout=90)
            text = r.text
            if r.ok and text.startswith("latitude"):
                CACHE.mkdir(parents=True, exist_ok=True)
                f.write_text(text, encoding="utf-8")
                time.sleep(1.2)
                return text
            print(f"   FIRMS HTTP {r.status_code}: {text[:80].replace(key, '***')}", flush=True)
        except requests.RequestException as e:
            print(f"   FIRMS {type(e).__name__}", flush=True)
        time.sleep(5 * (attempt + 1))
    raise SystemExit("FIRMS unavailable — stopping without writing")


def month_cells(rid: str, i: int, key: str, dry: bool) -> list[list]:
    """Filtered NOAA-20 NRT fire-days per H3 res-6 cell for month index i (solar date inside the month)."""
    live = json.loads((md.WEB / "live" / f"{rid}.json").read_text(encoding="utf-8"))
    foot, res, static = set(live["footprint"]), int(live["footprint_res"]), set(live["static_r9"])
    y, m = md.ym(i)
    d0 = dt.date(y, m, 1) - dt.timedelta(days=1)           # ±1 day: the solar date can fall in the next/previous UTC day
    d1 = dt.date(y, m, calendar.monthrange(y, m)[1]) + dt.timedelta(days=1)
    days_by_cell: dict[str, set] = {}
    cur = d0
    while cur <= d1:
        n = min(CHUNK_DAYS, (d1 - cur).days + 1)
        text = fetch_chunk(key, live["bbox"], cur, n, dry)
        for r in csv.DictReader(io.StringIO(text)) if text else []:
            if (r.get("confidence") or "").lower() in ("l", "low", ""):
                continue
            lat, lon = float(r["latitude"]), float(r["longitude"])
            hhmm = r["acq_time"].zfill(4)
            t = dt.datetime.fromisoformat(f"{r['acq_date']}T{hhmm[:2]}:{hhmm[2:]}:00") + dt.timedelta(hours=lon / 15)
            if (t.year, t.month) != (y, m):
                continue
            if h3.latlng_to_cell(lat, lon, res) not in foot or h3.latlng_to_cell(lat, lon, 9) in static:
                continue
            days_by_cell.setdefault(h3.latlng_to_cell(lat, lon, 6), set()).add(t.date())
        cur += dt.timedelta(days=n)
    return sorted([c, len(s)] for c, s in days_by_cell.items())


# ---------------------------------------------------------------- 4–7: retrain + decide
def holdout_metrics(D: dict, idx: np.ndarray, score: np.ndarray) -> dict:
    m = M11.metrics(D["y"][idx], score, D["group"][idx])
    return {"pr_auc": m["pr_auc"], "capture10": m["capture10"], "roc_auc": m["roc_auc"]}


def retrain(dry: bool) -> dict:
    champ_meta = json.loads(M11.VERSION_FILE.read_text(encoding="utf-8"))
    champion = joblib.load(M11.ASSETS / "champion.joblib")
    regions = md.load_all()
    last_full = min(r.last_full for r in regions)
    D = md.stack(regions, lambda r: [s for s in range(md.midx(2013, 1), r.last_full + 1)], "harm")
    D["year"] = (md.Y0 + D["s"] // 12).astype(np.int16)
    D["group"] = D["region"].astype(np.int64) * 10_000 + D["s"]
    train_end = md.midx(int(champ_meta["train_end"][:4]), int(champ_meta["train_end"][5:7]))
    new_s = sorted({int(s) for s in np.unique(D["s"]) if s > train_end})[-HOLDOUT_MAX:]
    row = {"date": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "data_end": md.key(last_full),
           "trigger": "monthly retrain (GitHub Actions)", "version": champ_meta["version"]}
    if not new_s:
        row.update({"champion": None, "challenger": None, "climatology": {"pr_auc": champ_meta.get("clim_pr_auc", 0), "capture10": champ_meta.get("clim_capture10", 0)},
                    "decision": "no new complete months — kept current model"})
        return {"row": row, "publish": False, "champion": champion, "regions": regions}
    hold = np.flatnonzero(np.isin(D["s"], new_s))
    best, _ = M11.choose_recipe(D, list(M11.RECIPES), M11.TEST_YEARS[0] - 1)
    recipe = M11.RECIPES[best]
    tr = M11.subsample(np.flatnonzero(D["s"] < new_s[0]), M11.SEED)
    chall, _ = M11.fit(recipe, D["X"][tr], D["y"][tr], M11.SEED)
    hc = holdout_metrics(D, hold, chall.predict_proba(D["X"][hold])[:, 1])
    hk = holdout_metrics(D, hold, champion.predict_proba(D["X"][hold])[:, 1])
    hb = holdout_metrics(D, hold, D["b1"][hold])
    # same rolling-origin backtest as the published model card (test years 2018–2025)
    T = M11.rolling_origin(D, recipe, M11.TEST_YEARS, "challenger")
    ev = M11.summarize(T, regions, 60)
    g = M11.gate(ev)
    beats = (hc["pr_auc"] > hk["pr_auc"] and hc["capture10"] > hk["capture10"]
             and hc["pr_auc"] > hb["pr_auc"] and hc["capture10"] > hb["capture10"] and g["passed"])
    row.update({"holdout_months": [md.key(s) for s in new_s], "champion": hk, "challenger": {**hc, "recipe": best},
                "climatology": hb, "challenger_backtest": {k: ev["pooled"]["model"][k] for k in ("pr_auc", "capture10")},
                "decision": "challenger published (beat the current model and the usual season)" if beats else
                            "kept current model (challenger did not beat both the current model and the usual season)"})
    out = {"row": row, "publish": beats, "champion": champion, "regions": regions, "ev": ev, "recipe_name": best, "recipe": recipe, "D": D, "gate": g}
    if beats and not dry:
        full, thr = M11.fit(recipe, D["X"][M11.subsample(np.arange(len(D["y"])), M11.SEED)], D["y"][M11.subsample(np.arange(len(D["y"])), M11.SEED)], M11.SEED)
        out.update({"new_model": full, "thr": thr})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--plan-only", action="store_true", help="with --dry-run: print the fetch plan and call count, skip retraining")
    ap.add_argument("--today", help="pretend today is YYYY-MM-DD (testing the fetch plan; use with --dry-run)")
    a = ap.parse_args()
    key = os.environ.get("FIRMS_MAP_KEY", "")
    if not a.dry_run and not a.no_fetch and not key:
        raise SystemExit("FIRMS_MAP_KEY is not set (GitHub: Settings → Secrets and variables → Actions)")
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    regions = md.load_all()
    store_updates = {}
    for reg in regions:
        todo = months_to_fetch(reg, today)
        print(f"{reg.id:<13} last full {md.key(reg.last_full)} → fetch {[md.key(i) for i in todo] or 'nothing'}", flush=True)
        if a.no_fetch:
            continue
        for i in todo:
            cells = month_cells(reg.id, i, key, a.dry_run)
            store_updates.setdefault(reg.id, {})[md.key(i)] = {"complete": True, "source": SOURCE, "cells": cells,
                                                                "fetched": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")}
            print(f"   {md.key(i)}: {len(cells)} cells with fire", flush=True)
    print(f"FIRMS calls this run: {calls} (budget {MAX_CALLS})", flush=True)
    if a.dry_run and a.plan_only:
        return
    if not a.dry_run:
        for rid, months in store_updates.items():
            p = md.RECENT / f"{rid}.json"
            cur = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"region": rid, "months": {}}
            cur["months"].update(months)
            cur["note"] = ("NOAA-20 NRT fire-days per H3 res-6 cell (record filters) for months after the pipeline record; "
                           "read with the frozen published ratios by lib/model_data.py. Written by pipeline/retrain.py.")
            M11.write_json(p, cur, compact=False)
    res = retrain(a.dry_run)
    print(json.dumps(res["row"], indent=1), flush=True)
    if a.dry_run:
        print("dry run: nothing written")
        return
    if res["publish"]:
        model = res["new_model"]
        joblib.dump(model, M11.ASSETS / "champion.joblib", compress=3)
        prev = json.loads(M11.VERSION_FILE.read_text(encoding="utf-8"))
        version = int(prev["version"]) + 1
        last = max(int(s) for s in np.unique(res["D"]["s"]))
        card = json.loads((M11.API / "model_card.json").read_text(encoding="utf-8"))
        card.update({"version": version, "trained_at": res["row"]["date"], "train_end": md.key(last),
                     "model_selection": {**card["model_selection"], "chosen": res["recipe_name"], "recipe": res["recipe"]},
                     "evaluation": {**card["evaluation"], **res["ev"]}, "gate": res["gate"], "final_threshold": round(res["thr"], 4)})
        M11.write_json(M11.VERSION_FILE, {**prev, "version": version, "recipe": res["recipe_name"], "trained_at": res["row"]["date"], "train_end": md.key(last),
                                          "pr_auc": res["ev"]["pooled"]["model"]["pr_auc"], "capture10": res["ev"]["pooled"]["model"]["capture10"]})
        res["row"]["version"] = version
    else:
        model = res["champion"]
        card = json.loads((M11.API / "model_card.json").read_text(encoding="utf-8"))
    regs = md.load_all()
    card.update(M11.CARD_TEXT)
    card.update({"data_end": res["row"]["data_end"], "features_through": md.key(min(r.last_full for r in regs)),
                 "next_month": sorted({md.key(r.last_full + 1) for r in regs}), "last_run": res["row"]["date"]})
    M11.write_json(M11.API / "model_card.json", card)
    M11.publish_maps(model, regs, card["gate"]["passed"])
    M11.append_history(res["row"])
    print("written: model_history.json, model_card.json, likelihood maps" + (", champion.joblib" if res["publish"] else ""))


if __name__ == "__main__":
    main()
