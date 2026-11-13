"""Deterministic verdict for a flagged region-month (no AI). The table below is copied verbatim into METHODS.md §9k.

Inputs: direction ("up" = Fire Watch far above normal / above every baseline year; "down" = far below normal) and the
signals of the three tools:
  A  timing_shift | no_timing_shift | too_few_detections
  B  burned_area_agrees | burned_area_disagrees | not_yet_published | unavailable
  C  fires_outside_overpass_hours | fires_match_overpass | too_few_detections | pending_access | not_covered

Evidence of a detection issue (D) = A is timing_shift, OR C is fires_outside_overpass_hours,
                                     OR (direction is down AND B is burned_area_disagrees)
Rules, first match wins:
  1  B agrees, A is not timing_shift, C is not fires_outside_overpass_hours        → "Real change"
  2  D and B agrees                                                                 → "Unclear"  (burned area confirms, timing does not)
  3  D                                                                              → "Detection issue likely"
  4  direction is up and B disagrees                                               → "Unclear"  (fire-days up, burned area not)
  5  otherwise (no burned-area answer yet, no detection-issue evidence)            → "Not checkable yet"
"""
from __future__ import annotations

VERDICTS = ("Real change", "Detection issue likely", "Unclear", "Not checkable yet")


def verdict(direction: str, a: str, b: str, c: str) -> tuple[str, str]:
    """(verdict, rule id + short reason). Pure function."""
    if direction not in ("up", "down"):
        raise ValueError(f"direction must be up/down, got {direction!r}")
    D = a == "timing_shift" or c == "fires_outside_overpass_hours" or (direction == "down" and b == "burned_area_disagrees")
    if b == "burned_area_agrees" and a != "timing_shift" and c != "fires_outside_overpass_hours":
        return "Real change", "R1: burned area agrees with the flag and no timing shift"
    if D and b == "burned_area_agrees":
        return "Unclear", "R2: burned area agrees, but detection times or geostationary data point to a detection issue"
    if D:
        why = [w for w, ok in (("detection times shifted", a == "timing_shift"),
                               ("geostationary sees fires outside polar overpass hours", c == "fires_outside_overpass_hours"),
                               ("fire-days dropped but burned area did not", direction == "down" and b == "burned_area_disagrees")) if ok]
        return "Detection issue likely", "R3: " + "; ".join(why)
    if direction == "up" and b == "burned_area_disagrees":
        return "Unclear", "R4: fire-days are up but burned area is not"
    return "Not checkable yet", "R5: no burned-area answer yet and no detection-issue evidence"
