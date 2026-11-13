"""Tool C1 — check_geostationary for the Americas: NOAA GOES-R ABI L2 Fire Detection, full disk (ABI-L2-FDCF).

Public AWS Open Data buckets, anonymous access (no credentials):
  noaa-goes16  GOES-East until 7 Apr 2025 15:10 UTC        noaa-goes19  GOES-East from then on
(NOAA OSPO message MSG_20250407_1510: "GOES-19 has been designated as the Operational GOES-East satellite".)
Sampling: the first full-disk image of every hour on 8 fixed days of each month (1, 5, 9, 13, 17, 21, 25, 29 — the same for
flagged and baseline months); only the region window of the Fire Mask is read
(the variable is chunked 226×226, so h5py fetches just the needed chunks). Fire pixels = mask codes 10–13 and 30–33
(good, saturated, cloud-contaminated, high-probability fire, incl. temporally filtered); low/medium probability excluded.
Each pixel centre is mapped to lat/lon (GOES-R PUG fixed-grid formulas) and kept if inside the region footprint.
Only for regions in the Americas (config: mato_grosso). Stored: hourly local-solar profile per region-month.
"""
from __future__ import annotations

import datetime as dt
import math

import numpy as np

from .common import in_polar_window, load_cache, mkey, month_range, now_iso, parse_key, save_cache  # noqa: F401
from .geo_common import geo_signal, solar_hours

SWITCH = dt.datetime(2025, 4, 7, 15, 10, tzinfo=dt.timezone.utc)
FIRE_CODES = {10, 11, 12, 13, 30, 31, 32, 33}
REGIONS = {"mato_grosso"}
SOURCE = "NOAA GOES-R ABI Fire Detection (AWS Open Data)"
CACHE = "goes"
BASELINE_YEARS = (2018, 2019)          # GOES-16 operational from Dec 2017; pre-drift years as the reference


def bucket_for(t: dt.datetime) -> str:
    return "noaa-goes16" if t < SWITCH else "noaa-goes19"


def latlon_to_xy(lat, lon, lon0, H, a, b):
    lat, lon = np.radians(lat), np.radians(lon)
    e2 = 1 - b * b / (a * a)
    phi_c = np.arctan(b * b / (a * a) * np.tan(lat))
    r_c = b / np.sqrt(1 - e2 * np.cos(phi_c) ** 2)
    sx = H - r_c * np.cos(phi_c) * np.cos(lon - math.radians(lon0))
    sy = -r_c * np.cos(phi_c) * np.sin(lon - math.radians(lon0))
    sz = r_c * np.sin(phi_c)
    return np.arcsin(-sy / np.sqrt(sx * sx + sy * sy + sz * sz)), np.arctan(sz / sx)


def xy_to_latlon(x, y, lon0, H, a, b):
    A = np.sin(x) ** 2 + np.cos(x) ** 2 * (np.cos(y) ** 2 + (a * a) / (b * b) * np.sin(y) ** 2)
    B = -2 * H * np.cos(x) * np.cos(y)
    C = H * H - a * a
    rs = (-B - np.sqrt(B * B - 4 * A * C)) / (2 * A)
    sx, sy, sz = rs * np.cos(x) * np.cos(y), -rs * np.sin(x), rs * np.cos(x) * np.sin(y)
    lat = np.degrees(np.arctan((a * a) / (b * b) * sz / np.sqrt((H - sx) ** 2 + sy * sy)))
    lon = lon0 - np.degrees(np.arctan(sy / (H - sx)))
    return lat, lon


def read_window(fs, path: str, bbox, in_region) -> tuple[np.ndarray, np.ndarray]:
    """(lat, lon) of fire pixels inside the region for one FDCF file, reading only the bbox window."""
    import h5py
    with fs.open(path, "rb") as fh, h5py.File(fh, "r") as f:
        p = f["goes_imager_projection"].attrs
        a, b = float(p["semi_major_axis"][0]), float(p["semi_minor_axis"][0])
        H = float(p["perspective_point_height"][0]) + a
        lon0 = float(p["longitude_of_projection_origin"][0])
        xs, ys = f["x"], f["y"]
        xsf, xoff = float(xs.attrs["scale_factor"][0]), float(xs.attrs["add_offset"][0])
        ysf, yoff = float(ys.attrs["scale_factor"][0]), float(ys.attrs["add_offset"][0])
        w, s, e, n = bbox
        la = np.array([s, s, n, n, (s + n) / 2, (s + n) / 2, s, n])
        lo = np.array([w, e, w, e, w, e, (w + e) / 2, (w + e) / 2])
        X, Y = latlon_to_xy(la, lo, lon0, H, a, b)
        cols = (X - xoff) / xsf
        rows = (Y - yoff) / ysf
        c0, c1 = int(max(0, np.floor(cols.min()) - 2)), int(min(xs.shape[0], np.ceil(cols.max()) + 3))
        r0, r1 = int(max(0, np.floor(rows.min()) - 2)), int(min(ys.shape[0], np.ceil(rows.max()) + 3))
        mask = f["Mask"][r0:r1, c0:c1]
    rr, cc = np.nonzero(np.isin(mask, list(FIRE_CODES)))
    if not len(rr):
        return np.array([]), np.array([])
    x = (cc + c0) * xsf + xoff
    y = (rr + r0) * ysf + yoff
    lat, lon = xy_to_latlon(x, y, lon0, H, a, b)
    keep = np.array([in_region(float(p), float(q)) for p, q in zip(lat, lon)], dtype=bool)
    return lat[keep], lon[keep]


FIRST_DATA = dt.date(2017, 5, 24)     # first ABI-L2-FDCF day in noaa-goes16 (bucket listing, checked 13 Nov 2026)


SAMPLE_DAYS = (1, 5, 9, 13, 17, 21, 25, 29)   # same 8 days in every month (flagged and baseline): documented sampling
_FP: dict = {}


def _in_region(region: str):
    import h3
    from .common import footprint
    if region not in _FP:
        fp = footprint(region)
        _FP[region] = lambda la, lo: h3.latlng_to_cell(la, lo, fp["res"]) in fp["cells"] and h3.latlng_to_cell(la, lo, 9) not in fp["static"]
    return _FP[region]


def _day_profile(job):
    """Worker (separate process: h5py serialises threads): one day → (24-bin profile, images read)."""
    import s3fs
    region, y, m, d, bbox = job
    fs = s3fs.S3FileSystem(anon=True)
    inr = _in_region(region)
    prof = np.zeros(24, dtype=int)
    n = 0
    listed: dict[str, list[str]] = {}
    for hr in range(24):
        t = dt.datetime(y, m, d, hr, tzinfo=dt.timezone.utc)
        b = bucket_for(t)
        if b not in listed:
            try:
                listed[b] = sorted(fs.find(f"{b}/ABI-L2-FDCF/{y}/{t.timetuple().tm_yday:03d}/"))
            except FileNotFoundError:
                listed[b] = []
        files = [f for f in listed[b] if f.rsplit("/", 2)[-2] == f"{hr:02d}"]
        if not files:
            continue
        lat = lon = None
        for _ in range(3):
            try:
                lat, lon = read_window(fs, files[0], bbox, inr)
                break
            except Exception:  # noqa: BLE001 — transient S3 error: retry, then count the image as missing
                lat = None
        if lat is None:
            continue
        n += 1
        if len(lat):
            prof += np.bincount(solar_hours(np.full(len(lon), hr + 0.1), lon), minlength=24)
    return prof, n


def month_profiles(region: str, months: list[str], bbox, days: tuple[int, ...] = SAMPLE_DAYS, workers: int = 8, log=print) -> dict:
    """Sampled hourly profiles for several months at once (process pool over all (month, day) jobs)."""
    from concurrent.futures import ProcessPoolExecutor
    jobs, owner = [], []
    for k in months:
        y, m = parse_key(k)
        last = month_range(y, m)[1].day
        for d in days:
            if d <= last:
                jobs.append((region, y, m, d, tuple(bbox)))
                owner.append(k)
    out = {k: {"profile": np.zeros(24, dtype=int), "images": 0, "images_expected": 0} for k in months}
    for k in owner:
        out[k]["images_expected"] += 24
    with ProcessPoolExecutor(workers) as ex:
        for k, (pr, n) in zip(owner, ex.map(_day_profile, jobs)):
            out[k]["profile"] += pr
            out[k]["images"] += n
    for k in months:
        out[k]["profile"] = out[k]["profile"].tolist()
        out[k]["sampling"] = f"first full-disk image of each hour on days {', '.join(map(str, days))} of the month"
        log(f"   GOES {region} {k}: {sum(out[k]['profile'])} sampled fire pixels from {out[k]['images']}/{out[k]['images_expected']} images")
    return out


def check_geostationary_goes(region: str, month: str, cache: dict | None = None) -> dict:
    out = {"tool": "check_geostationary", "instrument": "GOES-R ABI (FDCF)", "source": SOURCE, "month": month}
    if region not in REGIONS:
        return {**out, "signal": "not_covered", "note": "GOES covers the Americas only"}
    cache = cache if cache is not None else load_cache(CACHE)
    reg = cache.get(region, {})
    if month not in reg:
        y, m = parse_key(month)
        if dt.date(y, m, 1) < FIRST_DATA.replace(day=1):
            return {**out, "signal": "not_covered", "note": f"no GOES-16 fire product before {FIRST_DATA:%d %b %Y}"}
        return {**out, "signal": "not_covered", "note": "no GOES summary for this month yet"}
    if reg[month].get("incomplete"):
        return {**out, "signal": "not_covered", "note": f"too few GOES images archived for this month ({reg[month]['images']}/{reg[month]['images_expected']} sampled)"}
    _, m = parse_key(month)
    base = [reg[mkey(yy, m)]["profile"] for yy in range(BASELINE_YEARS[0], BASELINE_YEARS[1] + 1)
            if mkey(yy, m) in reg and mkey(yy, m) != month and not reg[mkey(yy, m)].get("incomplete")]
    return {**out, **geo_signal(reg[month]["profile"], base), "images": reg[month]["images"], "sampling": reg[month]["sampling"],
            "satellite": "GOES-16" if dt.datetime(*parse_key(month), 1, tzinfo=dt.timezone.utc) < SWITCH else "GOES-19", "checked_at": now_iso()}
