"""Shared logic for the geostationary tools (C1 GOES, C2 Meteosat): hourly profile → signal.

A geostationary sensor looks every 10–15 minutes, so it sees fires at hours when no polar satellite passes. Per
region-month we keep only a profile: fire-pixel detections per LOCAL SOLAR hour (UTC + lon/15), from an hourly sample
(one image per hour, every day of the month). share_outside = detections outside the polar overpass windows
(common.POLAR_WINDOWS: 09–15 h and 21–03 h local solar time) ÷ all detections.

Signal (fixed before any run):
  fires_outside_overpass_hours  share_outside ≥ baseline share + 0.10 (more fire than usual at hours polar satellites miss);
                                when no baseline month could be read: share_outside ≥ 0.50 (stated in the result)
  fires_match_overpass          otherwise
  too_few_detections            < 50 sampled fire-pixel detections in the month
"""
from __future__ import annotations

import numpy as np

from .common import in_polar_window

MIN_DET = 50
DELTA = 0.10
ABS_SHARE = 0.50


def profile_share(profile: list[int]) -> float | None:
    tot = sum(profile)
    if not tot:
        return None
    out = sum(n for h, n in enumerate(profile) if not in_polar_window(h + 0.5))
    return out / tot


def solar_hours(t_utc_hours: np.ndarray, lon: np.ndarray) -> np.ndarray:
    return np.floor((t_utc_hours + lon / 15.0) % 24).astype(int)


def geo_signal(profile: list[int], baseline_profiles: list[list[int]]) -> dict:
    n = int(sum(profile))
    share = profile_share(profile)
    base = [profile_share(p) for p in baseline_profiles if sum(p) >= MIN_DET]
    base = [b for b in base if b is not None]
    out = {"detections_sampled": n, "share_outside_polar_hours": None if share is None else round(share, 3),
           "hourly_profile_local_solar": [int(x) for x in profile]}
    if n < MIN_DET or share is None:
        return {**out, "signal": "too_few_detections"}
    if base:
        b = float(np.mean(base))
        sig = "fires_outside_overpass_hours" if share >= b + DELTA else "fires_match_overpass"
        return {**out, "signal": sig, "baseline_share_outside": round(b, 3), "baseline_months": len(base)}
    sig = "fires_outside_overpass_hours" if share >= ABS_SHARE else "fires_match_overpass"
    return {**out, "signal": sig, "baseline_share_outside": None, "note": f"no baseline month readable; absolute rule share ≥ {ABS_SHARE}"}
