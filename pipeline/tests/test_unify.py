from pathlib import Path

import pytest

HDR_SP = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"
HDR_NRT = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight"
STREAMS = {"modis": ["Terra", "Aqua"], "snpp": ["SNPP"]}


def write(tmp: Path, name: str, header: str, rows: list[str]) -> Path:
    p = tmp / name
    p.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
    return p


def run(unify_mod, con, files, bbox=None):
    counts = unify_mod.unify(con, files, "test", bbox, STREAMS)
    rows = con.execute("SELECT lat, lon, t_utc, solar_date, stream, conf, type, product FROM unified "
                       "ORDER BY t_utc, stream").fetchall()
    return counts, rows


def test_modis_conf_bins_and_streams(tmp_path, unify_mod, con):
    f = write(tmp_path, "m.csv", HDR_SP, [
        "10.0,20.0,300,1,1,2015-01-01,0100,Terra,MODIS,29,6.03,290,5,D,0",
        "10.0,20.1,300,1,1,2015-01-01,0200,Terra,MODIS,30,6.03,290,5,D,0",
        "10.0,20.2,300,1,1,2015-01-01,0300,Aqua,MODIS,79,6.03,290,5,D,0",
        "10.0,20.3,300,1,1,2015-01-01,0400,Aqua,MODIS,80,6.03,290,5,D,2",
    ])
    _, rows = run(unify_mod, con, [(f, "modis", "SP")])
    assert [r[5] for r in rows] == ["L", "N", "N", "H"]
    assert [r[4] for r in rows] == ["TERRA", "TERRA", "AQUA", "AQUA"]
    assert rows[3][6] == 2


def test_viirs_conf_and_nrt_type_null(tmp_path, unify_mod, con):
    f = write(tmp_path, "v.csv", HDR_NRT, ["10.0,20.0,300,1,1,2026-08-02,1200,SNPP,SNPP,h,2.0NRT,290,5,D"])
    _, rows = run(unify_mod, con, [(f, "snpp", "NRT")])
    assert rows[0][4:] == ("SNPP", "H", None, "NRT")


def test_solar_date_crosses_midnight(tmp_path, unify_mod, con):
    # 21:30 UTC at 75°E → +5 h → 02:30 next local solar day
    f = write(tmp_path, "m.csv", HDR_SP, ["30.0,75.0,300,1,1,2015-11-01,2130,Aqua,MODIS,90,6.03,290,5,N,0",
                                         "-20.0,-150.0,300,1,1,2015-11-01,0500,Aqua,MODIS,90,6.03,290,5,N,0"])
    _, rows = run(unify_mod, con, [(f, "modis", "SP")])
    by_lon = {r[1]: str(r[3]) for r in rows}
    assert by_lon[75.0] == "2015-11-02"
    assert by_lon[-150.0] == "2015-10-31"   # 05:00 UTC − 10 h


def test_unknown_satellite_fails(tmp_path, unify_mod, con):
    f = write(tmp_path, "m.csv", HDR_SP, ["10,20,300,1,1,2015-01-01,0100,Sentinel,X,50,1,290,5,D,0"])
    with pytest.raises(unify_mod.UnifyError, match="unknown satellite"):
        run(unify_mod, con, [(f, "modis", "SP")])


def test_satellite_in_wrong_folder_fails(tmp_path, unify_mod, con):
    f = write(tmp_path, "s.csv", HDR_SP, ["10,20,300,1,1,2015-01-01,0100,Terra,MODIS,50,1,290,5,D,0"])
    with pytest.raises(unify_mod.UnifyError, match="unexpected satellites"):
        run(unify_mod, con, [(f, "snpp", "SP")])


def test_unknown_confidence_fails(tmp_path, unify_mod, con):
    f = write(tmp_path, "s.csv", HDR_SP, ["10,20,300,1,1,2015-01-01,0100,SNPP,SNPP,x,2,290,5,D,0"])
    with pytest.raises(unify_mod.UnifyError, match="confidence"):
        run(unify_mod, con, [(f, "snpp", "SP")])


def test_dedupe_prefers_archive(tmp_path, unify_mod, con):
    sp = write(tmp_path, "sp.csv", HDR_SP, [
        "10,20,300,1,1,2026-07-31,0100,SNPP,SNPP,n,2,290,5,D,0",
        "10,20,300,1,1,2026-07-31,0100,SNPP,SNPP,n,2,290,5,D,0",   # exact duplicate
    ])
    nrt = write(tmp_path, "nrt.csv", HDR_NRT, [
        "10,20,300,1,1,2026-07-31,0100,SNPP,SNPP,n,2.0NRT,290,5,D",   # date covered by archive → drop
        "10,21,300,1,1,2026-07-30,0900,SNPP,SNPP,n,2.0NRT,290,5,D",   # covered too (≤ archive end)
        "10,20,300,1,1,2026-08-01,0100,SNPP,SNPP,n,2.0NRT,290,5,D",   # after archive end → keep
    ])
    counts, rows = run(unify_mod, con, [(sp, "snpp", "SP"), (nrt, "snpp", "NRT")])
    assert counts["nrt_overlap_dropped"] == 2
    assert counts["exact_dup_dropped"] == 1
    assert [r[7] for r in rows] == ["SP", "NRT"]


def test_clip_box(tmp_path, unify_mod, con):
    f = write(tmp_path, "m.csv", HDR_SP, ["30,75,300,1,1,2015-01-01,0100,Aqua,MODIS,90,6,290,5,D,0",
                                         "35,75,300,1,1,2015-01-01,0100,Aqua,MODIS,90,6,290,5,D,0"])
    counts, rows = run(unify_mod, con, [(f, "modis", "SP")], bbox=[73.8, 27.6, 77.6, 32.6])
    assert counts["in_box"] == 1 and rows[0][0] == 30
