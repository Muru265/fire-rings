"""Pre-saved hotspot months for the demo (P1.2), so /api/hotspots and the map dots never depend on NASA being reachable.

Writes web/public/data/v1/hotspots/demo/{region}_{YYYY-MM}.csv (same columns as /api/hotspots CSV) and .json (map dots:
[lat, lon, sensor 0=MODIS 1=VIIRS, solar day]) + index.json, straight from the filtered record (data/clean/*_filtered.parquet):
the exact detections behind the published monthly numbers. Satellites "as in the record": MODIS Terra+Aqua and VIIRS
S-NPP (NOAA-20 from Nov 2026). Months are listed in config.yaml → demo_hotspots.
"""
from __future__ import annotations

import calendar
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import config, connect, path, sql_path, write_json  # noqa: E402

CITATION = ("Murugun Sharma Roma Rishi (2026). Fire Rings Harmonized Hotspot Record v1.1. NASA Space Apps 2026, Port Louis. "
            "Derived from NASA FIRMS MODIS C6.1 and VIIRS 375 m active fire data. Licence CC BY 4.0.")
COLS = "lat,lon,t_utc,solar_date,stream,conf,frp_mw,daynight,product"
# Round 8: same layout as GET /api/hotspots?layout=download (the Explore "Download hotspots (CSV)" button)
DL_COLS = "latitude,longitude,acq_date,acq_time_utc,local_solar_time,satellite,instrument,confidence,frp_mw,daynight,h3_r6"
SAT_NAME = {"TERRA": ("Terra", "MODIS"), "AQUA": ("Aqua", "MODIS"), "SNPP": ("Suomi NPP", "VIIRS"), "N20": ("NOAA-20", "VIIRS"), "N21": ("NOAA-21", "VIIRS")}


def main() -> None:
    cfg = config()
    web = Path(cfg["paths"]["web"])
    out_dir = web / "hotspots" / "demo"
    out_dir.mkdir(parents=True, exist_ok=True)
    con = connect()
    index = []
    for item in cfg["demo_hotspots"]:
        region, month = item["region"], item["month"]
        y, m = map(int, month.split("-"))
        start = dt.date(y, m, 1)
        end = dt.date(y, m, calendar.monthrange(y, m)[1])
        viirs = "N20" if start >= dt.date(2026, 11, 1) else "SNPP"
        filt = sql_path(path("clean") / f"{region}_filtered.parquet")
        rows = con.execute(f"""
            SELECT round(lat,5), round(lon,5), strftime(t_utc, '%Y-%m-%dT%H:%MZ'), solar_date, stream, conf, frp, daynight, product,
                   h3r6, strftime(t_utc + to_seconds(CAST(round(lon / 15.0 * 3600) AS BIGINT)), '%H:%M')
            FROM '{filt}' WHERE solar_date BETWEEN DATE '{start}' AND DATE '{end}' AND stream IN ('TERRA','AQUA','{viirs}')
            ORDER BY t_utc, lat, lon""").fetchall()
        name = cfg["regions"][region]["name"]
        base = f"{region}_{month}"
        with (out_dir / f"{base}.csv").open("w", encoding="utf-8", newline="") as fh:
            fh.write(f"# Fire Rings hotspots · {name} · {start} to {end} · satellites: as in the record (MODIS Terra+Aqua; "
                     f"VIIRS {'S-NPP' if viirs == 'SNPP' else 'NOAA-20'}) · source: pre-saved from the Fire Rings record "
                     f"(NASA FIRMS archive download, standard SP files) · filters: low confidence dropped; FIRMS type 1/2/3 "
                     f"dropped; known-static + persistent H3 res-9 mask; days by solar date (UTC + lon/15 h) · {CITATION}\n")
            fh.write(COLS + "\n")
            for r in rows:
                fh.write(",".join("" if v is None else str(v) for v in r[:9]) + "\n")
        import h3
        with (out_dir / f"{base}_download.csv").open("w", encoding="utf-8", newline="") as fh:
            fh.write(f"# Source: NASA FIRMS (MODIS C6.1 / VIIRS 375 m), raw detections — not harmonized; for the harmonized record use "
                     f"the fire-days CSV · request: {name}, {start} to {end} (solar dates), satellites record · retrieved: pre-saved "
                     f"from the NASA FIRMS archive download (standard SP files) for the demo · complete for {start} to {end} · filters: "
                     f"low confidence dropped; FIRMS type 1/2/3 dropped; known-static + persistent H3 res-9 mask; days by solar date "
                     f"(UTC + lon/15 h) · confidence: N nominal, H high (low dropped) · times: acq_time_utc in UTC, local_solar_time = "
                     f"UTC + longitude/15 h · {CITATION}\n")
            fh.write(DL_COLS + "\n")
            for r in rows:
                sat, inst = SAT_NAME.get(r[4], (r[4], ""))
                cell = r[9] if isinstance(r[9], str) else h3.int_to_str(int(r[9]))
                fh.write(",".join(str(v) for v in (r[0], r[1], r[2][:10], r[2][11:16], f"{r[3]} {r[10]}", sat, inst, r[5],
                                                    "" if r[6] is None else r[6], r[7] or "", cell)) + "\n")
        dots = [[round(r[0], 4), round(r[1], 4), 0 if r[4] in ("TERRA", "AQUA") else 1, r[3].day] for r in rows]
        n_modis = sum(1 for d in dots if d[2] == 0)
        write_json(out_dir / f"{base}.json", {
            "ok": True, "query": {"region": region, "bbox": None, "start": str(start), "end": str(end), "satellites": "record", "format": "json"},
            "source": "pre-saved from the Fire Rings record (FIRMS archive download)", "count": len(dots),
            "fields": ["lat", "lon", "sensor(0=MODIS,1=VIIRS)", "solar_day"], "rows": dots}, compact=True)
        index.append({"region": region, "month": month, "start": str(start), "end": str(end), "csv": f"{base}.csv", "csv_download": f"{base}_download.csv",
                      "json": f"{base}.json", "rows": len(rows), "modis": n_modis, "viirs": len(rows) - n_modis,
                      "note": item.get("note", "")})
        print(f"{base}: {len(rows):,} detections (MODIS {n_modis:,}, VIIRS {len(rows) - n_modis:,})")
    write_json(out_dir / "index.json", {"files": index})
    con.close()


if __name__ == "__main__":
    main()
