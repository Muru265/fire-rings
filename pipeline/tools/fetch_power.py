"""NASA POWER monthly rainfall + temperature per Fire Rings region (P1.7c) → web/public/data/v1/api/power/{region}.json.

Points: the region's most fire-active H3 res-3 cells (~12,000 km² each; the parents of the region footprint cells in
live/{region}.json, ranked by how many footprint cells they contain), up to 9 per region; values are the plain mean of
those points. Monthly 2001–2025 from the POWER monthly point API; 2026 months from the daily point API, averaged
(T2M) / summed (rain) over complete months only. Parameters: PRECTOTCORR (bias-corrected precipitation, mm/day → mm per
month = mm/day × days) and T2M (2 m air temperature, °C). Source: NASA POWER (MERRA-2), community AG.
Raw API responses cached under data/raw/power/ (gitignored). Usage: python pipeline/tools/fetch_power.py
"""
from __future__ import annotations

import calendar
import collections
import datetime as dt
import json
import sys
import time
from pathlib import Path

import h3
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from lib.common import config, read_json, write_json  # noqa: E402

CACHE = ROOT / "data" / "raw" / "power"
API = "https://power.larc.nasa.gov/api/temporal"
MAX_POINTS = 9


def get(url: str, f: Path) -> dict:
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=120)
            if r.ok:
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(r.text, encoding="utf-8")
                time.sleep(1)
                return r.json()
            print("  POWER", r.status_code, r.text[:120])
        except requests.RequestException as e:
            print("  POWER", type(e).__name__)
        time.sleep(5 * (attempt + 1))
    raise SystemExit(f"POWER failed: {url}")


def points(region: str, web: Path) -> list[tuple[float, float, int]]:
    live = read_json(web / "live" / f"{region}.json")
    c = collections.Counter(h3.cell_to_parent(x, 3) for x in live["footprint"])
    out = []
    for cell, n in c.most_common(MAX_POINTS):
        lat, lon = h3.cell_to_latlng(cell)
        out.append((round(lat, 3), round(lon, 3), n))
    return out


def main() -> None:
    cfg = config()
    web = Path(cfg["paths"]["web"])
    today = dt.date.today()
    for rid, rc in cfg["regions"].items():
        pts = points(rid, web)
        print(rid, f"{len(pts)} points")
        per = collections.defaultdict(lambda: {"rain": [], "t2m": []})
        for lat, lon, _ in pts:
            m = get(f"{API}/monthly/point?parameters=PRECTOTCORR,T2M&community=AG&longitude={lon}&latitude={lat}&start=2001&end=2025&format=JSON",
                    CACHE / f"{rid}_{lat}_{lon}_monthly_2001_2025.json")
            p = m["properties"]["parameter"]
            for k, v in p["PRECTOTCORR"].items():
                y, mm = int(k[:4]), int(k[4:])
                if mm == 13 or v == -999:
                    continue
                per[(y, mm)]["rain"].append(v * calendar.monthrange(y, mm)[1])
                t = p["T2M"].get(k)
                if t is not None and t != -999:
                    per[(y, mm)]["t2m"].append(t)
            d = get(f"{API}/daily/point?parameters=PRECTOTCORR,T2M&community=AG&longitude={lon}&latitude={lat}&start=20260101&end={today:%Y%m%d}&format=JSON",
                    CACHE / f"{rid}_{lat}_{lon}_daily_2026_{today:%Y%m%d}.json")
            pd = d["properties"]["parameter"]
            days = collections.defaultdict(list)
            for k, v in pd["PRECTOTCORR"].items():
                t = pd["T2M"].get(k)
                if v == -999 or t is None or t == -999:
                    continue
                days[(int(k[:4]), int(k[4:6]))].append((v, t))
            for (y, mm), vals in days.items():
                if len(vals) == calendar.monthrange(y, mm)[1]:   # complete months only
                    per[(y, mm)]["rain"].append(sum(v for v, _ in vals))
                    per[(y, mm)]["t2m"].append(sum(t for _, t in vals) / len(vals))
        rows = []
        for (y, mm) in sorted(per):
            r = per[(y, mm)]
            if len(r["rain"]) == len(pts) and len(r["t2m"]) == len(pts):
                rows.append([y, mm, round(sum(r["rain"]) / len(pts), 1), round(sum(r["t2m"]) / len(pts), 2)])
        clim = []
        for mm in range(1, 13):
            base = [x for x in rows if x[1] == mm and 2003 <= x[0] <= 2022]
            rs = sorted(x[2] for x in base)
            ts = sorted(x[3] for x in base)
            med = lambda a: (a[len(a) // 2] if len(a) % 2 else (a[len(a) // 2 - 1] + a[len(a) // 2]) / 2) if a else None  # noqa: E731
            clim.append({"m": mm, "rain_mm_median": round(med(rs), 1) if rs else None, "t2m_c_median": round(med(ts), 2) if ts else None, "n": len(base)})
        write_json(web / "api" / "power" / f"{rid}.json", {
            "region": rid, "name": rc["name"], "source": "NASA POWER (power.larc.nasa.gov), MERRA-2, community AG; monthly API 2001–2025, daily API for 2026 complete months",
            "parameters": {"rain_mm": "PRECTOTCORR (bias-corrected precipitation), mm per month = mm/day × days", "t2m_c": "T2M, 2 m air temperature, °C, monthly mean"},
            "points": [{"lat": a, "lon": b, "footprint_cells": n} for a, b, n in pts],
            "points_note": "Mean of the region's most fire-active ~12,000 km² cells (H3 res-3 parents of the fire footprint).",
            "baseline": [2003, 2022], "fields": ["y", "m", "rain_mm", "t2m_c"], "months": rows, "climatology": clim,
            "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        })
        print(f"  {len(rows)} months · last {rows[-1][:2] if rows else None}")


if __name__ == "__main__":
    main()
