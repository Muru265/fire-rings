"""01 — Pull recent near-real-time VIIRS (NOAA-20, NOAA-21) for Punjab from the NASA FIRMS Area API.

Writes data/raw_api/punjab/{noaa20,noaa21}/fire_nrt_api.csv (same columns as FIRMS NRT CSVs) and
data/out/nrt_fetch.json (row counts, date range). 02_unify picks these files up as extra NRT rows for the region
(exact duplicates of rows already in the downloaded NRT files are removed there), and the region's data_end is
extended to the last fetched day. The MAP_KEY is read from .env (FIRMS_MAP_KEY) and never printed.

FIRMS Area API: https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAYS}/{DATE}
Usage: python pipeline/01_fetch_nrt.py [--days 60]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import ROOT, config, write_json  # noqa: E402

SOURCES = {"noaa20": "VIIRS_NOAA20_NRT", "noaa21": "VIIRS_NOAA21_NRT"}
CHUNK = 5  # days per request (API limit)
REGION = "punjab"


def fetch(key: str, source: str, bbox: list[float], end: dt.date, days: int) -> list[dict]:
    area = ",".join(str(v) for v in bbox)
    rows: list[dict] = []
    start = end - dt.timedelta(days=days - 1)
    d = start
    while d <= end:
        n = min(CHUNK, (end - d).days + 1)
        url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{area}/{n}/{d.isoformat()}"
        for attempt in range(3):
            r = requests.get(url, timeout=60)
            if r.status_code == 200 and not r.text.lower().startswith("invalid"):
                break
            time.sleep(3 * (attempt + 1))
        else:
            raise RuntimeError(f"FIRMS API failed for {source} {d}: HTTP {r.status_code} {r.text[:120]!r}")
        rows += list(csv.DictReader(io.StringIO(r.text)))
        d += dt.timedelta(days=n)
        time.sleep(0.6)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
    a = ap.parse_args()
    load_dotenv(ROOT / ".env")
    key = os.environ.get("FIRMS_MAP_KEY")
    if not key:
        sys.exit("FIRMS_MAP_KEY missing in .env")
    status = requests.get(f"https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY={key}", timeout=30)
    print("map key status:", {k: v for k, v in status.json().items() if k != "mapkey"} if status.ok else status.status_code)
    bbox = config()["regions"][REGION]["bbox"]
    end = dt.datetime.now(dt.timezone.utc).date()
    summary = {"region": REGION, "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "days": a.days, "sources": {}}
    for folder, source in SOURCES.items():
        rows = fetch(key, source, bbox, end, a.days)
        dest = ROOT / "data" / "raw_api" / REGION / folder / "fire_nrt_api.csv"
        dest.parent.mkdir(parents=True, exist_ok=True)
        cols = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite", "instrument",
                "confidence", "version", "bright_ti5", "frp", "daynight"]
        with dest.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)
        dates = sorted({r["acq_date"] for r in rows})
        sats = sorted({r.get("satellite", "") for r in rows})
        summary["sources"][folder] = {"rows": len(rows), "first": dates[0] if dates else None, "last": dates[-1] if dates else None, "satellites": sats}
        print(f"{folder}: {len(rows):,} rows {dates[0] if dates else '-'} → {dates[-1] if dates else '-'} satellites={sats}")
    lasts = [s["last"] for s in summary["sources"].values() if s["last"]]
    summary["data_end"] = min(lasts) if lasts else None  # last day both VIIRS sources have
    write_json(ROOT / "data" / "out" / "nrt_fetch.json", summary)
    print("region data_end →", summary["data_end"])


if __name__ == "__main__":
    main()
