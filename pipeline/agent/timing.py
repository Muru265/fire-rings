"""Tool A — check_detection_times(region, month): when in the day were the fires detected? (existing FIRMS data, no login)

Reuses the Punjab detection-time method (tools/punjab_timing.py): cell-days = distinct (H3 res-6, solar day) after all of
the record's filters, by satellite and day/night. Per region-month:
  aqua_viirs   Aqua ÷ VIIRS daytime cell-days   (Aqua drifted to a later afternoon pass after Dec 2021; VIIRS ~13:30 stable)
  night_share  VIIRS night ÷ (day + night) cell-days   (~01:30 pass)
  mean_hour    mean local solar hour (UTC + lon/15) of VIIRS daytime detections
VIIRS = S-NPP to Oct 2026, NOAA-20 from Nov 2026 (the record's stream). Baseline = the same calendar month in 2013–2019
(stable orbits, before MODIS drift; NOAA-20 months are compared with that S-NPP baseline).

Signal:
  too_few_detections  VIIRS daytime cell-days < 30 this month, or fewer than 3 baseline years with ≥ 30
  timing_shift        |log(Aqua÷VIIRS ÷ baseline)|, |log(night share ÷ baseline)| or |mean-hour shift| beyond its threshold
  no_timing_shift     otherwise
Thresholds are CALIBRATED on the null distribution (calibrate()): every 2013–2019 month with ≥ 30 VIIRS day cell-days, each
year compared with the mean of the OTHER baseline years (leave-one-year-out), pooled over all published regions; threshold =
97.5th percentile of each metric's deviation. So in the baseline years themselves each metric fires in ~2.5 % of months.
(Round 7 note: first fixed thresholds 1.3× / 1.5× / 0.5 h fired in 24 % of unflagged 2013–2019 months — ordinary noise —
so they were replaced by this calibration before any verdict was published.)
Summaries: pipeline/assets/agent/timing.json (built locally from data/clean; current month updated by daily.py from NRT).
"""
from __future__ import annotations

import numpy as np

from .common import load_cache, mkey, now_iso, parse_key

BASE = (2013, 2019)
MIN_DAY = 30
Q = 97.5
SOURCE = "NASA FIRMS (MODIS/VIIRS)"
CACHE = "timing"


def build_from_clean(region: str, con, clean_path: str) -> dict:
    """Per-month timing summaries from the record's filtered detections (local; needs data/clean)."""
    rows = con.execute(f"""
        WITH t AS (
          SELECT year(solar_date) y, month(solar_date) m, h3r6, solar_date, daynight,
                 CASE WHEN stream = 'SNPP' AND solar_date < DATE '2026-11-01' THEN 'V'
                      WHEN stream = 'N20' AND solar_date >= DATE '2026-11-01' THEN 'V'
                      WHEN stream IN ('AQUA', 'TERRA') THEN stream END s,
                 (hour(t_utc) + minute(t_utc) / 60.0 + lon / 15.0 + 48) % 24 AS sh
          FROM '{clean_path}' WHERE year(solar_date) >= 2012)
        SELECT y, m, s, daynight, count(DISTINCT (h3r6, solar_date)) cd, avg(sh) mh, count(*) n
        FROM t WHERE s IS NOT NULL GROUP BY ALL""").fetchall()
    out: dict = {}
    for y, m, s, dn, cd, mh, n in rows:
        r = out.setdefault(mkey(y, m), {"aqua_day": 0, "terra_day": 0, "viirs_day": 0, "viirs_night": 0, "viirs_day_hour": None})
        if s == "V" and dn == "D":
            r["viirs_day"], r["viirs_day_hour"] = int(cd), round(float(mh), 3)
        elif s == "V" and dn == "N":
            r["viirs_night"] = int(cd)
        elif s == "AQUA" and dn == "D":
            r["aqua_day"] = int(cd)
        elif s == "TERRA" and dn == "D":
            r["terra_day"] = int(cd)
    return out


def metrics(r: dict) -> dict:
    vd, vn = r.get("viirs_day", 0), r.get("viirs_night", 0)
    return {"aqua_viirs": r["aqua_day"] / vd if vd else None, "night_share": vn / (vd + vn) if vd + vn else None,
            "mean_hour": r.get("viirs_day_hour"), "viirs_day": vd}


def _rel(cur: dict, base: list[dict]):
    def bmean(k):
        v = [b[k] for b in base if b[k] is not None]
        return float(np.mean(v)) if v else None
    ba, bn, bh = bmean("aqua_viirs"), bmean("night_share"), bmean("mean_hour")
    aqua_rel = cur["aqua_viirs"] / ba if cur["aqua_viirs"] and ba else None
    night_rel = cur["night_share"] / bn if cur["night_share"] and bn else None
    hour_shift = cur["mean_hour"] - bh if cur["mean_hour"] is not None and bh is not None else None
    return ba, bn, bh, aqua_rel, night_rel, hour_shift


def calibrate(cache: dict, regions: list[str]) -> dict:
    """Null-distribution thresholds (see module doc). Written to cache['_thresholds']."""
    dev = {"aqua": [], "night": [], "hour": []}
    for r in regions:
        reg = cache.get(r, {})
        for m in range(1, 13):
            yrs = {yy: metrics(reg[mkey(yy, m)]) for yy in range(BASE[0], BASE[1] + 1) if mkey(yy, m) in reg}
            yrs = {yy: v for yy, v in yrs.items() if v["viirs_day"] >= MIN_DAY}
            for yy, cur in yrs.items():
                others = [v for k, v in yrs.items() if k != yy]
                if len(others) < 3:
                    continue
                _, _, _, ar, nr, hs = _rel(cur, others)
                if ar:
                    dev["aqua"].append(abs(np.log(ar)))
                if nr:
                    dev["night"].append(abs(np.log(nr)))
                if hs is not None:
                    dev["hour"].append(abs(hs))
    th = {"aqua_log": float(np.percentile(dev["aqua"], Q)), "night_log": float(np.percentile(dev["night"], Q)),
          "hour": float(np.percentile(dev["hour"], Q)), "percentile": Q, "n": {k: len(v) for k, v in dev.items()},
          "regions": regions, "years": list(BASE)}
    th["aqua_x"], th["night_x"] = round(float(np.exp(th["aqua_log"])), 3), round(float(np.exp(th["night_log"])), 3)
    th["hour"] = round(th["hour"], 3)
    return th


def check_detection_times(region: str, month: str, cache: dict | None = None) -> dict:
    cache = cache if cache is not None else load_cache(CACHE)
    th = cache.get("_thresholds")
    reg = cache.get(region, {})
    y, m = parse_key(month)
    out = {"tool": "check_detection_times", "source": SOURCE, "month": month, "baseline": f"same month {BASE[0]}–{BASE[1]}"}
    cur = reg.get(month)
    base = [metrics(reg[mkey(yy, m)]) for yy in range(BASE[0], BASE[1] + 1) if mkey(yy, m) in reg]
    base = [b for b in base if b["viirs_day"] >= MIN_DAY]
    if cur is None or metrics(cur)["viirs_day"] < MIN_DAY or len(base) < 3:
        return {**out, "signal": "too_few_detections", "viirs_day_celldays": None if cur is None else cur.get("viirs_day", 0),
                "baseline_years": len(base)}
    if not th:
        raise RuntimeError("timing thresholds missing — run 12_agent.py --build-timing")
    c = metrics(cur)
    ba, bn, bh, aqua_rel, night_rel, hour_shift = _rel(c, base)
    reasons = []
    if aqua_rel and abs(np.log(aqua_rel)) > th["aqua_log"]:
        reasons.append("aqua_viirs")
    if night_rel and abs(np.log(night_rel)) > th["night_log"]:
        reasons.append("night_share")
    if hour_shift is not None and abs(hour_shift) > th["hour"]:
        reasons.append("mean_hour")
    r3 = lambda v: None if v is None else round(v, 3)  # noqa: E731
    return {**out, "signal": "timing_shift" if reasons else "no_timing_shift", "reasons": reasons,
            "viirs_day_celldays": c["viirs_day"], "baseline_years": len(base),
            "aqua_viirs": r3(c["aqua_viirs"]), "aqua_viirs_baseline": r3(ba), "aqua_viirs_rel": r3(aqua_rel),
            "night_share": r3(c["night_share"]), "night_share_baseline": r3(bn), "night_share_rel": r3(night_rel),
            "mean_hour": None if c["mean_hour"] is None else round(c["mean_hour"], 2),
            "mean_hour_baseline": None if bh is None else round(bh, 2), "mean_hour_shift": None if hour_shift is None else round(hour_shift, 2),
            "thresholds": {"aqua_viirs_x": th["aqua_x"], "night_share_x": th["night_x"], "hour_shift_h": th["hour"]},
            "checked_at": now_iso()}
