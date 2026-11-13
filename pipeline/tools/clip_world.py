"""Clip the FIRMS WORLD archive download (DATA/world/*.zip, yearly CSVs per sensor) to the Round-5B regions.

Stage 1 (`bbox`):  stream every CSV straight out of its zip with pyarrow (never unzips, never loads a whole file),
                   keep rows inside each region's bounding box → data/raw_world_bbox/{region}/{sensor}/{prod}_{id}.csv
Stage 2 (`clip`):  exact point-in-polygon against the region's Natural Earth boundary (data/raw/boundaries/*.geojson),
                   merge per sensor → data/raw/{region}/{sensor}/fire_archive_world.csv + fire_nrt_world.csv
                   (same layout as the per-country FIRMS downloads, so 02_unify reads them unchanged).
Usage: python pipeline/tools/clip_world.py bbox [region…]|clip [region…]|inventory
"""
from __future__ import annotations

import glob
import json
import re
import sys
import zipfile
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.csv as pcsv

ROOT = Path(__file__).resolve().parents[2]
WORLD = ROOT / "DATA" / "world"
BBOX_DIR = ROOT / "data" / "raw_world_bbox"
RAW = ROOT / "data" / "raw"
BOUND = RAW / "boundaries"
CODES = {"M-C61": "modis", "SV-C2": "snpp", "J1V-C2": "noaa20", "J2V-C2": "noaa21"}

# Generous boxes (W, S, E, N) around each boundary; the exact clip happens in stage 2.
BOXES = {
    "nt_savanna": (128.8, -26.2, 138.2, -10.7),
    "ne_india": (89.5, 21.8, 97.6, 29.6),
    "tanzania": (29.2, -11.9, 40.7, -0.8),
    "sudan": (21.6, 8.4, 38.9, 23.3),
    # Round 7: Mato Grosso state (Natural Earth extent 61.61–50.24°W, 18.03–7.34°S) padded by ~0.2°
    "mato_grosso": (-61.8, -18.2, -50.0, -7.1),
}
# Natural Earth selectors: (file, property, value list)
SHAPES = {
    "nt_savanna": ("ne_10m_admin_1_states_provinces.geojson", "name", ["Northern Territory"], "adm0_a3", "AUS"),
    "ne_india": ("ne_10m_admin_1_states_provinces.geojson", "name",
                 ["Assam", "Meghalaya", "Tripura", "Mizoram", "Manipur", "Nagaland", "Arunachal Pradesh"],
                 "adm0_a3", "IND"),
    "tanzania": ("ne_10m_admin_0_countries.geojson", "ADM0_A3", ["TZA"], None, None),
    "sudan": ("ne_10m_admin_0_countries.geojson", "ADM0_A3", ["SDN"], None, None),
    "mato_grosso": ("ne_10m_admin_1_states_provinces.geojson", "name", ["Mato Grosso"], "adm0_a3", "BRA"),
}


# regions the bbox stage scans for: all, or those named after "bbox" on the command line (inherited by Pool workers)
ACTIVE = [a for a in sys.argv[2:] if a in BOXES] if len(sys.argv) > 2 and sys.argv[1] == "bbox" else None
ACTIVE = ACTIVE or list(BOXES)


def members() -> list[tuple[str, str]]:
    out = []
    for z in sorted(glob.glob(str(WORLD / "*.zip"))):
        for n in zipfile.ZipFile(z).namelist():
            if n.endswith(".csv"):
                out.append((z, n))
    return out


def bbox_one(job: tuple[str, str]) -> dict:
    zpath, name = job
    m = re.match(r"fire_(archive|nrt)_(.+?)_(\d+)\.csv", name)
    prod, code, fid = m.group(1), m.group(2), m.group(3)
    sensor = CODES[code]
    writers: dict[str, pcsv.CSVWriter] = {}
    counts = {r: 0 for r in ACTIVE}
    total = 0
    with zipfile.ZipFile(zpath) as z, z.open(name) as fh:
        header = fh.readline().decode().strip().split(",")
    with zipfile.ZipFile(zpath) as z, z.open(name) as fh:
        reader = pcsv.open_csv(fh, read_options=pcsv.ReadOptions(block_size=16 << 20, use_threads=False),
                               convert_options=pcsv.ConvertOptions(column_types={c: pa.string() for c in header}))
        for batch in reader:
            total += batch.num_rows
            lat = pc.cast(batch.column("latitude"), pa.float64())
            lon = pc.cast(batch.column("longitude"), pa.float64())
            for r, (w, s, e, n) in ((r, BOXES[r]) for r in ACTIVE):
                mask = pc.and_(pc.and_(pc.greater_equal(lon, w), pc.less_equal(lon, e)),
                               pc.and_(pc.greater_equal(lat, s), pc.less_equal(lat, n)))
                sub = batch.filter(mask)
                if sub.num_rows == 0:
                    continue
                if r not in writers:
                    out = BBOX_DIR / r / sensor / f"{prod}_{fid}.csv"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    writers[r] = pcsv.CSVWriter(str(out), batch.schema)
                writers[r].write_batch(sub)
                counts[r] += sub.num_rows
    for w in writers.values():
        w.close()
    return {"file": name, "sensor": sensor, "prod": prod, "rows": total, "kept": counts}


def stage_bbox() -> None:
    jobs = members()
    print(f"bbox stage for {ACTIVE}", flush=True)
    jobs.sort(key=lambda j: -zipfile.ZipFile(j[0]).getinfo(j[1]).file_size)   # biggest first
    log = []
    with Pool(7) as pool:
        for res in pool.imap_unordered(bbox_one, jobs):
            print(json.dumps(res), flush=True)
            log.append(res)
    (BBOX_DIR / f"_bbox_log{'_' + '_'.join(ACTIVE) if ACTIVE != list(BOXES) else ''}.json").write_text(json.dumps(log, indent=1))


# ---------------------------------------------------------------- stage 2: exact polygon clip
def rings_for(region: str) -> list[np.ndarray]:
    fname, prop, values, p2, v2 = SHAPES[region]
    gj = json.loads((BOUND / fname).read_text(encoding="utf-8"))
    rings = []
    found = []
    for f in gj["features"]:
        pr = f["properties"]
        if pr.get(prop) in values and (p2 is None or pr.get(p2) == v2):
            found.append(pr.get(prop))
            g = f["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            for poly in polys:
                for ring in poly:   # holes included: even-odd rule handles them
                    rings.append(np.asarray(ring, dtype=float))
    missing = set(values) - set(found)
    if missing:
        raise SystemExit(f"{region}: boundary features not found: {missing}")
    return rings


def inside(lon: np.ndarray, lat: np.ndarray, rings: list[np.ndarray]) -> np.ndarray:
    """Even-odd ray casting, vectorised. Points sorted by latitude so each edge only touches its latitude band."""
    order = np.argsort(lat, kind="stable")
    ys, xs = lat[order], lon[order]
    flag = np.zeros(len(lat), dtype=bool)
    for ring in rings:
        x1, y1 = ring[:-1, 0], ring[:-1, 1]
        x2, y2 = ring[1:, 0], ring[1:, 1]
        for a, b, c, d in zip(x1, y1, x2, y2):
            if b == d:
                continue
            lo_, hi_ = (b, d) if b < d else (d, b)
            i0, i1 = np.searchsorted(ys, lo_, "left"), np.searchsorted(ys, hi_, "left")   # y in [lo, hi)
            if i0 == i1:
                continue
            yy = ys[i0:i1]
            xint = a + (yy - b) * (c - a) / (d - b)
            flag[i0:i1] ^= xs[i0:i1] < xint
    res = np.zeros(len(lat), dtype=bool)
    res[order] = flag
    return res


def read_str(f: Path) -> pa.Table:
    header = f.open(encoding="utf-8").readline().strip().replace('"', "").split(",")
    return pcsv.read_csv(str(f), convert_options=pcsv.ConvertOptions(column_types={c: pa.string() for c in header}))


def stage_clip(regions: list[str]) -> None:
    import duckdb
    summary = {}
    for region in regions:
        rings = rings_for(region)
        summary[region] = {}
        for sensor in CODES.values():
            for prod in ("archive", "nrt"):
                files = sorted((BBOX_DIR / region / sensor).glob(f"{prod}_*.csv"))
                if not files:
                    continue
                tbl = pa.concat_tables([read_str(f) for f in files], promote_options="default")
                lat = np.asarray(pc.cast(tbl.column("latitude"), pa.float64()))
                lon = np.asarray(pc.cast(tbl.column("longitude"), pa.float64()))
                keep = inside(lon, lat, rings)
                out_t = tbl.filter(pa.array(keep))
                dst = RAW / region / sensor / f"fire_{prod}_world.csv"
                dst.parent.mkdir(parents=True, exist_ok=True)
                con = duckdb.connect()
                con.register("t", out_t)
                con.execute(f"COPY (SELECT * FROM t ORDER BY acq_date, acq_time, latitude, longitude) "
                            f"TO '{dst.as_posix()}' (HEADER, DELIMITER ',')")
                dates = con.execute("SELECT min(acq_date), max(acq_date) FROM t").fetchone()
                summary[region][f"{sensor}/{prod}"] = {"in_box": len(lat), "in_boundary": int(keep.sum()),
                                                       "files": len(files), "dates": list(dates)}
                print(region, sensor, prod, summary[region][f"{sensor}/{prod}"], flush=True)
    (BBOX_DIR / "_clip_summary.json").write_text(json.dumps(summary, indent=1))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "inventory"
    if cmd == "bbox":
        stage_bbox()   # optional region ids after "bbox" restrict the scan (Round 7: bbox mato_grosso)
    elif cmd == "clip":
        stage_clip(sys.argv[2:] or list(BOXES))
    else:
        for z, n in members():
            print(Path(z).name, n)
