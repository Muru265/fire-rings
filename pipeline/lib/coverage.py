"""Coverage adjustment for monthly cell-days.

C* = C · D / O   if O / D ≥ min_ratio
     None, flag "insufficient"  otherwise (and when O == 0, flag "no_data")

D = days in the month that the record covers (full month, or days up to the data end for the current month)
O = days in those D on which the stream was operating (operating-days proxy, see 04_cube.py)
MODIS (Terra ∪ Aqua) uses O = mean(O_Terra, O_Aqua) once Aqua is in orbit: losing one of the two satellites
removes roughly half of the union's chances to see a fire.
"""
from __future__ import annotations

import calendar
import datetime as dt


def days_covered(y: int, m: int, data_end: dt.date) -> int:
    """Days of month (y, m) that are on or before data_end (0 if the month is after data_end)."""
    first = dt.date(y, m, 1)
    if first > data_end:
        return 0
    last = dt.date(y, m, calendar.monthrange(y, m)[1])
    return (min(last, data_end) - first).days + 1


def operating_in_month(op_days: set[dt.date], y: int, m: int, data_end: dt.date) -> int:
    d = days_covered(y, m, data_end)
    return sum(1 for i in range(d) if dt.date(y, m, 1 + i) in op_days)


SIBLINGS = {"TERRA": ["AQUA"], "AQUA": ["TERRA"], "SNPP": ["N20", "N21"], "N20": ["SNPP", "N21"], "N21": ["N20", "SNPP"]}


def regional_gaps(daily: dict[str, dict[dt.date, int]], start: dt.date, end: dt.date,
                  active: dict[str, set[dt.date]], min_run: int = 7, min_companion_median: float = 20,
                  min_expected: float = 100, window: int = 60) -> dict[str, list[tuple[dt.date, dt.date]]]:
    """Detect region-specific data gaps.

    daily[s][d] = detections (any confidence) of stream s in the region on day d.
    active[s]   = days the stream is operating globally (operating-days proxy).
    A gap for s is a run of ≥ min_run consecutive globally-active days with 0 detections of s in the region where its
    sibling satellite(s) (same sensor family) clearly saw fire:
      - sibling median ≥ min_companion_median detections/day over the run, and
      - expected detections of s = (s / sibling ratio in ±window days around the run) × sibling sum ≥ min_expected.
    The ratio test keeps real low-visibility periods (e.g. drifted Terra morning overpass vs afternoon crop fires)
    from being mistaken for gaps. Returns {stream: [(first_day, last_day), ...]}.
    """
    out: dict[str, list[tuple[dt.date, dt.date]]] = {}
    n = (end - start).days + 1
    days = [start + dt.timedelta(i) for i in range(n)]
    for s, act in active.items():
        own = daily.get(s, {})
        sibs = [o for o in SIBLINGS.get(s, []) if o in daily]
        if not sibs:
            continue
        comp = [sum(daily[o].get(d, 0) for o in sibs) for d in days]
        own_v = [own.get(d, 0) for d in days]
        runs, i = [], 0
        while i < n:
            if days[i] in act and own.get(days[i], 0) == 0:
                j = i
                while j + 1 < n and days[j + 1] in act and own.get(days[j + 1], 0) == 0:
                    j += 1
                if j - i + 1 >= min_run:
                    c = sorted(comp[i:j + 1])
                    med = c[len(c) // 2] if len(c) % 2 else (c[len(c) // 2 - 1] + c[len(c) // 2]) / 2
                    lo, hi = max(0, i - window), min(n, j + 1 + window)
                    own_w = sum(own_v[lo:i]) + sum(own_v[j + 1:hi])
                    comp_w = sum(comp[lo:i]) + sum(comp[j + 1:hi])
                    expected = (own_w / comp_w) * sum(comp[i:j + 1]) if comp_w else 0
                    if med >= min_companion_median and expected >= min_expected:
                        runs.append((days[i], days[j]))
                i = j + 1
            else:
                i += 1
        if runs:
            out[s] = runs
    return out


def adjust(c: float, d: int, o: float, min_ratio: float = 0.6) -> tuple[float | None, float, str | None]:
    """Return (C_adj, coverage_ratio, flag)."""
    if d <= 0 or o <= 0:
        return None, 0.0, "no_data"
    ratio = o / d
    if ratio < min_ratio:
        return None, ratio, "insufficient"
    return c * d / o, ratio, None
