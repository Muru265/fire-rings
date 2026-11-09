"""Coverage adjustment tests built around the three outages found in the real data (review item 5):
Terra 2001-06-16 → 07-03 (global), Aqua over Madagascar 2020-08-17 → 09-02 (regional), S-NPP 2022-07-27 → 08-10 (global).
"""
import datetime as dt
from pathlib import Path

import pytest

from lib.coverage import adjust, days_covered, operating_in_month, regional_gaps

D = dt.date
END = D(2026, 11, 8)


def all_days(a, b):
    return {a + dt.timedelta(i) for i in range((b - a).days + 1)}


def without(a, b, gap_a, gap_b):
    return all_days(a, b) - all_days(gap_a, gap_b)


def test_days_covered_partial_current_month():
    assert days_covered(2026, 10, END) == 31
    assert days_covered(2026, 11, END) == 8
    assert days_covered(2026, 12, END) == 0


def test_terra_june_2001_outage_flags_insufficient_then_adjusts_july():
    op = without(D(2001, 1, 1), D(2001, 12, 31), D(2001, 6, 16), D(2001, 7, 3))
    o_jun = operating_in_month(op, 2001, 6, END)
    o_jul = operating_in_month(op, 2001, 7, END)
    assert (o_jun, o_jul) == (15, 28)
    assert adjust(8, 30, o_jun) == (None, 0.5, "insufficient")
    c_adj, cov, flag = adjust(8, 31, o_jul)
    assert flag is None and cov == pytest.approx(28 / 31) and c_adj == pytest.approx(8 * 31 / 28)


def test_snpp_july_august_2022_outage_is_adjusted_not_dropped():
    op = without(D(2022, 1, 1), D(2022, 12, 31), D(2022, 7, 27), D(2022, 8, 10))
    assert operating_in_month(op, 2022, 7, END) == 26
    assert operating_in_month(op, 2022, 8, END) == 21
    c, cov, flag = adjust(22, 31, 21)
    assert flag is None and cov == pytest.approx(0.6774, abs=1e-4) and c == pytest.approx(22 * 31 / 21)


def test_no_operating_days_is_no_data():
    assert adjust(0, 31, 0) == (None, 0.0, "no_data")


def _season(a, b, terra, aqua, gap=None):
    daily = {"TERRA": {}, "AQUA": {}}
    for d in all_days(a, b):
        daily["TERRA"][d] = terra
        daily["AQUA"][d] = 0 if gap and gap[0] <= d <= gap[1] else aqua
    return daily


def test_aqua_madagascar_august_2020_regional_gap_detected():
    a, b = D(2020, 6, 1), D(2020, 10, 31)
    gap = (D(2020, 8, 17), D(2020, 9, 2))
    daily = _season(a, b, terra=100, aqua=200, gap=gap)
    active = {"TERRA": all_days(a, b), "AQUA": all_days(a, b)}
    found = regional_gaps(daily, a, b, active)
    assert found == {"AQUA": [gap]}
    op = active["AQUA"] - all_days(*gap)
    o_aug = sum(1 for d in op if d.month == 8)
    assert o_aug == 16
    assert adjust(500, 31, o_aug)[2] == "insufficient"


def test_low_visibility_stream_is_not_a_gap():
    """Drifted Terra over afternoon crop fires: sibling busy, but Terra normally sees ~1% of Aqua → real zeros."""
    a, b = D(2025, 9, 1), D(2025, 11, 30)
    daily = {"AQUA": {d: 60 for d in all_days(a, b)},
             "TERRA": {d: (1 if d.day % 2 else 0) for d in all_days(a, b)}}
    for d in all_days(D(2025, 10, 4), D(2025, 10, 14)):
        daily["TERRA"][d] = 0
    active = {"TERRA": all_days(a, b), "AQUA": all_days(a, b)}
    assert regional_gaps(daily, a, b, active) == {}


def test_off_season_zeros_are_not_a_gap():
    a, b = D(2020, 1, 1), D(2020, 3, 31)
    daily = _season(a, b, terra=2, aqua=0)
    active = {"TERRA": all_days(a, b), "AQUA": all_days(a, b)}
    assert regional_gaps(daily, a, b, active) == {}


OPD = Path(__file__).resolve().parents[2] / "data" / "cube" / "operating_days.parquet"


@pytest.mark.skipif(not OPD.exists(), reason="needs data/cube/operating_days.parquet (run 04_cube.py)")
def test_real_data_contains_known_global_outages():
    import polars as pl
    op = pl.read_parquet(OPD)
    have = {s: set(op.filter(pl.col("stream") == s)["date"].to_list()) for s in ("TERRA", "SNPP")}
    assert not (all_days(D(2001, 6, 16), D(2001, 7, 3)) & have["TERRA"])
    assert not (all_days(D(2022, 7, 27), D(2022, 8, 10)) & have["SNPP"])
    assert D(2001, 6, 15) in have["TERRA"] and D(2022, 8, 11) in have["SNPP"]
