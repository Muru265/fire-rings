"""04 — H3 r6 daily presence → monthly fire cell-days per stream, with coverage adjustment.

Input  data/clean/{region}_filtered.parquet, raw CSVs (for the operating-days proxy)
Output data/cube/operating_days.parquet   (stream, date) days each satellite delivered ≥1 detection anywhere
       data/cube/{region}_monthly.parquet  region, y, m, stream, C, C_adj, hot, D, O, cov, flag
       data/cube/{region}_daily.parquet    date, stream, cells, hot
       data/cube/{region}_cellmonth.parquet h3r6, y, m, stream, n_days, hot  (for area filtering / maps)

Streams: TERRA, AQUA, MODIS (= Terra ∪ Aqua cell-days), SNPP, N20, N21.
C = number of distinct (H3 r6 cell, solar day) pairs with ≥1 kept detection in the month.

Operating-days proxy: a stream is "operating" on a UTC date if it has ≥1 detection (any confidence/type) in ANY of
the raw files (Australia + India + Madagascar + Mauritius, whole files). Large land areas always have some
detection, so a day with none anywhere is an outage. Small regions alone can't separate outage from "no fire".
Usage: python pipeline/04_cube.py [region ...]
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import config, connect, data_end, path, sql_path, write_json  # noqa: E402
from lib.coverage import adjust, days_covered, regional_gaps  # noqa: E402

STREAM_OF_SAT = {"Terra": "TERRA", "Aqua": "AQUA", "SNPP": "SNPP", "N20": "N20", "N21": "N21"}
STREAMS = ["TERRA", "AQUA", "MODIS", "SNPP", "N20", "N21"]
AQUA_FIRST = dt.date(2002, 7, 4)


def operating_days(con, raw: Path, out: Path) -> pl.DataFrame:
    """Recomputed every run (a few seconds) so new NRT/API files are always included."""
    files = sorted(raw.glob("*/*/fire_*.csv")) + sorted((raw.parent / "raw_api").glob("*/*/fire_*.csv"))
    union = " UNION ".join(
        f"SELECT DISTINCT satellite, CAST(acq_date AS DATE) d FROM read_csv('{sql_path(f)}', all_varchar=true)"
        for f in files)
    case = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in STREAM_OF_SAT.items())
    df = con.sql(f"SELECT DISTINCT CASE satellite {case} END stream, d date FROM ({union}) ORDER BY 1,2").pl()
    df.write_parquet(out)
    return df


FIRST_DAY = {"TERRA": dt.date(2000, 11, 1), "AQUA": AQUA_FIRST, "SNPP": dt.date(2012, 1, 20),
             "N20": dt.date(2018, 4, 1), "N21": dt.date(2023, 3, 1)}


def global_outages(op: pl.DataFrame, data_end: dt.date, min_len: int = 5) -> dict:
    """Runs of ≥ min_len consecutive days with no detection anywhere, within each stream's lifetime."""
    res = {}
    for s, first in FIRST_DAY.items():
        days = sorted(op.filter(pl.col("stream") == s)["date"].to_list())
        last = days[-1] if days else data_end
        have = set(days)
        runs, d = [], first
        while d <= last:
            if d not in have:
                e = d
                while e + dt.timedelta(1) <= last and (e + dt.timedelta(1)) not in have:
                    e += dt.timedelta(1)
                if (e - d).days + 1 >= min_len:
                    runs.append([str(d), str(e), (e - d).days + 1])
                d = e
            d += dt.timedelta(1)
        if runs:
            res[s] = runs
    return res


def build(con, region: str, op: pl.DataFrame, data_end: dt.date, min_ratio: float, cube: Path) -> dict:
    src = sql_path(path("clean") / f"{region}_filtered.parquet")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE pres AS
        SELECT stream, solar_date d, h3r6, count(*) hot FROM '{src}' GROUP BY ALL
        UNION ALL
        SELECT 'MODIS', solar_date, h3r6, count(*) FROM '{src}' WHERE stream IN ('TERRA','AQUA') GROUP BY ALL""")
    daily = con.sql("""
        SELECT d date, stream, count(*) cells, sum(hot) hot FROM pres GROUP BY ALL ORDER BY 1,2""").pl()
    daily.write_parquet(cube / f"{region}_daily.parquet")
    con.execute(f"""COPY (SELECT h3r6, year(d) y, month(d) m, stream, count(*) n_days, sum(hot) hot
                         FROM pres GROUP BY ALL) TO '{sql_path(cube / (region + '_cellmonth.parquet'))}' (FORMAT parquet)""")
    monthly = con.sql("""
        SELECT year(d) y, month(d) m, stream, count(*) C, sum(hot) hot FROM pres GROUP BY ALL""").pl()

    # full month grid × stream, so zero months exist explicitly
    start = dt.date(2000, 11, 1)
    months = []
    y, m = start.year, start.month
    while dt.date(y, m, 1) <= data_end:
        months.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    opsets = {s: set(op.filter(pl.col("stream") == s)["date"].to_list()) for s in STREAM_OF_SAT.values()}
    # region-specific data gaps (e.g. Aqua over Madagascar, Aug 2020): remove from this region's operating days
    raw_daily = con.sql(f"""SELECT stream, solar_date d, count(*) n FROM '{sql_path(path("clean") / (region + ".parquet"))}'
                            GROUP BY ALL""").fetchall()
    dd: dict[str, dict[dt.date, int]] = {}
    for s, d, n in raw_daily:
        dd.setdefault(s, {})[d] = n
    gaps = regional_gaps(dd, start, data_end, opsets)
    for s, runs in gaps.items():
        for a, b in runs:
            opsets[s] = opsets[s] - {a + dt.timedelta(i) for i in range((b - a).days + 1)}

    def o_days(stream: str, y: int, m: int) -> float:
        d = days_covered(y, m, data_end)
        days = [dt.date(y, m, 1) + dt.timedelta(i) for i in range(d)]
        if stream != "MODIS":
            return sum(x in opsets[stream] for x in days)
        o_t = sum(x in opsets["TERRA"] for x in days)
        if dt.date(y, m, 1) < AQUA_FIRST.replace(day=1):
            return o_t
        o_a = sum(x in opsets["AQUA"] for x in days)
        return (o_t + o_a) / 2

    lookup = {(r["y"], r["m"], r["stream"]): (r["C"], r["hot"]) for r in monthly.iter_rows(named=True)}
    rows = []
    for (y, m) in months:
        D = days_covered(y, m, data_end)
        for s in STREAMS:
            C, hot = lookup.get((y, m, s), (0, 0))
            O = o_days(s, y, m)
            c_adj, cov, flag = adjust(C, D, O, min_ratio)
            rows.append({"region": region, "y": y, "m": m, "stream": s, "C": C, "C_adj": c_adj, "hot": hot,
                         "D": D, "O": O, "cov": round(cov, 4), "flag": flag})
    out = pl.DataFrame(rows, schema_overrides={"C_adj": pl.Float64, "O": pl.Float64, "flag": pl.Utf8})
    out.write_parquet(cube / f"{region}_monthly.parquet")
    flags = out.filter(pl.col("flag").is_not_null() & (pl.col("O") > 0))
    global_gaps = global_outages(op, data_end)
    return {"months": len(months),
            "regional_gaps": {s: [[str(a), str(b), (b - a).days + 1] for a, b in r] for s, r in gaps.items()},
            "global_outages": global_gaps,
            "cell_days_total": {s: int(out.filter(pl.col("stream") == s)["C"].sum()) for s in STREAMS},
            "insufficient": [f"{r['y']}-{r['m']:02d} {r['stream']} cov={r['cov']}" for r in
                             flags.filter(pl.col("flag") == "insufficient").iter_rows(named=True)],
            "adjusted_months": int(out.filter((pl.col("cov") < 1) & pl.col("flag").is_null()).height)}


def main(regions: list[str]) -> None:
    cfg = config()
    cube, out = path("cube"), path("out")
    con = connect()
    op = operating_days(con, path("raw"), cube / "operating_days.parquet")
    print("operating days per stream:", dict(op.group_by("stream").len().sort("stream").iter_rows()))
    for region in regions or list(cfg["regions"]):
        summ = build(con, region, op, data_end(region), cfg["cube"]["coverage_min_ratio"], cube)
        summ["data_end"] = str(data_end(region))
        write_json(out / f"cube_{region}.json", summ)
        print(f"{region:<13} months={summ['months']} adjusted={summ['adjusted_months']} "
              f"insufficient={len(summ['insufficient'])} cell-days={summ['cell_days_total']}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
