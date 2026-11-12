"""Open-API files for outside apps (P1.7) → web/public/data/v1/api/. Everything is derived from published pipeline
outputs (regions/*.json, daily/*.json) or cached official sources; nothing new is fitted.

  api/series/{region}.json      a) monthly harmonized (MODIS-equivalent) vs raw (MODIS to 2011, VIIRS from 2012) series
  api/projection/{region}.json  b) "What to expect" backtest: projection from the month so far vs "typical", per calendar
                                   month × day checkpoints 5/10/15/20/25, leave-one-year-out over the 2003–2022 baseline
  api/power/{region}.json       c) NASA POWER monthly rainfall + temperature (written by tools/fetch_power.py)
  api/reunion.json              d) Piton de la Fournaise detections + GVP eruptions (written by tools/reunion_series.py)
  api/index.json                list of endpoints with example calls

Projection (b), for test year t, calendar month m, checkpoint day d, using only the other baseline years O:
  so_far(y)  = H(y,m) × (daily cell-days on days 1..d) / (daily cell-days in the month)   [H's own daily shape]
  projection = so_far(t) / median_O so_far(y) × median_O H(y,m)          ("on current pace")
  typical    = median_O H(y,m)
  error      = |estimate − H(t,m)| / max(H(t,m), 1); headline = median over years (MdAPE)
  range      = projection × [P10, P90] of H(t,m)/projection over the test years
Low-activity guard (as in the app): no projection test when the month's typical value is under 5 fire-days.
"""
from __future__ import annotations

import calendar
import datetime as dt
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import published_regions, config, read_json, write_json  # noqa: E402

CHECKPOINTS = [5, 10, 15, 20, 25]
GUARD = 5.0


def month_share(daily: dict, y: int, m: int, src: str, d: int) -> float | None:
    rec = daily.get(f"{y}-{m:02d}")
    if not rec:
        return None
    arr = rec.get("modis") if src in ("T", "M") else rec.get("viirs")
    if not arr:
        return None
    tot = float(sum(arr))
    if tot <= 0:
        return 0.0
    return float(sum(arr[:d])) / tot


def q(a, p):
    return float(np.quantile(np.asarray(a, dtype=float), p)) if len(a) else None


def r1(v):
    return None if v is None else round(float(v), 1)


def series_doc(doc: dict) -> dict:
    rows = []
    for r in doc["months"]:
        raw = r["raw_modis"] if r["y"] < 2012 else r["raw_viirs"]
        if "insufficient" in r["flags"]:
            raw = None
        rows.append([r["y"], r["m"], r["H"], r["lo"], r["hi"], raw, r["raw_modis"], r["raw_viirs"], r["src"],
                     "|".join(f for f in r["flags"] if f in ("provisional", "mtd", "insufficient", "uncertain", "terra_only"))])
    return {
        "region": doc["id"], "name": doc["name"], "data_end": doc["data_end"], "baseline": doc["baseline"],
        "fields": ["y", "m", "harmonized", "harmonized_lo90", "harmonized_hi90", "raw", "raw_modis", "raw_viirs", "src", "flags"],
        "units": {"harmonized": "fire-days (MODIS-equivalent, H3 res-6 cell × day)",
                  "raw": "fire-days as each satellite saw them: MODIS cell-days to 2011, VIIRS cell-days from 2012 (not converted)"},
        "note": "Raw jumps in 2012 because VIIRS sees more small fires than MODIS; harmonized converts VIIRS to MODIS-equivalent "
                "with ratios fitted on Jul 2012 – Dec 2019 only. src: T = Terra×q, M = MODIS, V = k·S-NPP, V2 = k·k′·NOAA-20.",
        "months": rows,
    }


def projection_doc(doc: dict, daily: dict) -> dict:
    b0, b1 = doc["baseline"]
    by = {(r["y"], r["m"]): r for r in doc["months"]}
    out_months = []
    for m in range(1, 13):
        years = [y for y in range(b0, b1 + 1) if (y, m) in by and by[(y, m)]["H"] is not None
                 and "insufficient" not in by[(y, m)]["flags"]]
        full = {y: by[(y, m)]["H"] for y in years}
        typ_all = q(list(full.values()), 0.5)
        entry = {"m": m, "years": len(years), "typical": r1(typ_all), "p10": r1(q(list(full.values()), 0.1)),
                 "p90": r1(q(list(full.values()), 0.9)), "checkpoints": []}
        if typ_all is None or typ_all < GUARD or len(years) < 8:
            entry["guard"] = True
            entry["note"] = "too little fire (or too few years) to test a projection — use typical"
            out_months.append(entry)
            continue
        days_in = 28 if m == 2 else calendar.monthrange(2001, m)[1]
        for d in CHECKPOINTS:
            if d >= days_in:
                continue
            sofar = {}
            for y in years:
                s = month_share(daily, y, m, by[(y, m)]["src"], d)
                if s is not None:
                    sofar[y] = full[y] * s
            ys = [y for y in years if y in sofar]
            e_proj, e_typ, ratios = [], [], []
            for t in ys:
                others = [y for y in ys if y != t]
                tf = float(np.median([full[y] for y in others]))
                ts = float(np.median([sofar[y] for y in others]))
                proj = sofar[t] / ts * tf if ts > 0 else tf
                act = full[t]
                e_proj.append(abs(proj - act) / max(act, 1.0))
                e_typ.append(abs(tf - act) / max(act, 1.0))
                if proj > 0:
                    ratios.append(act / proj)
            ep, et = float(np.median(e_proj)) * 100, float(np.median(e_typ)) * 100
            entry["checkpoints"].append({
                "day": d, "n_years": len(ys), "mdape_projection": round(ep, 1), "mdape_typical": round(et, 1),
                "better": "projection" if ep < et else "typical",
                "range_factor": [round(q(ratios, 0.1), 3), round(q(ratios, 0.9), 3)] if len(ratios) >= 5 else None,
                "typical_so_far": r1(float(np.median([sofar[y] for y in ys]))),
            })
        out_months.append(entry)

    # the current month, at today's day of the record
    cur = None
    lt = doc.get("latest")
    if lt and lt.get("mtd") and lt.get("value") is not None:
        y, m, dnow = lt["y"], lt["m"], int(lt["days"])
        e = out_months[m - 1]
        years = [y2 for y2 in range(b0, b1 + 1) if (y2, m) in by and by[(y2, m)]["H"] is not None]
        sofar = [by[(y2, m)]["H"] * s for y2 in years
                 if (s := month_share(daily, y2, m, by[(y2, m)]["src"], dnow)) is not None]
        ts = float(np.median(sofar)) if sofar else None
        cps = e.get("checkpoints") or []
        near = min(cps, key=lambda c: abs(c["day"] - dnow)) if cps else None
        proj = lt["value"] / ts * e["typical"] if ts and e.get("typical") else None
        cur = {"y": y, "m": m, "days": dnow, "so_far": lt["value"], "typical_so_far": r1(ts),
               "typical_so_far_app": lt.get("median"), "typical": e.get("typical"), "p10": e.get("p10"), "p90": e.get("p90"),
               "projection": r1(proj), "checkpoint": near["day"] if near else None,
               "range": [r1(proj * near["range_factor"][0]), r1(proj * near["range_factor"][1])] if proj and near and near["range_factor"] else None,
               "better": (near["better"] if near and dnow >= 3 else "typical"),
               "reason": None if (near and dnow >= 3) else ("too early in the month" if dnow < 3 else "no tested checkpoint"),
               "provisional": True}
        if e.get("guard"):
            cur.update(better="typical", reason="too little fire to project", projection=None, range=None)
    nm = None
    if lt:
        ny, nmm = (lt["y"] + (lt["m"] == 12), lt["m"] % 12 + 1)
        e = out_months[nmm - 1]
        nm = {"y": ny, "m": nmm, "typical": e["typical"], "p10": e["p10"], "p90": e["p90"]}
    return {
        "region": doc["id"], "name": doc["name"], "data_end": doc["data_end"], "baseline": doc["baseline"],
        "unit": "fire-days (MODIS-equivalent)", "checkpoints": CHECKPOINTS,
        "method": "Leave-one-year-out over the baseline years. projection = month-so-far ÷ median same-days-so-far × median full "
                  "month; typical = median full month. Error = median absolute % error vs the real full month (MdAPE). "
                  "Range = projection × P10–P90 of past actual/projection. Not a weather-based forecast.",
        "months": out_months, "current": cur, "next_month": nm,
    }


def main() -> None:
    cfg = config()
    web = Path(cfg["paths"]["web"])
    api = web / "api"
    endpoints = []
    for rid in published_regions():
        doc = read_json(web / "regions" / f"{rid}.json")
        daily = read_json(web / "daily" / f"{rid}.json")
        write_json(api / "series" / f"{rid}.json", series_doc(doc), compact=True)
        p = projection_doc(doc, daily)
        write_json(api / "projection" / f"{rid}.json", p)
        c = p["current"]
        if c:
            print(f"{rid}: {c['y']}-{c['m']:02d} day {c['days']}: so far {c['so_far']} (typical so far {c['typical_so_far']} · app {c['typical_so_far_app']}) "
                  f"→ projection {c['projection']} range {c['range']} · typical {c['typical']} · better: {c['better']}")
        wins = sum(1 for mm in p["months"] for cp in mm["checkpoints"] if cp["better"] == "projection")
        tot = sum(len(mm["checkpoints"]) for mm in p["months"])
        print(f"   projection beats typical at {wins}/{tot} month×checkpoint cells")
    base = "https://fire-rings.vercel.app"
    endpoints = [
        {"path": "/data/v1/meta.json", "what": "regions, record span, latest month per region"},
        {"path": "/data/v1/regions/{region}.json", "what": "full region record: monthly H + 90% range, percentiles, climatology, annual, validation"},
        {"path": "/data/v1/api/series/{region}.json", "what": "monthly harmonized vs raw series (insurance-style index, raw-vs-fixed comparisons)"},
        {"path": "/data/v1/api/projection/{region}.json", "what": "“what to expect”: projection-from-month-so-far vs typical, backtested; current month + next month"},
        {"path": "/data/v1/api/power/{region}.json", "what": "NASA POWER monthly rainfall + temperature for the region (cached)"},
        {"path": "/data/v1/api/reunion.json", "what": "Piton de la Fournaise: daily detections per sensor + Smithsonian GVP eruption dates"},
        {"path": "/data/v1/watch.json", "what": "Fire Watch statuses + raw-vs-harmonized alert backtest"},
        {"path": "/data/v1/dataset/harmonized_monthly_regions_v1.csv", "what": "the open dataset, all regions, one CSV"},
        {"path": "/api/hotspots?region={region}&start=YYYY-MM-DD&end=YYYY-MM-DD[&bbox=W,S,E,N][&format=csv|json]",
         "what": "filtered NASA FIRMS detections for ≤31 days (server-side, cached)"},
        {"path": "/api/live?region={region}", "what": "last 72 h near-real-time detections (provisional)"},
        {"path": "/api/health?scope=data", "what": "service status (no AI call)"},
        {"path": "/data/v1/api/likelihood/{region}.json", "what": "next month: where fire is more likely, per H3 res-6 cell [cell, score 0-1, decile 1-10, climatology]; planning aid, not a forecast of individual fires (only if the model passed its publish gate)"},
        {"path": "/data/v1/api/model_card.json", "what": "prediction model card: target, features, training years, metrics, ablation, limitations, version"},
        {"path": "/data/v1/api/model_history.json", "what": "automatic monthly retraining runs and decisions"},
    ]
    write_json(api / "index.json", {"base": base, "regions": published_regions(), "cors": "Access-Control-Allow-Origin: * on /data/v1/* and the GET APIs above",
                                    "endpoints": endpoints, "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")})


if __name__ == "__main__":
    main()
