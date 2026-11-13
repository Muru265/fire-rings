"""Tool C2 — check_geostationary for Africa: EUMETSAT LSA SAF FRP-PIXEL (MSG, product LSA-502), ListProduct HDF5.

Files: https://datalsasaf.lsasvcs.ipma.pt/PRODUCTS/MSG/FRP-PIXEL/HDF5/YYYY/MM/DD/ (one ListProduct per 15-min slot,
named HDF5_LSASAF_MSG_FRP-PIXEL-ListProduct_MSG-Disk_YYYYMMDDHHMM, possibly .bz2). Login: LSASAF_USER / LSASAF_PASS from the
environment (never printed). Without them, or if login fails, the tool returns "pending_access" and the site shows
"Meteosat check ready — waiting for data access". Regions: tanzania, madagascar, sudan (MSG 0° disk).

Reader (tested on the public sample HDF5_LSASAF_MSG_FRP-PIXEL-ListProduct_MSG-Disk_202009011045, Zenodo record 5717106,
CC BY 4.0, S. Jackson — tests only, never shown as live data): per fire pixel LATITUDE, LONGITUDE (÷100), FRP (MW, ÷10),
FIRE_CONFIDENCE (÷100), ACQTIME (HHMM UTC). Physical value = raw ÷ SCALING_FACTOR + OFFSET (dataset attributes).
Sampling: the HH:00 slot of every hour of the month; pixels kept if inside the region footprint; profile per local solar
hour → geo_common.geo_signal (same rule as GOES).
"""
from __future__ import annotations

import bz2
import datetime as dt
import io
import os
import re

import numpy as np

from .common import load_cache, mkey, month_range, now_iso, parse_key
from .geo_common import geo_signal, solar_hours

BASE_URL = "https://datalsasaf.lsasvcs.ipma.pt/PRODUCTS/MSG/FRP-PIXEL/HDF5"
REGIONS = {"tanzania", "madagascar", "sudan"}   # inside the MSG 0° disk
SOURCE = "EUMETSAT LSA SAF [FRPPixel, LSA-502]"
CACHE = "meteosat"
BASELINE_YEARS = (2018, 2019)
NAME = re.compile(r"HDF5_LSASAF_MSG_FRP-PIXEL-ListProduct_MSG-Disk_(\d{12})(\.bz2)?")


def credentials() -> tuple[str, str] | None:
    u, p = os.environ.get("LSASAF_USER"), os.environ.get("LSASAF_PASS")
    return (u, p) if u and p else None


def read_listproduct(src) -> dict:
    """Parse one FRP-PIXEL ListProduct (path or bytes). Returns arrays lat, lon, frp_mw, confidence, acq_hhmm, slot (datetime)."""
    import h5py
    if isinstance(src, (bytes, bytearray)):
        if src[:3] == b"BZh":
            src = bz2.decompress(src)
        fh = io.BytesIO(src)
    else:
        fh = src
    with h5py.File(fh, "r") as f:
        def val(k):
            d = f[k]
            raw = d[:].astype(float)
            miss = d.attrs.get("MISSING_VALUE")
            if miss is not None:
                raw[d[:] == miss] = np.nan
            return raw / float(d.attrs.get("SCALING_FACTOR", 1.0)) + float(d.attrs.get("OFFSET", 0.0))
        slot = f.attrs.get("IMAGE_ACQUISITION_TIME", b"").decode() if isinstance(f.attrs.get("IMAGE_ACQUISITION_TIME"), bytes) else str(f.attrs.get("IMAGE_ACQUISITION_TIME", ""))
        out = {"lat": val("LATITUDE"), "lon": val("LONGITUDE"), "frp_mw": val("FRP"), "confidence": val("FIRE_CONFIDENCE"),
               "acq_hhmm": f["ACQTIME"][:].astype(int)}
    out["slot"] = dt.datetime.strptime(slot[:12], "%Y%m%d%H%M").replace(tzinfo=dt.timezone.utc) if slot[:12].isdigit() else None
    return out


def acq_hours(acq_hhmm: np.ndarray) -> np.ndarray:
    return (acq_hhmm // 100) + (acq_hhmm % 100) / 60.0


def summarise(lp: dict, in_region) -> np.ndarray:
    """24-bin local-solar-hour counts of the fire pixels inside the region for one ListProduct."""
    ok = ~np.isnan(lp["lat"]) & ~np.isnan(lp["lon"])
    lat, lon, t = lp["lat"][ok], lp["lon"][ok], acq_hours(lp["acq_hhmm"][ok])
    keep = np.array([in_region(float(a), float(b)) for a, b in zip(lat, lon)], dtype=bool) if len(lat) else np.zeros(0, bool)
    if not keep.any():
        return np.zeros(24, dtype=int)
    return np.bincount(solar_hours(t[keep], lon[keep]), minlength=24)


def month_profile(region: str, month: str, in_region, log=print) -> dict:
    """Download the HH:00 slot of every hour (authenticated), summarise, discard. Raises PermissionError on login failure."""
    import requests
    cred = credentials()
    if not cred:
        raise PermissionError("LSASAF_USER / LSASAF_PASS not set")
    y, m = parse_key(month)
    d0, d1 = month_range(y, m)
    prof = np.zeros(24, dtype=int)
    n = 0
    with requests.Session() as s:
        s.auth = cred
        for d in range(d0.day, d1.day + 1):
            url = f"{BASE_URL}/{y}/{m:02d}/{d:02d}/"
            r = s.get(url, timeout=60)
            if r.status_code in (401, 403):
                raise PermissionError(f"LSA SAF login refused (HTTP {r.status_code})")
            if not r.ok:
                continue
            names = sorted(set(mm.group(0) for mm in NAME.finditer(r.text)))
            for name in names:
                stamp = NAME.match(name).group(1)
                if stamp[10:12] != "00":
                    continue
                f = s.get(url + name, timeout=120)
                if f.ok:
                    prof += summarise(read_listproduct(f.content), in_region)
                    n += 1
    return {"profile": prof.tolist(), "images": n, "sampling": "HH:00 slot of each hour, every day"}


def check_geostationary_meteosat(region: str, month: str, cache: dict | None = None) -> dict:
    out = {"tool": "check_geostationary", "instrument": "Meteosat SEVIRI (LSA SAF FRP-PIXEL)", "source": SOURCE, "month": month}
    if region not in REGIONS:
        return {**out, "signal": "not_covered"}
    cache = cache if cache is not None else load_cache(CACHE)
    reg = cache.get(region, {})
    if month not in reg:
        return {**out, "signal": "pending_access", "note": "Meteosat check ready — waiting for data access (LSA SAF login)"}
    _, m = parse_key(month)
    base = [reg[mkey(yy, m)]["profile"] for yy in range(BASELINE_YEARS[0], BASELINE_YEARS[1] + 1) if mkey(yy, m) in reg and mkey(yy, m) != month]
    return {**out, **geo_signal(reg[month]["profile"], base), "images": reg[month]["images"], "sampling": reg[month]["sampling"], "checked_at": now_iso()}
