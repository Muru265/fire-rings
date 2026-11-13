"""Round 7 agentic check: deterministic verdict rules, each tool's signal logic (mocked caches, no network), the GOES
fixed-grid maths and the LSA SAF FRP-PIXEL reader on the public Zenodo sample (record 5717106, CC BY 4.0)."""
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent import burned_area as B, goes as C1, meteosat as C2, timing as A  # noqa: E402
from agent.common import in_polar_window  # noqa: E402
from agent.geo_common import geo_signal  # noqa: E402
from agent.verdict import verdict  # noqa: E402

SAMPLE = Path(__file__).parent / "fixtures" / "lsasaf" / "HDF5_LSASAF_MSG_FRP-PIXEL-ListProduct_MSG-Disk_202009011045"


# ------------------------------------------------------------------ verdict rule table (every row)
@pytest.mark.parametrize("d,a,b,c,expect,rule", [
    ("up", "no_timing_shift", "burned_area_agrees", "not_covered", "Real change", "R1"),
    ("down", "too_few_detections", "burned_area_agrees", "pending_access", "Real change", "R1"),
    ("down", "no_timing_shift", "burned_area_agrees", "fires_match_overpass", "Real change", "R1"),
    ("down", "timing_shift", "burned_area_agrees", "not_covered", "Unclear", "R2"),
    ("up", "no_timing_shift", "burned_area_agrees", "fires_outside_overpass_hours", "Unclear", "R2"),
    ("down", "no_timing_shift", "burned_area_disagrees", "not_covered", "Detection issue likely", "R3"),
    ("down", "timing_shift", "not_yet_published", "not_covered", "Detection issue likely", "R3"),
    ("up", "no_timing_shift", "unavailable", "fires_outside_overpass_hours", "Detection issue likely", "R3"),
    ("up", "timing_shift", "burned_area_disagrees", "not_covered", "Detection issue likely", "R3"),
    ("up", "no_timing_shift", "burned_area_disagrees", "not_covered", "Unclear", "R4"),
    ("down", "too_few_detections", "not_yet_published", "not_covered", "Not checkable yet", "R5"),
    ("down", "no_timing_shift", "unavailable", "pending_access", "Not checkable yet", "R5"),
    ("up", "no_timing_shift", "not_yet_published", "fires_match_overpass", "Not checkable yet", "R5"),
])
def test_verdict_table(d, a, b, c, expect, rule):
    v, r = verdict(d, a, b, c)
    assert v == expect and r.startswith(rule)


def test_verdict_rejects_bad_direction():
    with pytest.raises(ValueError):
        verdict("sideways", "no_timing_shift", "unavailable", "not_covered")


# ------------------------------------------------------------------ Tool A (mocked summaries)
def _timing_cache(cur, base_night=50, base_aqua=80, base_hour=13.0):
    reg = {f"{y}-10": {"aqua_day": base_aqua, "terra_day": 40, "viirs_day": 100, "viirs_night": base_night, "viirs_day_hour": base_hour}
           for y in range(2013, 2020)}
    reg["2025-10"] = cur
    return {"r": reg, "_thresholds": {"aqua_log": float(np.log(1.5)), "night_log": float(np.log(2.0)), "hour": 0.3,
                                      "aqua_x": 1.5, "night_x": 2.0}}


def test_timing_no_shift():
    c = _timing_cache({"aqua_day": 82, "terra_day": 40, "viirs_day": 100, "viirs_night": 52, "viirs_day_hour": 13.05})
    r = A.check_detection_times("r", "2025-10", c)
    assert r["signal"] == "no_timing_shift" and r["reasons"] == []


def test_timing_shift_aqua_and_hour():
    c = _timing_cache({"aqua_day": 200, "terra_day": 40, "viirs_day": 100, "viirs_night": 50, "viirs_day_hour": 13.6})
    r = A.check_detection_times("r", "2025-10", c)
    assert r["signal"] == "timing_shift" and set(r["reasons"]) == {"aqua_viirs", "mean_hour"}
    assert r["aqua_viirs_rel"] == 2.5


def test_timing_too_few():
    c = _timing_cache({"aqua_day": 2, "terra_day": 1, "viirs_day": 10, "viirs_night": 1, "viirs_day_hour": 13.0})
    assert A.check_detection_times("r", "2025-10", c)["signal"] == "too_few_detections"
    assert A.check_detection_times("r", "2024-10", c)["signal"] == "too_few_detections"   # month missing


def test_timing_calibration_is_baseline_percentile():
    rng = np.random.default_rng(1)
    reg = {f"{y}-{m:02d}": {"aqua_day": int(80 * rng.uniform(0.8, 1.2)), "terra_day": 40, "viirs_day": 100,
                            "viirs_night": int(50 * rng.uniform(0.8, 1.2)), "viirs_day_hour": 13 + rng.uniform(-0.1, 0.1)}
           for y in range(2013, 2020) for m in range(1, 13)}
    th = A.calibrate({"r": reg}, ["r"])
    assert th["n"]["aqua"] == 84 and 1.0 < th["aqua_x"] < 1.6 and th["hour"] < 0.25


# ------------------------------------------------------------------ Tool B (mocked cache)
def _ba(month_km2, base=100.0):
    reg = {f"{y}-09": {"km2": base, "tiles": ["h24v05"], "granules": 1} for y in range(2003, 2023)}
    if month_km2 is not None:
        reg["2025-09"] = {"km2": month_km2, "tiles": ["h24v05"], "granules": 1}
    return {"r": reg}


def test_burned_area_agrees_and_disagrees():
    today = dt.date(2026, 11, 13)
    assert B.check_burned_area("r", "2025-09", "down", today, _ba(50))["signal"] == "burned_area_agrees"
    assert B.check_burned_area("r", "2025-09", "down", today, _ba(95))["signal"] == "burned_area_disagrees"
    assert B.check_burned_area("r", "2025-09", "up", today, _ba(130))["signal"] == "burned_area_agrees"
    r = B.check_burned_area("r", "2025-09", "up", today, _ba(110))
    assert r["signal"] == "burned_area_disagrees" and r["ratio"] == 1.1 and r["baseline_km2"] == 100.0


def test_burned_area_not_published_vs_unavailable():
    assert B.check_burned_area("r", "2026-10", "down", dt.date(2026, 11, 13), _ba(None))["signal"] == "not_yet_published"
    assert B.check_burned_area("r", "2025-09", "down", dt.date(2026, 11, 13), _ba(None))["signal"] == "unavailable"
    assert B.check_burned_area("r", "2025-09", "down", dt.date(2026, 11, 13), _ba(3, base=1.0))["signal"] == "unavailable"


def test_sinusoidal_pixel_centres():
    lat, lon = B.pixel_latlon(24, 5, np.array([0, 2399]), np.array([0, 2399]))
    assert abs(lat[0] - 40) < 0.01 and abs(lat[1] - 30) < 0.01          # h24v05 spans 30–40 °N
    assert 60 < lon[0] < 90 and 60 < lon[1] < 90


# ------------------------------------------------------------------ geostationary signal + GOES maths
def test_polar_windows():
    assert in_polar_window(13.5) and in_polar_window(1.0) and in_polar_window(10.5)
    assert not in_polar_window(16.5) and not in_polar_window(6.0)


def test_geo_signal_rules():
    prof = [0] * 24
    prof[13], prof[17] = 60, 40                     # 40 % outside polar hours
    assert geo_signal(prof, [])["signal"] == "fires_match_overpass"
    base = [0] * 24
    base[13], base[17] = 80, 20                     # baseline 20 % outside → +0.20
    r = geo_signal(prof, [base])
    assert r["signal"] == "fires_outside_overpass_hours" and r["baseline_share_outside"] == 0.2
    assert geo_signal([1] * 24, [])["signal"] == "too_few_detections"


def test_goes_fixed_grid_roundtrip_and_switch():
    a, b, H = 6378137.0, 6356752.31414, 35786023.0 + 6378137.0
    lat0, lon0 = np.array([-12.0, -8.5]), np.array([-55.0, -58.2])
    x, y = C1.latlon_to_xy(lat0, lon0, -75.0, H, a, b)
    lat, lon = C1.xy_to_latlon(x, y, -75.0, H, a, b)
    assert np.allclose(lat, lat0, atol=1e-6) and np.allclose(lon, lon0, atol=1e-6)
    assert C1.bucket_for(dt.datetime(2025, 4, 7, 15, 0, tzinfo=dt.timezone.utc)) == "noaa-goes16"
    assert C1.bucket_for(dt.datetime(2025, 4, 7, 15, 10, tzinfo=dt.timezone.utc)) == "noaa-goes19"
    assert C1.check_geostationary_goes("tanzania", "2025-09", {})["signal"] == "not_covered"


# ------------------------------------------------------------------ Meteosat (LSA SAF FRP-PIXEL) reader on the Zenodo sample
@pytest.mark.skipif(not SAMPLE.exists(), reason="LSA SAF sample not present")
def test_lsasaf_reader_on_zenodo_sample():
    lp = C2.read_listproduct(str(SAMPLE))
    assert len(lp["lat"]) == 909
    assert lp["slot"] == dt.datetime(2020, 9, 1, 10, 45, tzinfo=dt.timezone.utc)
    assert np.nanmin(lp["lat"]) == pytest.approx(-20.99) and np.nanmax(lp["lat"]) == pytest.approx(48.08)
    assert np.nanmin(lp["frp_mw"]) == pytest.approx(26.7) and np.nanmax(lp["frp_mw"]) == pytest.approx(1403.2)
    assert set(np.unique(lp["acq_hhmm"] // 100)) == {10}                    # all pixels scanned 10:49–10:56 UTC
    prof = C2.summarise(lp, lambda la, lo: -12 <= la <= -1 and 29 <= lo <= 41)   # a Tanzania-sized box
    assert prof.sum() >= 0 and len(prof) == 24
    with open(SAMPLE, "rb") as fh:                                          # same result from bytes
        assert len(C2.read_listproduct(fh.read())["lat"]) == 909


def test_meteosat_pending_without_access(monkeypatch):
    monkeypatch.delenv("LSASAF_USER", raising=False)
    monkeypatch.delenv("LSASAF_PASS", raising=False)
    assert C2.credentials() is None
    r = C2.check_geostationary_meteosat("tanzania", "2026-10", {})
    assert r["signal"] == "pending_access" and "waiting for data access" in r["note"]
    with pytest.raises(PermissionError):
        C2.month_profile("tanzania", "2026-10", lambda a, b: True)
    assert C2.check_geostationary_meteosat("punjab", "2026-10", {})["signal"] == "not_covered"


# ------------------------------------------------------------------ published outputs (if the agent has run)
WEB = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "v1"


@pytest.mark.skipif(not (WEB / "api" / "agent_check" / "punjab.json").exists(), reason="agent not run")
def test_published_agent_checks_are_consistent():
    w = json.loads((WEB / "watch.json").read_text(encoding="utf-8"))
    for rid in w["regions"]:
        d = json.loads((WEB / "api" / "agent_check" / f"{rid}.json").read_text(encoding="utf-8"))
        for k, c in d["checks"].items():
            sig = c["signals"]
            assert verdict(c["direction"], sig["detection_times"], sig["burned_area"], sig["geostationary"])[0] == c["verdict"]
            assert [t["tool"] for t in c["trace"]] == ["check_detection_times", "check_burned_area", "check_geostationary", "verdict_rules"]
            if sig["geostationary"] == "pending_access":
                assert "EUMETSAT LSA SAF [FRPPixel, LSA-502]" not in c["sources"]     # attribution only once real data is used
