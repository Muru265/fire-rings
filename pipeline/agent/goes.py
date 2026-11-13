"""Tool C1 — check_geostationary for the Americas: NOAA GOES-R ABI L2 Fire Detection, full disk (ABI-L2-FDCF).

Public AWS Open Data buckets, anonymous access (no credentials):
  noaa-goes16  GOES-East until 7 Apr 2025 15:10 UTC        noaa-goes19  GOES-East from then on
(NOAA OSPO message MSG_20250407_1510: "GOES-19 has been designated as the Operational GOES-East satellite".)
Sampling: the first full-disk image of every hour, every day of the month; only the region window of the Fire Mask is read
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


def month_profile(region: str, month: str, bbox, in_region, days: list[int] | None = None, log=print) -> dict:
    """Hourly sample of one month → 24-bin local-solar profile of fire-pixel detections."""
    import s3fs
    fs = s3fs.S3FileSystem(anon=True)
    y, m = parse_key(month)
    d0, d1 = month_range(y, m)
    prof = np.zeros(24, dtype=int)
    images = 0
    for d in range(d0.day, d1.day + 1):
        if days and d not in days:
            continue
        doy = dt.date(y, m, d).timetuple().tm_yday
        for hr in range(24):
            t = dt.datetime(y, m, d, hr, tzinfo=dt.timezone.utc)
            prefix = f"{bucket_for(t)}/ABI-L2-FDCF/{y}/{doy:03d}/{hr:02d}/"
            try:
                files = sorted(fs.ls(prefix))
            except FileNotFoundError:
                continue
            if not files:
                continue
            lat, lon = read_window(fs, files[0], bbox, in_region)
            images += 1
            if len(lat):
                h = solar_hours(np.full(len(lon), hr + 0.1), lon)    # first image starts at hh:00–hh:10 UTC
                prof += np.bincount(h, minlength=24)
    return {"profile": prof.tolist(), "images": images, "sampling": "first full-disk image of each hour" + (f", days {days}" if days else ", every day")}


def check_geostationary_goes(region: str, month: str, cache: dict | None = None) -> dict:
    out = {"tool": "check_geostationary", "instrument": "GOES-R ABI (FDCF)", "source": SOURCE, "month": month}
    if region not in REGIONS:
        return {**out, "signal": "not_covered", "note": "GOES covers the Americas only"}
    cache = cache if cache is not None else load_cache(CACHE)
    reg = cache.get(region, {})
    if month not in reg:
        return {**out, "signal": "not_covered", "note": "no GOES summary for this month"}
    _, m = parse_key(month)
    base = [reg[mkey(yy, m)]["profile"] for yy in range(BASELINE_YEARS[0], BASELINE_YEARS[1] + 1) if mkey(yy, m) in reg and mkey(yy, m) != month]
    return {**out, **geo_signal(reg[month]["profile"], base), "images": reg[month]["images"], "sampling": reg[month]["sampling"],
            "satellite": "GOES-16" if dt.datetime(*parse_key(month), 1, tzinfo=dt.timezone.utc) < SWITCH else "GOES-19", "checked_at": now_iso()}
