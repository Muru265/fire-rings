import datetime as dt

import pytest

from conftest import load_step


@pytest.fixture(scope="module")
def mask_mod():
    return load_step("03_mask")


def make_u(con, rows):
    con.execute("CREATE OR REPLACE TEMP TABLE u (h3r9 UBIGINT, solar_date DATE, stream VARCHAR, conf VARCHAR, "
                "type TINYINT, product VARCHAR)")
    con.executemany("INSERT INTO u VALUES (?,?,?,?,?,?)", rows)


def test_persistent_flat_cell_masked_seasonal_cell_kept(con, mask_mod):
    rows = []
    for y in (2015, 2016, 2017):
        # cell 1: 24 days/yr spread over all months → static source (S ≈ 0)
        for m in range(1, 13):
            for d in (1, 15):
                rows.append((1, dt.date(y, m, d), "SNPP", "N", 0, "SP"))
        # cell 2: 20 days/yr all in October → seasonal fire (S = 1)
        for d in range(1, 21):
            rows.append((2, dt.date(y, 10, d), "SNPP", "N", 0, "SP"))
    # cell 3: flat but only 2 years → not persistent enough
    for y in (2015, 2016):
        for m in range(1, 13):
            for d in (1, 15):
                rows.append((3, dt.date(y, m, d), "SNPP", "N", 0, "SP"))
    make_u(con, rows)
    mask_mod.build_masks(con, 16, 3, 0.3)
    assert [r[0] for r in con.execute("SELECT h3r9 FROM persist_cells").fetchall()] == [1]


def test_known_static_applies_to_nrt_and_steps_count(con, mask_mod):
    make_u(con, [
        (5, dt.date(2020, 1, 1), "SNPP", "N", 2, "SP"),    # type 2 → dropped at 'type', marks cell 5 known
        (5, dt.date(2026, 9, 1), "SNPP", "N", None, "NRT"),  # NRT in known cell → dropped at 'known'
        (6, dt.date(2026, 9, 1), "SNPP", "L", None, "NRT"),  # low conf → 'conf'
        (6, dt.date(2026, 9, 2), "SNPP", "N", None, "NRT"),  # kept
    ])
    mask_mod.build_masks(con, 16, 3, 0.3)
    res = mask_mod.apply_filters(con)
    assert res["SNPP/NRT"] == {"in": 3, "conf": 2, "type": 2, "known": 1, "persist": 1}
    assert res["SNPP/SP"] == {"in": 1, "conf": 1, "type": 0, "known": 0, "persist": 0}
    assert con.execute("SELECT count(*) FROM kept").fetchone()[0] == 1
