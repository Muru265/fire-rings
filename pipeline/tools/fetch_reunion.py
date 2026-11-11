"""Download FIRMS standard (SP) detections for a Piton de la Fournaise (Réunion) box, MODIS 2000→ and VIIRS S-NPP 2012→,
from the FIRMS Area API in 5-day calls, for the windows around each Smithsonian GVP eruption (start − 35 days to end + 5
days; GVP list in data/raw/gvp_233020_eruptions.json). One call costs ~15 FIRMS transactions (measured 11 Nov 2026), so a
full 26-year download (~45,000 transactions) would starve the shared key; windows need ~10× fewer. Raw CSVs are cached under data/raw/reunion/{source}/{start}.csv (gitignored);
re-running resumes (existing chunks are skipped). 4 parallel workers (~1–2 calls/s) to stay far below the 5,000 transactions /
10 min key limit (shared with the live site). Key from .env (FIRMS_MAP_KEY), never printed.
Usage: python pipeline/tools/fetch_reunion.py
"""
from __future__ import annotations

import datetime as dt
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
BOX = "55.60,-21.36,55.86,-21.14"   # W,S,E,N — Enclos Fouqué caldera, summit and eastern flanks down to the sea
SOURCES = {"MODIS_SP": ("2000-11-01", "2026-08-31"), "VIIRS_SNPP_SP": ("2012-01-20", "2026-07-31")}
OUT = ROOT / "data" / "raw" / "reunion"
WORKERS = 1
PAUSE_S = 6.0          # ~10 calls/min ≈ 150 transactions/min ≈ 30% of the key limit
GVP = ROOT / "data" / "raw" / "gvp_233020_eruptions.json"


def fetch_one(s: requests.Session, key: str, src: str, day: dt.date, n: int, f: Path) -> None:
    for attempt in range(8):
        try:
            r = s.get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{BOX}/{n}/{day}", timeout=60)
            txt = r.text
            if r.status_code == 200 and txt.startswith("latitude"):
                f.write_text(txt, encoding="utf-8")
                return
            print(f"{src} {day}: HTTP {r.status_code} {txt[:80].replace(key, '***')!r} — waiting", flush=True)
            time.sleep(300 if "xceed" in txt or r.status_code == 429 else 10)
        except requests.RequestException as e:
            print(f"{src} {day}: {type(e).__name__} — retry", flush=True)
            time.sleep(10)
    raise RuntimeError(f"giving up at {src} {day}")


def main() -> None:
    load_dotenv(ROOT / ".env")
    key = os.environ["FIRMS_MAP_KEY"]
    import json
    wins = []
    for f in json.loads(GVP.read_text(encoding="utf-8"))["features"]:
        p = f["properties"]
        if (p.get("StartDateYear") or 0) < 2000 or not p.get("StartDateMonth") or not p.get("StartDateDay"):
            continue
        st = dt.date(p["StartDateYear"], p["StartDateMonth"], p["StartDateDay"])
        en = dt.date(p["EndDateYear"], p["EndDateMonth"], p["EndDateDay"]) if p.get("EndDateDay") else st
        wins.append((st - dt.timedelta(days=35), en + dt.timedelta(days=5)))
    jobs = []
    for src, (a, b) in SOURCES.items():
        d = OUT / src
        d.mkdir(parents=True, exist_ok=True)
        day, end = dt.date.fromisoformat(a), dt.date.fromisoformat(b)
        while day <= end:          # fixed 5-day grid from the product start, so chunk files never overlap
            n = min(5, (end - day).days + 1)
            last = day + dt.timedelta(days=n - 1)
            f = d / f"{day}.csv"
            if not f.exists() and any(w0 <= last and day <= w1 for w0, w1 in wins):
                jobs.append((src, day, n, f))
            day += dt.timedelta(days=n)
    print(f"{len(jobs)} chunks to fetch", flush=True)
    s = requests.Session()
    for done, j in enumerate(jobs, 1):
        fetch_one(s, key, *j)
        time.sleep(PAUSE_S)
        if done % 50 == 0:
            print(f"{done}/{len(jobs)}", flush=True)
    print(f"done · {len(jobs)} new calls", flush=True)


if __name__ == "__main__":
    main()
